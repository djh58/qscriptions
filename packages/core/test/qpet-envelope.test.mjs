import assert from "node:assert/strict";
import test from "node:test";

import { QPET_LIMITS, decodeQpetEnvelope } from "../dist/index.js";
import {
  TEST_SHEET,
  encodeEnvelope,
  expectError,
  manifestFor,
  unwrap,
} from "./helpers.mjs";

test("envelope framing rejects wrong types and the exact size n+1", async () => {
  const wrongType = expectError(
    await decodeQpetEnvelope("QPET"),
    "INVALID_INPUT",
    "input",
  );
  assert.equal(wrongType.diagnostic, "envelope must be a Uint8Array");

  const maximum = 7 + QPET_LIMITS.manifestBytes + QPET_LIMITS.sheetBytes;
  expectError(
    await decodeQpetEnvelope(new Uint8Array(maximum + 1)),
    "ENVELOPE_TOO_LARGE",
    "envelope",
  );
});

test("the seven-byte header enforces n-1/n and every magic byte", async () => {
  for (const length of [0, 1, 5, 6]) {
    expectError(
      await decodeQpetEnvelope(new Uint8Array(length)),
      "TRUNCATED_QPET_ENVELOPE",
      "envelope",
    );
  }

  for (let index = 0; index < 4; index += 1) {
    const envelope = Uint8Array.of(0x51, 0x50, 0x45, 0x54, 0x01, 0x01, 0x00, 0x7b);
    envelope[index] ^= 0xff;
    expectError(await decodeQpetEnvelope(envelope), "INVALID_QPET_MAGIC", "envelope");
  }

  const wrongVersion = Uint8Array.of(0x51, 0x50, 0x45, 0x54, 0x02, 0x01, 0x00, 0x7b);
  const error = expectError(
    await decodeQpetEnvelope(wrongVersion),
    "UNSUPPORTED_QPET_VERSION",
    "envelope",
  );
  assert.equal(error.diagnostic, "version 2");
});

test("manifest length zero and n-1 truncation fail before JSON parsing", async () => {
  expectError(
    await decodeQpetEnvelope(Uint8Array.of(0x51, 0x50, 0x45, 0x54, 0x01, 0x00, 0x00)),
    "TRUNCATED_QPET_MANIFEST",
    "envelope",
  );
  expectError(
    await decodeQpetEnvelope(
      Uint8Array.of(0x51, 0x50, 0x45, 0x54, 0x01, 0x02, 0x00, 0x7b),
    ),
    "TRUNCATED_QPET_MANIFEST",
    "envelope",
  );
});

test("the u16 manifest ceiling accepts max-1 and max bytes", async () => {
  const manifest = manifestFor();
  const compact = JSON.stringify(manifest);
  for (const length of [QPET_LIMITS.manifestBytes - 1, QPET_LIMITS.manifestBytes]) {
    const rawJson = compact + " ".repeat(length - new TextEncoder().encode(compact).length);
    const artifact = unwrap(
      await decodeQpetEnvelope(encodeEnvelope(manifest, TEST_SHEET, rawJson)),
    );
    assert.equal(artifact.manifest.id, "test-pet");
  }
});

test("manifest decoding is strict UTF-8 with no BOM", async () => {
  const invalidUtf8 = encodeEnvelope(manifestFor(), TEST_SHEET, "{}");
  invalidUtf8[7] = 0xff;
  expectError(
    await decodeQpetEnvelope(invalidUtf8),
    "INVALID_MANIFEST_UTF8",
    "manifest",
  );

  const bomJson = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]);
  const envelope = new Uint8Array(7 + bomJson.length + TEST_SHEET.length);
  envelope.set([0x51, 0x50, 0x45, 0x54, 0x01, bomJson.length, 0x00]);
  envelope.set(bomJson, 7);
  envelope.set(TEST_SHEET, 7 + bomJson.length);
  expectError(await decodeQpetEnvelope(envelope), "INVALID_MANIFEST_JSON", "manifest");
});

test("invalid JSON constants and syntax are rejected", async () => {
  for (const rawJson of ["{", "null trailing", '{"format":NaN}', '{"format":Infinity}']) {
    expectError(
      await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
      "INVALID_MANIFEST_JSON",
      "manifest",
    );
  }
});

test("duplicate keys preserve the historical Python last-value-wins behavior", async () => {
  const canonical = JSON.stringify(manifestFor());
  const nested = "[".repeat(80) + "null" + "]".repeat(80);
  const variants = [
    canonical.replace(
      '"displayName":"Test Pet"',
      '"displayName":null,"displayName":"Test Pet"',
    ),
    canonical.replace('"id":"test-pet"', '"id":null,"\\u0069d":"test-pet"'),
    canonical.replace('"row":0', '"row":2.0,"row":0'),
    canonical.replace(
      '"description":"A valid non-Genesis test pet."',
      `"description":${nested},"description":"A valid non-Genesis test pet."`,
    ),
    canonical.replace(
      '"displayName":"Test Pet"',
      '"displayName":"\\ud800","displayName":"Test Pet"',
    ),
  ];
  for (const rawJson of variants) {
    const artifact = unwrap(
      await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
    );
    assert.equal(artifact.manifest.id, "test-pet");
    assert.equal(artifact.manifest.displayName, "Test Pet");
    assert.equal(artifact.manifest.states[0].row, 0);
  }

  const invalidFinal = canonical.replace(
    '"displayName":"Test Pet"',
    '"displayName":"Test Pet","displayName":null',
  );
  expectError(
    await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, invalidFinal)),
    "INVALID_MANIFEST_SCHEMA",
    "manifest",
  );
});

test("lone escaped surrogates fail while a scalar pair remains valid", async () => {
  for (const escape of ["\\ud800", "\\udfff", "\\ud800x"]) {
    const rawJson = JSON.stringify(manifestFor()).replace("Test Pet", escape);
    expectError(
      await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
      "INVALID_MANIFEST_SCHEMA",
      "manifest",
    );
  }

  const invalidKey = '{"\\ud800":true}';
  expectError(
    await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, invalidKey)),
    "INVALID_MANIFEST_SCHEMA",
    "manifest",
  );

  const paired = JSON.stringify(manifestFor()).replace("Test Pet", "\\ud83d\\udfe2");
  const artifact = unwrap(
    await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, paired)),
  );
  assert.equal(artifact.manifest.displayName, "🟢");
});

test("surviving numeric fields require Python-compatible integer JSON syntax", async () => {
  const decimal = JSON.stringify(manifestFor()).replace('"width":2', '"width":2.0');
  const exponent = JSON.stringify(manifestFor()).replace('"width":2', '"width":2e0');
  const infinite = JSON.stringify(manifestFor()).replace('"width":2', '"width":1e999');
  const underflow = JSON.stringify(manifestFor()).replace('"row":0', '"row":1e-324');
  for (const rawJson of [decimal, exponent, infinite, underflow]) {
    expectError(
      await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
      "INVALID_MANIFEST_SCHEMA",
      "manifest",
    );
  }

  const negativeZero = JSON.stringify(manifestFor()).replace('"row":0', '"row":-0');
  const artifact = unwrap(
    await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, negativeZero)),
  );
  assert.equal(artifact.manifest.states[0].row, 0);
  assert.equal(Object.is(artifact.manifest.states[0].row, -0), false);
});

test("deep shadowed JSON remains compatible while a surviving unknown field fails schema", async () => {
  const nested = "[".repeat(256) + "null" + "]".repeat(256);
  const canonical = JSON.stringify(manifestFor());
  const shadowed = canonical.replace(
    '"description":"A valid non-Genesis test pet."',
    `"description":${nested},"description":"A valid non-Genesis test pet."`,
  );
  assert.equal(
    (
      await decodeQpetEnvelope(
        encodeEnvelope(manifestFor(), TEST_SHEET, shadowed),
      )
    ).ok,
    true,
  );

  const rawJson = `{"extra":${nested}}`;
  expectError(
    await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
    "INVALID_MANIFEST_SCHEMA",
    "manifest",
  );
});

test("valid JSON whitespace, escapes, empty containers, and primitives reach schema validation", async () => {
  for (const rawJson of [
    " { \"extra\" : [ ] } ",
    "{\n\t\"extra\" : { }\r}",
    '{"extra":"line\\nquote\\\""}',
    "true",
    "null",
  ]) {
    expectError(
      await decodeQpetEnvelope(encodeEnvelope(manifestFor(), TEST_SHEET, rawJson)),
      "INVALID_MANIFEST_SCHEMA",
      "manifest",
    );
  }
});

test("a verified body digest is mandatory", async () => {
  const manifest = manifestFor();
  manifest.sheet.sha256 = "0".repeat(64);
  expectError(
    await decodeQpetEnvelope(encodeEnvelope(manifest)),
    "SPRITESHEET_HASH_MISMATCH",
    "body",
  );
});
