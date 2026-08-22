import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";

import {
  QPET_LIMITS,
  decodeQpetEnvelope,
  decodeQpetOpReturn,
  extractQpetEnvelope,
} from "../dist/index.js";
import {
  TEST_SHEET,
  encodeEnvelope,
  expectError,
  manifestFor,
  pushScript,
  unwrap,
} from "./helpers.mjs";

test("legacy extraction accepts direct, PUSHDATA1, PUSHDATA2, and PUSHDATA4", () => {
  const qpet = new TextEncoder().encode("QPET");
  for (const form of ["direct", "pushdata1", "pushdata2", "pushdata4"]) {
    assert.deepEqual(unwrap(extractQpetEnvelope(pushScript(qpet, form))), qpet);
  }
});

test("push-length boundaries do not acquire a future minimal-push rule", () => {
  for (const length of [0, 1, 74, 75]) {
    const payload = new Uint8Array(length);
    assert.deepEqual(unwrap(extractQpetEnvelope(pushScript(payload, "direct"))), payload);
  }
  for (const length of [0, 1, 75, 76, 254, 255]) {
    const payload = new Uint8Array(length);
    assert.deepEqual(unwrap(extractQpetEnvelope(pushScript(payload, "pushdata1"))), payload);
  }
  for (const length of [255, 256, 257, 65_534, 65_535]) {
    const payload = new Uint8Array(length);
    assert.deepEqual(unwrap(extractQpetEnvelope(pushScript(payload, "pushdata2"))), payload);
  }
  for (const length of [65_535, 65_536, 65_537]) {
    const payload = new Uint8Array(length);
    assert.deepEqual(unwrap(extractQpetEnvelope(pushScript(payload, "pushdata4"))), payload);
  }
});

test("script framing rejects wrong types, non-OP_RETURN, and absent pushes", () => {
  expectError(extractQpetEnvelope(null), "INVALID_INPUT", "input");
  expectError(
    extractQpetEnvelope(new DataView(new ArrayBuffer(2))),
    "INVALID_INPUT",
    "input",
  );
  expectError(extractQpetEnvelope(new Uint8Array()), "NOT_OP_RETURN", "script");
  expectError(extractQpetEnvelope(Uint8Array.of(0x00, 0x00)), "NOT_OP_RETURN", "script");
  expectError(extractQpetEnvelope(Uint8Array.of(0x6a)), "MISSING_DATA_PUSH", "script");
});

test("the byte snapshot accepts cross-realm Uint8Array and rejects detached or forged views", async () => {
  const foreign = runInNewContext("new Uint8Array([0x6a, 0])");
  assert.deepEqual(unwrap(extractQpetEnvelope(foreign)), new Uint8Array());

  const forged = new DataView(new ArrayBuffer(2));
  Object.defineProperty(forged, Symbol.toStringTag, { value: "Uint8Array" });
  expectError(extractQpetEnvelope(forged), "INVALID_INPUT", "input");

  const detachedScript = Uint8Array.of(0x6a, 0x00);
  structuredClone(detachedScript.buffer, { transfer: [detachedScript.buffer] });
  expectError(extractQpetEnvelope(detachedScript), "INVALID_INPUT", "input");

  const detachedEnvelope = Uint8Array.of(0x51, 0x50, 0x45, 0x54);
  structuredClone(detachedEnvelope.buffer, { transfer: [detachedEnvelope.buffer] });
  expectError(await decodeQpetEnvelope(detachedEnvelope), "INVALID_INPUT", "input");
});

test("every pushdata length field rejects n-1 truncation", () => {
  const cases = [
    Uint8Array.of(0x6a, 0x4c),
    Uint8Array.of(0x6a, 0x4d),
    Uint8Array.of(0x6a, 0x4d, 0x01),
    Uint8Array.of(0x6a, 0x4e),
    Uint8Array.of(0x6a, 0x4e, 0x01),
    Uint8Array.of(0x6a, 0x4e, 0x01, 0x00),
    Uint8Array.of(0x6a, 0x4e, 0x01, 0x00, 0x00),
  ];
  for (const script of cases) {
    expectError(extractQpetEnvelope(script), "TRUNCATED_PUSHDATA_LENGTH", "script");
  }
});

test("unexpected opcodes, short payloads, and trailing pushes fail closed", () => {
  const unsupported = expectError(
    extractQpetEnvelope(Uint8Array.of(0x6a, 0x4f)),
    "UNSUPPORTED_SCRIPT_OPCODE",
    "script",
  );
  assert.equal(unsupported.diagnostic, "opcode 4f");

  for (const script of [
    Uint8Array.of(0x6a, 0x02, 0x51),
    Uint8Array.of(0x6a, 0x4c, 0x02, 0x51),
    Uint8Array.of(0x6a, 0x4d, 0x02, 0x00, 0x51),
    Uint8Array.of(0x6a, 0x4e, 0x02, 0x00, 0x00, 0x00, 0x51),
  ]) {
    expectError(extractQpetEnvelope(script), "TRUNCATED_OP_RETURN_PAYLOAD", "script");
  }

  expectError(
    extractQpetEnvelope(Uint8Array.of(0x6a, 0x01, 0x51, 0x01, 0x52)),
    "TRAILING_SCRIPT_DATA",
    "script",
  );
});

test("the script cap is enforced before parsing", () => {
  const maximumEnvelope = 7 + QPET_LIMITS.manifestBytes + QPET_LIMITS.sheetBytes;
  const oversized = new Uint8Array(6 + maximumEnvelope + 1);
  expectError(extractQpetEnvelope(oversized), "SCRIPT_TOO_LARGE", "script");
});

test("the combined entry point returns script errors and decodes a valid script", async () => {
  expectError(await decodeQpetOpReturn(Uint8Array.of(0x00)), "NOT_OP_RETURN", "script");

  const envelope = encodeEnvelope(manifestFor(), TEST_SHEET);
  const artifact = unwrap(await decodeQpetOpReturn(pushScript(envelope, "pushdata2")));
  assert.equal(artifact.manifest.id, "test-pet");
  assert.equal(artifact.bodyLength, TEST_SHEET.byteLength);
});
