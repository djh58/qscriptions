import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const TEST_SHEET = new TextEncoder().encode("RIFF\0\0\0\0WEBPtest-sheet");

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function manifestFor(sheet = TEST_SHEET) {
  return {
    format: "codex-pet-v1",
    id: "test-pet",
    displayName: "Test Pet",
    description: "A valid non-Genesis test pet.",
    kind: "object",
    author: "tests",
    frame: { width: 2, height: 3, columns: 2, rows: 2 },
    states: [
      { id: "idle", row: 0, frames: 2, fps: 6, loop: true },
      { id: "wave", row: 1, frames: 1, fps: 5, loop: false },
    ],
    sheet: {
      contentType: "image/webp",
      length: sheet.byteLength,
      sha256: sha256(sheet),
    },
  };
}

export function encodeEnvelope(manifest, sheet = TEST_SHEET, rawJson) {
  const manifestBytes = new TextEncoder().encode(rawJson ?? JSON.stringify(manifest));
  assert.ok(manifestBytes.byteLength <= 0xffff);
  const envelope = new Uint8Array(7 + manifestBytes.byteLength + sheet.byteLength);
  envelope.set([0x51, 0x50, 0x45, 0x54, 0x01], 0);
  new DataView(envelope.buffer).setUint16(5, manifestBytes.byteLength, true);
  envelope.set(manifestBytes, 7);
  envelope.set(sheet, 7 + manifestBytes.byteLength);
  return envelope;
}

export function pushScript(payload, form = "pushdata2") {
  let prefix;
  if (form === "direct") {
    assert.ok(payload.byteLength <= 0x4b);
    prefix = Uint8Array.of(0x6a, payload.byteLength);
  } else if (form === "pushdata1") {
    assert.ok(payload.byteLength <= 0xff);
    prefix = Uint8Array.of(0x6a, 0x4c, payload.byteLength);
  } else if (form === "pushdata2") {
    assert.ok(payload.byteLength <= 0xffff);
    prefix = new Uint8Array(4);
    prefix.set([0x6a, 0x4d]);
    new DataView(prefix.buffer).setUint16(2, payload.byteLength, true);
  } else {
    prefix = new Uint8Array(6);
    prefix.set([0x6a, 0x4e]);
    new DataView(prefix.buffer).setUint32(2, payload.byteLength, true);
  }
  const script = new Uint8Array(prefix.byteLength + payload.byteLength);
  script.set(prefix);
  script.set(payload, prefix.byteLength);
  return script;
}

export function expectError(result, code, stage) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  if (stage !== undefined) {
    assert.equal(result.error.stage, stage);
  }
  assert.equal(result.error.retryable, false);
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.error));
  return result.error;
}

export function unwrap(result) {
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  return result.value;
}
