import assert from "node:assert/strict";
import test from "node:test";

import { QPET_LIMITS, decodeQpetEnvelope } from "../dist/index.js";
import {
  TEST_SHEET,
  encodeEnvelope,
  expectError,
  manifestFor,
  sha256,
  unwrap,
} from "./helpers.mjs";

async function decode(manifest, sheet = TEST_SHEET) {
  return decodeQpetEnvelope(encodeEnvelope(manifest, sheet));
}

test("the root schema requires an object with exactly the frozen v1 fields", async () => {
  for (const value of [null, [], "pet", 1]) {
    expectError(await decode(value), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  const missing = manifestFor();
  delete missing.author;
  expectError(await decode(missing), "INVALID_MANIFEST_SCHEMA", "manifest");

  const extra = manifestFor();
  extra.extension = true;
  expectError(await decode(extra), "INVALID_MANIFEST_SCHEMA", "manifest");

  const format = manifestFor();
  format.format = "codex-pet-v2";
  expectError(await decode(format), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("all manifest string byte bounds enforce n-1/n/n+1", async () => {
  const fields = [
    ["id", 64, false],
    ["displayName", 120, false],
    ["description", 2000, true],
    ["kind", 64, false],
    ["author", 120, false],
  ];

  for (const [field, maximum, allowEmpty] of fields) {
    for (const length of [maximum - 1, maximum]) {
      const manifest = manifestFor();
      manifest[field] = "a".repeat(length);
      assert.equal((await decode(manifest)).ok, true, `${field} ${length}`);
    }
    const over = manifestFor();
    over[field] = "a".repeat(maximum + 1);
    expectError(await decode(over), "INVALID_MANIFEST_SCHEMA", "manifest");

    const empty = manifestFor();
    empty[field] = "";
    assert.equal(
      (await decode(empty)).ok,
      allowEmpty,
      `${field} empty allowance should match the Python oracle`,
    );

    const wrongType = manifestFor();
    wrongType[field] = 7;
    expectError(await decode(wrongType), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  const utf8 = manifestFor();
  utf8.id = "🟢".repeat(16);
  assert.equal((await decode(utf8)).ok, true);
  utf8.id += "a";
  expectError(await decode(utf8), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("frame fields and integer minima enforce n-1/n/n+1", async () => {
  for (const frame of [null, [], { width: 2, height: 3, columns: 2 }]) {
    const manifest = manifestFor();
    manifest.frame = frame;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }
  const extra = manifestFor();
  extra.frame.extension = 1;
  expectError(await decode(extra), "INVALID_MANIFEST_SCHEMA", "manifest");

  for (const field of ["width", "height", "columns", "rows"]) {
    for (const value of [0, true, 1.5]) {
      const manifest = manifestFor();
      manifest.frame[field] = value;
      expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
    }
    const minimum = manifestFor();
    minimum.frame[field] = 1;
    if (field === "columns") minimum.states[0].frames = 1;
    if (field === "rows") minimum.states[1].row = 0;
    assert.equal((await decode(minimum)).ok, true, `${field}=1`);
    const above = manifestFor();
    above.frame[field] = 2;
    assert.equal((await decode(above)).ok, true, `${field}=2`);
  }
});

test("frame scalar and multiplied ceilings enforce n-1/n/n+1", async () => {
  for (const field of ["width", "height"]) {
    for (const value of [4095, 4096]) {
      const manifest = manifestFor();
      manifest.frame[field] = value;
      assert.equal((await decode(manifest)).ok, true, `${field}=${value}`);
    }
    const manifest = manifestFor();
    manifest.frame[field] = 4097;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  for (const field of ["columns", "rows"]) {
    for (const value of [255, 256]) {
      const manifest = manifestFor();
      manifest.frame[field] = value;
      if (field === "columns") manifest.frame.width = 1;
      if (field === "rows") manifest.frame.height = 1;
      assert.equal((await decode(manifest)).ok, true, `${field}=${value}`);
    }
    const manifest = manifestFor();
    manifest.frame[field] = 257;
    if (field === "columns") manifest.frame.width = 1;
    if (field === "rows") manifest.frame.height = 1;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  for (const [dimension, count] of [
    ["width", "columns"],
    ["height", "rows"],
  ]) {
    for (const [product, factor, multiplier] of [
      [32767, 217, 151],
      [32768, 4096, 8],
    ]) {
      const manifest = manifestFor();
      manifest.frame[dimension] = factor;
      manifest.frame[count] = multiplier;
      assert.equal((await decode(manifest)).ok, true, `${dimension} product ${product}`);
    }
    const manifest = manifestFor();
    manifest.frame[dimension] = 3641;
    manifest.frame[count] = 9;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }
});

test("animation table count enforces 0/1/32/33", async () => {
  for (const value of [null, {}, "states"]) {
    const manifest = manifestFor();
    manifest.states = value;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  const empty = manifestFor();
  empty.states = [];
  expectError(await decode(empty), "INVALID_MANIFEST_SCHEMA", "manifest");

  for (const count of [1, 32]) {
    const manifest = manifestFor();
    manifest.states = Array.from({ length: count }, (_, index) => ({
      id: `state-${index}`,
      row: index % 2,
      frames: 1,
      fps: 1,
      loop: index % 2 === 0,
    }));
    assert.equal((await decode(manifest)).ok, true, `states=${count}`);
  }

  const over = manifestFor();
  over.states = Array.from({ length: QPET_LIMITS.states + 1 }, (_, index) => ({
    id: `state-${index}`,
    row: 0,
    frames: 1,
    fps: 1,
    loop: true,
  }));
  expectError(await decode(over), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("each animation state has exact fields", async () => {
  for (const state of [null, [], "idle"]) {
    const manifest = manifestFor();
    manifest.states[0] = state;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }
  const missing = manifestFor();
  delete missing.states[0].fps;
  expectError(await decode(missing), "INVALID_MANIFEST_SCHEMA", "manifest");
  const extra = manifestFor();
  extra.states[0].column = 0;
  expectError(await decode(extra), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("state IDs enforce UTF-8 bounds and uniqueness", async () => {
  for (const length of [63, 64]) {
    const manifest = manifestFor();
    manifest.states[0].id = "a".repeat(length);
    assert.equal((await decode(manifest)).ok, true);
  }
  for (const id of ["", "a".repeat(65), 7]) {
    const manifest = manifestFor();
    manifest.states[0].id = id;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }
  const duplicate = manifestFor();
  duplicate.states[1].id = duplicate.states[0].id;
  expectError(await decode(duplicate), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("state row, frames, and fps enforce n-1/n/n+1 and booleans", async () => {
  const cases = [
    ["row", [-1, 0, 1, 2, true]],
    ["frames", [0, 1, 2, 3, true]],
    ["fps", [0, 1, 59, 60, 61, true]],
  ];
  for (const [field, values] of cases) {
    for (const value of values) {
      const manifest = manifestFor();
      manifest.states[0][field] = value;
      const valid =
        field === "row"
          ? Number.isInteger(value) && value >= 0 && value < 2
          : field === "frames"
            ? Number.isInteger(value) && value >= 1 && value <= 2
            : Number.isInteger(value) && value >= 1 && value <= 60;
      assert.equal((await decode(manifest)).ok, valid, `${field}=${value}`);
    }
  }

  for (const loop of [true, false]) {
    const manifest = manifestFor();
    manifest.states[0].loop = loop;
    assert.equal((await decode(manifest)).ok, true);
  }
  const badLoop = manifestFor();
  badLoop.states[0].loop = 1;
  expectError(await decode(badLoop), "INVALID_MANIFEST_SCHEMA", "manifest");
});

test("spritesheet size enforces 0/1/max/max+1", async () => {
  const empty = new Uint8Array();
  const emptyManifest = manifestFor(empty);
  expectError(await decode(emptyManifest, empty), "INVALID_SPRITESHEET_SIZE", "body");

  const one = Uint8Array.of(0x00);
  assert.equal((await decode(manifestFor(one), one)).ok, true);

  const maximum = new Uint8Array(QPET_LIMITS.sheetBytes);
  const maximumManifest = manifestFor(maximum);
  assert.equal((await decode(maximumManifest, maximum)).ok, true);

  const over = new Uint8Array(QPET_LIMITS.sheetBytes + 1);
  const overManifest = manifestFor(over);
  expectError(await decode(overManifest, over), "INVALID_SPRITESHEET_SIZE", "body");
});

test("spritesheet declaration is exact and self-consistent", async () => {
  for (const sheet of [null, [], { contentType: "image/webp" }]) {
    const manifest = manifestFor();
    manifest.sheet = sheet;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }
  const extra = manifestFor();
  extra.sheet.path = "sheet.webp";
  expectError(await decode(extra), "INVALID_MANIFEST_SCHEMA", "manifest");

  const mutations = [
    ["contentType", "image/png"],
    ["length", TEST_SHEET.byteLength - 1],
    ["length", TEST_SHEET.byteLength + 1],
    ["length", true],
    ["sha256", "0".repeat(63)],
    ["sha256", "g".repeat(64)],
    ["sha256", 7],
  ];
  for (const [field, value] of mutations) {
    const manifest = manifestFor();
    manifest.sheet[field] = value;
    expectError(await decode(manifest), "INVALID_MANIFEST_SCHEMA", "manifest");
  }

  const uppercase = manifestFor();
  uppercase.sheet.sha256 = uppercase.sheet.sha256.toUpperCase();
  const artifact = unwrap(await decode(uppercase));
  assert.equal(artifact.bodySha256, sha256(TEST_SHEET));
  assert.equal(artifact.manifest.sheet.sha256, sha256(TEST_SHEET));
});
