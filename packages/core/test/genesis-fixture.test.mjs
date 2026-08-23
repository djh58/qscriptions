import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeQpetEnvelope, decodeQpetOpReturn } from "../dist/index.js";
import {
  TEST_SHEET,
  encodeEnvelope,
  manifestFor,
  pushScript,
  sha256,
  unwrap,
} from "./helpers.mjs";

const fixture = new URL("../../../fixtures/qpet/", import.meta.url);
const GENESIS_ENVELOPE_SHA256 =
  "e9a9ce232eeee3657e87053edf27b0b1f5493c9111d9a37c41fc5cdb85a24247";
const GENESIS_SHEET_SHA256 =
  "8ea6a2514e745bc4393f9a46cb37d207c2448c716e331143cb80ba14b0654333";

async function genesisFixture() {
  const [manifestText, sheet] = await Promise.all([
    readFile(new URL("manifest.json", fixture), "utf8"),
    readFile(new URL("spritesheet.webp", fixture)),
  ]);
  const manifest = JSON.parse(manifestText);
  return {
    manifest,
    sheet: Uint8Array.from(sheet),
    envelope: encodeEnvelope(manifest, sheet, manifestText.trim()),
  };
}

test("the repository fixture is exactly the historical Python-built envelope", async () => {
  const { manifest, sheet, envelope } = await genesisFixture();
  assert.equal(new TextEncoder().encode(JSON.stringify(manifest)).byteLength, 925);
  assert.equal(sheet.byteLength, 8_616);
  assert.equal(envelope.byteLength, 9_548);
  assert.equal(sha256(sheet), GENESIS_SHEET_SHA256);
  assert.equal(sha256(envelope), GENESIS_ENVELOPE_SHA256);

  const pet = JSON.parse(await readFile(new URL("pet.json", fixture), "utf8"));
  assert.equal(manifest.id, pet.id);
  assert.equal(manifest.displayName, pet.displayName);
  assert.equal(manifest.description, pet.description);
  assert.deepEqual(manifest.frame, pet.frame);
});

test("Genesis normalizes to the exact generic artifact and nine-state table", async () => {
  const { sheet, envelope } = await genesisFixture();
  const artifact = unwrap(await decodeQpetEnvelope(envelope));

  assert.equal(artifact.wireFormat, "QPET");
  assert.equal(artifact.wireVersion, 1);
  assert.equal(artifact.profile, "legacy/qpet-v1");
  assert.equal(artifact.contentId, `qscr:sha256:${GENESIS_ENVELOPE_SHA256}`);
  assert.equal(artifact.bodyLength, 8_616);
  assert.equal(artifact.bodySha256, GENESIS_SHEET_SHA256);
  assert.deepEqual(artifact.hashes, {
    envelopeSha256: GENESIS_ENVELOPE_SHA256,
    sheetSha256: GENESIS_SHEET_SHA256,
  });
  assert.deepEqual(artifact.manifest.frame, {
    width: 192,
    height: 208,
    columns: 8,
    rows: 9,
  });
  assert.deepEqual(
    artifact.manifest.states,
    [
      ["idle", 0, 6, 6, true],
      ["running-right", 1, 8, 12, true],
      ["running-left", 2, 8, 12, true],
      ["waving", 3, 4, 5, false],
      ["jumping", 4, 5, 14, false],
      ["failed", 5, 8, 6, false],
      ["waiting", 6, 6, 4, true],
      ["running", 7, 6, 12, true],
      ["review", 8, 6, 6, true],
    ].map(([id, row, frames, fps, loop]) => ({ id, row, frames, fps, loop })),
  );
  assert.equal(artifact.manifest.sheet.contentType, "image/webp");
  assert.equal(artifact.manifest.sheet.length, sheet.byteLength);
});

test("the normalized artifact is deeply immutable and byte getters are defensive", async () => {
  const { envelope } = await genesisFixture();
  const artifact = unwrap(await decodeQpetEnvelope(envelope));

  assert.ok(Object.isFrozen(artifact));
  assert.ok(Object.isFrozen(artifact.hashes));
  assert.ok(Object.isFrozen(artifact.manifest));
  assert.ok(Object.isFrozen(artifact.manifest.frame));
  assert.ok(Object.isFrozen(artifact.manifest.states));
  assert.ok(artifact.manifest.states.every(Object.isFrozen));
  assert.ok(Object.isFrozen(artifact.manifest.sheet));

  const firstEnvelope = artifact.envelopeBytes;
  const firstBody = artifact.bodyBytes;
  firstEnvelope.fill(0);
  firstBody.fill(0);
  assert.equal(sha256(artifact.envelopeBytes), GENESIS_ENVELOPE_SHA256);
  assert.equal(sha256(artifact.bodyBytes), GENESIS_SHEET_SHA256);
  assert.notStrictEqual(artifact.envelopeBytes, artifact.envelopeBytes);
  assert.notStrictEqual(artifact.bodyBytes, artifact.bodyBytes);
});

test("input mutation cannot race the asynchronous digest", async () => {
  const { envelope } = await genesisFixture();
  const pending = decodeQpetEnvelope(envelope);
  envelope.fill(0);
  const artifact = unwrap(await pending);
  assert.equal(artifact.hashes.envelopeSha256, GENESIS_ENVELOPE_SHA256);
});

test("the exact Genesis PUSHDATA2 and PUSHDATA4 scripts decode without pinning identity", async () => {
  const { envelope } = await genesisFixture();
  const genesis = unwrap(await decodeQpetOpReturn(pushScript(envelope, "pushdata2")));
  const genesisPushdata4 = unwrap(
    await decodeQpetOpReturn(pushScript(envelope, "pushdata4")),
  );

  const otherEnvelope = encodeEnvelope(manifestFor(), TEST_SHEET);
  const other = unwrap(await decodeQpetEnvelope(otherEnvelope));
  assert.equal(genesis.manifest.id, "qbit");
  assert.equal(genesisPushdata4.contentId, genesis.contentId);
  assert.equal(other.manifest.id, "test-pet");
  assert.notEqual(other.contentId, genesis.contentId);
  assert.equal(other.bodySha256, sha256(TEST_SHEET));
});
