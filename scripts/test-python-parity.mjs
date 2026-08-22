import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeQpetEnvelope,
  extractQpetEnvelope,
} from "../packages/core/dist/index.js";

const oracle = process.argv[2];
assert.ok(oracle, "usage: npm run test:python-parity -- /absolute/path/to/qpet.py");
assert.ok(isAbsolute(oracle), "Python oracle path must be absolute");

const sheet = new TextEncoder().encode("RIFF\0\0\0\0WEBPparity-sheet");
const sheetSha256 = createHash("sha256").update(sheet).digest("hex");
const baseManifest = {
  format: "codex-pet-v1",
  id: "parity-pet",
  displayName: "Parity Pet",
  description: "Compared across implementations.",
  kind: "object",
  author: "parity",
  frame: { width: 2, height: 3, columns: 2, rows: 2 },
  states: [
    { id: "idle", row: 0, frames: 2, fps: 6, loop: true },
    { id: "wave", row: 1, frames: 1, fps: 5, loop: false },
  ],
  sheet: { contentType: "image/webp", length: sheet.byteLength, sha256: sheetSha256 },
};
const canonical = JSON.stringify(baseManifest);

function envelope(rawJson, body = sheet) {
  const manifestBytes = new TextEncoder().encode(rawJson);
  const bytes = new Uint8Array(7 + manifestBytes.byteLength + body.byteLength);
  bytes.set([0x51, 0x50, 0x45, 0x54, 0x01], 0);
  new DataView(bytes.buffer).setUint16(5, manifestBytes.byteLength, true);
  bytes.set(manifestBytes, 7);
  bytes.set(body, 7 + manifestBytes.byteLength);
  return bytes;
}

function script(payload, form) {
  let prefix;
  if (form === "direct") {
    prefix = Uint8Array.of(0x6a, payload.byteLength);
  } else if (form === "pushdata1") {
    prefix = Uint8Array.of(0x6a, 0x4c, payload.byteLength);
  } else if (form === "pushdata2") {
    prefix = new Uint8Array(4);
    prefix.set([0x6a, 0x4d]);
    new DataView(prefix.buffer).setUint16(2, payload.byteLength, true);
  } else {
    prefix = new Uint8Array(6);
    prefix.set([0x6a, 0x4e]);
    new DataView(prefix.buffer).setUint32(2, payload.byteLength, true);
  }
  const bytes = new Uint8Array(prefix.byteLength + payload.byteLength);
  bytes.set(prefix);
  bytes.set(payload, prefix.byteLength);
  return bytes;
}

const deep = "[".repeat(256) + "null" + "]".repeat(256);
const envelopeCases = [
  ["canonical", envelope(canonical)],
  [
    "duplicate final string wins",
    envelope(
      canonical.replace(
        '"displayName":"Parity Pet"',
        '"displayName":null,"displayName":"Parity Pet"',
      ),
    ),
  ],
  [
    "escaped duplicate key wins",
    envelope(canonical.replace('"id":"parity-pet"', '"id":null,"\\u0069d":"parity-pet"')),
  ],
  [
    "shadowed float is ignored",
    envelope(canonical.replace('"row":0', '"row":2.0,"row":0')),
  ],
  [
    "shadowed surrogate is ignored",
    envelope(
      canonical.replace(
        '"displayName":"Parity Pet"',
        '"displayName":"\\ud800","displayName":"Parity Pet"',
      ),
    ),
  ],
  [
    "shadowed deep value is ignored",
    envelope(
      canonical.replace(
        '"description":"Compared across implementations."',
        `"description":${deep},"description":"Compared across implementations."`,
      ),
    ),
  ],
  ["final decimal is rejected", envelope(canonical.replace('"width":2', '"width":2.0'))],
  ["final exponent is rejected", envelope(canonical.replace('"width":2', '"width":2e0'))],
  ["final overflow is rejected", envelope(canonical.replace('"width":2', '"width":1e999'))],
  ["final underflow is rejected", envelope(canonical.replace('"row":0', '"row":1e-324'))],
  ["negative zero normalizes", envelope(canonical.replace('"row":0', '"row":-0'))],
  [
    "final surrogate is rejected",
    envelope(canonical.replace('"displayName":"Parity Pet"', '"displayName":"\\ud800"')),
  ],
  ["unknown field is rejected", envelope(`${canonical.slice(0, -1)},"extension":true}`)],
  ["invalid JSON constant is rejected", envelope('{"format":NaN}')],
  ["BOM is rejected", envelope(`\ufeff${canonical}`)],
  [
    "uppercase digest normalizes",
    envelope(canonical.replace(sheetSha256, sheetSha256.toUpperCase())),
  ],
  [
    "digest mismatch is rejected",
    envelope(canonical.replace(sheetSha256, "0".repeat(64))),
  ],
];
const invalidUtf8 = envelope(canonical);
invalidUtf8[7] = 0xff;
envelopeCases.push(["invalid UTF-8 is rejected", invalidUtf8]);

const qpetBytes = new TextEncoder().encode("QPET");
const scriptCases = [
  ["direct push", script(qpetBytes, "direct")],
  ["PUSHDATA1", script(qpetBytes, "pushdata1")],
  ["PUSHDATA2", script(qpetBytes, "pushdata2")],
  ["PUSHDATA4", script(qpetBytes, "pushdata4")],
  ["truncated PUSHDATA2", Uint8Array.of(0x6a, 0x4d, 0x04)],
  ["truncated payload", Uint8Array.of(0x6a, 0x05, 0x51)],
  ["trailing push", Uint8Array.of(0x6a, 0x01, 0x51, 0x01, 0x52)],
  ["unsupported opcode", Uint8Array.of(0x6a, 0x4f)],
];

const requests = [
  ...envelopeCases.map(([, bytes]) => ({
    operation: "decode",
    bytes: Buffer.from(bytes).toString("base64"),
  })),
  ...scriptCases.map(([, bytes]) => ({
    operation: "extract",
    bytes: Buffer.from(bytes).toString("base64"),
  })),
];
const driver = fileURLToPath(new URL("python-qpet-driver.py", import.meta.url));
const python = spawnSync("python3", [driver, oracle], {
  input: JSON.stringify(requests),
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
});
assert.equal(python.status, 0, python.stderr || "Python oracle failed");
const pythonResults = JSON.parse(python.stdout);
assert.equal(pythonResults.length, requests.length);

for (let index = 0; index < envelopeCases.length; index += 1) {
  const [name, bytes] = envelopeCases[index];
  const typescript = await decodeQpetEnvelope(bytes);
  const pythonResult = pythonResults[index];
  assert.equal(typescript.ok, pythonResult.ok, `${name}: verdict mismatch`);
  if (typescript.ok) {
    assert.deepEqual(typescript.value.manifest, pythonResult.manifest, `${name}: manifest mismatch`);
    assert.equal(typescript.value.bodySha256, pythonResult.bodySha256, `${name}: hash mismatch`);
  }
}

for (let index = 0; index < scriptCases.length; index += 1) {
  const [name, bytes] = scriptCases[index];
  const typescript = extractQpetEnvelope(bytes);
  const pythonResult = pythonResults[envelopeCases.length + index];
  assert.equal(typescript.ok, pythonResult.ok, `${name}: verdict mismatch`);
  if (typescript.ok) {
    assert.equal(
      Buffer.from(typescript.value).toString("base64"),
      pythonResult.payload,
      `${name}: payload mismatch`,
    );
  }
}

console.log(
  `Python parity verified: ${envelopeCases.length} envelopes and ${scriptCases.length} scripts`,
);
