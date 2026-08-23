import {
  makeQpetArtifact,
  type QpetArtifact,
  type QpetFrame,
  type QpetManifest,
  type QpetSheetDeclaration,
  type QpetState,
} from "./artifact.js";
import { sha256Hex } from "./hash.js";
import { fail, ok, type QpetResult } from "./result.js";
import {
  hasExactKeys,
  isBoundedUtf8String,
  isInteger,
  isPositiveInteger,
  isRecord,
  parseStrictJson,
  type JsonRecord,
} from "./validate.js";

const OP_RETURN = 0x6a;
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;
const MAGIC = new Uint8Array([0x51, 0x50, 0x45, 0x54]); // QPET
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;

export const QPET_VERSION = 1 as const;
export const QPET_LIMITS = Object.freeze({
  manifestBytes: 0xffff,
  sheetBytes: 16 * 1024 * 1024,
  states: 32,
});

const MAX_ENVELOPE_BYTES = 7 + QPET_LIMITS.manifestBytes + QPET_LIMITS.sheetBytes;
const MAX_SCRIPT_BYTES = 6 + MAX_ENVELOPE_BYTES;
const MANIFEST_KEYS = [
  "format",
  "id",
  "displayName",
  "description",
  "kind",
  "author",
  "frame",
  "states",
  "sheet",
] as const;
const FRAME_KEYS = ["width", "height", "columns", "rows"] as const;
const STATE_KEYS = ["id", "row", "frames", "fps", "loop"] as const;
const SHEET_KEYS = ["contentType", "length", "sha256"] as const;

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayTag = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)!.get!;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)!.get!;

type ByteSnapshot =
  | { readonly ok: true; readonly value: Uint8Array }
  | { readonly ok: false; readonly tooLarge: boolean };

function snapshotBytes(value: unknown, maximum: number): ByteSnapshot {
  if (typeof value !== "object" || value === null) {
    return { ok: false, tooLarge: false };
  }
  try {
    if (typedArrayTag.call(value) !== "Uint8Array") {
      return { ok: false, tooLarge: false };
    }
    const length = typedArrayByteLength.call(value) as number;
    if (length > maximum) {
      return { ok: false, tooLarge: true };
    }
    const stable = new Uint8Array(length);
    Uint8Array.prototype.set.call(stable, value as Uint8Array);
    return { ok: true, value: stable };
  } catch {
    return { ok: false, tooLarge: false };
  }
}

function schemaFailure<T>(diagnostic: string): QpetResult<T> {
  return fail("INVALID_MANIFEST_SCHEMA", "manifest", diagnostic);
}

function bodySizeFailure<T>(): QpetResult<T> {
  return fail("INVALID_SPRITESHEET_SIZE", "body");
}

function normalizeManifest(
  value: unknown,
  body: Uint8Array,
): QpetResult<{ manifest: QpetManifest; declaredHash: string }> {
  if (!isRecord(value) || !hasExactKeys(value, MANIFEST_KEYS)) {
    return schemaFailure("manifest fields");
  }
  if (value.format !== "codex-pet-v1") {
    return schemaFailure("format");
  }
  if (!isBoundedUtf8String(value.id, 64)) {
    return schemaFailure("id");
  }
  if (!isBoundedUtf8String(value.displayName, 120)) {
    return schemaFailure("displayName");
  }
  if (!isBoundedUtf8String(value.description, 2000, true)) {
    return schemaFailure("description");
  }
  if (!isBoundedUtf8String(value.kind, 64)) {
    return schemaFailure("kind");
  }
  if (!isBoundedUtf8String(value.author, 120)) {
    return schemaFailure("author");
  }

  const frameValue = value.frame;
  if (!isRecord(frameValue) || !hasExactKeys(frameValue, FRAME_KEYS)) {
    return schemaFailure("frame fields");
  }
  const width = frameValue.width;
  const height = frameValue.height;
  const columns = frameValue.columns;
  const rows = frameValue.rows;
  if (
    !isPositiveInteger(width) ||
    !isPositiveInteger(height) ||
    !isPositiveInteger(columns) ||
    !isPositiveInteger(rows)
  ) {
    return schemaFailure("frame geometry");
  }
  if (
    width > 4096 ||
    height > 4096 ||
    columns > 256 ||
    rows > 256 ||
    width * columns > 32768 ||
    height * rows > 32768
  ) {
    return schemaFailure("frame bounds");
  }
  const frame: QpetFrame = Object.freeze({ width, height, columns, rows });

  const statesValue = value.states;
  if (
    !Array.isArray(statesValue) ||
    statesValue.length < 1 ||
    statesValue.length > QPET_LIMITS.states
  ) {
    return schemaFailure("states");
  }
  const stateIds = new Set<string>();
  const normalizedStates: QpetState[] = [];
  for (const stateValue of statesValue) {
    if (!isRecord(stateValue) || !hasExactKeys(stateValue, STATE_KEYS)) {
      return schemaFailure("state fields");
    }
    const id = stateValue.id;
    const row = stateValue.row;
    const frames = stateValue.frames;
    const fps = stateValue.fps;
    const loop = stateValue.loop;
    if (
      !isBoundedUtf8String(id, 64) ||
      stateIds.has(id) ||
      !isInteger(row) ||
      row < 0 ||
      row >= rows ||
      !isPositiveInteger(frames) ||
      frames > columns ||
      !isPositiveInteger(fps) ||
      fps > 60 ||
      typeof loop !== "boolean"
    ) {
      return schemaFailure("state bounds");
    }
    stateIds.add(id);
    normalizedStates.push(
      Object.freeze({ id, row: row === 0 ? 0 : row, frames, fps, loop }),
    );
  }
  const states: readonly QpetState[] = Object.freeze(normalizedStates);

  if (body.byteLength < 1 || body.byteLength > QPET_LIMITS.sheetBytes) {
    return bodySizeFailure();
  }
  const sheetValue = value.sheet;
  if (!isRecord(sheetValue) || !hasExactKeys(sheetValue, SHEET_KEYS)) {
    return schemaFailure("sheet fields");
  }
  const length = sheetValue.length;
  const declaredHash = sheetValue.sha256;
  if (
    sheetValue.contentType !== "image/webp" ||
    !isInteger(length) ||
    length !== body.byteLength ||
    typeof declaredHash !== "string" ||
    !SHA256_PATTERN.test(declaredHash)
  ) {
    return schemaFailure("sheet declaration");
  }
  const normalizedHash = declaredHash.toLowerCase();
  const sheet: QpetSheetDeclaration = Object.freeze({
    contentType: "image/webp",
    length,
    sha256: normalizedHash,
  });
  const manifest: QpetManifest = Object.freeze({
    format: "codex-pet-v1",
    id: value.id,
    displayName: value.displayName,
    description: value.description,
    kind: value.kind,
    author: value.author,
    frame,
    states,
    sheet,
  });
  return ok(Object.freeze({ manifest, declaredHash: normalizedHash }));
}

/**
 * Extract the one pushed envelope from a historical QPET OP_RETURN script.
 *
 * This deliberately accepts every push form accepted by the original Python
 * tool. Future QSCR minimal-push policy must not be added to this entry point.
 */
export function extractQpetEnvelope(script: Uint8Array): QpetResult<Uint8Array> {
  const snapshot = snapshotBytes(script, MAX_SCRIPT_BYTES);
  if (!snapshot.ok && !snapshot.tooLarge) {
    return fail("INVALID_INPUT", "input", "script must be a Uint8Array");
  }
  if (!snapshot.ok) {
    return fail("SCRIPT_TOO_LARGE", "script");
  }
  const stable = snapshot.value;
  if (stable.byteLength === 0) {
    return fail("NOT_OP_RETURN", "script");
  }
  const view = new DataView(stable.buffer, stable.byteOffset, stable.byteLength);
  if (view.getUint8(0) !== OP_RETURN) {
    return fail("NOT_OP_RETURN", "script");
  }
  if (stable.byteLength === 1) {
    return fail("MISSING_DATA_PUSH", "script");
  }

  const opcode = view.getUint8(1);
  let index = 2;
  let length: number;
  if (opcode <= 0x4b) {
    length = opcode;
  } else if (opcode === OP_PUSHDATA1) {
    if (index + 1 > stable.byteLength) {
      return fail("TRUNCATED_PUSHDATA_LENGTH", "script");
    }
    length = view.getUint8(index);
    index += 1;
  } else if (opcode === OP_PUSHDATA2) {
    if (index + 2 > stable.byteLength) {
      return fail("TRUNCATED_PUSHDATA_LENGTH", "script");
    }
    length = view.getUint16(index, true);
    index += 2;
  } else if (opcode === OP_PUSHDATA4) {
    if (index + 4 > stable.byteLength) {
      return fail("TRUNCATED_PUSHDATA_LENGTH", "script");
    }
    length = view.getUint32(index, true);
    index += 4;
  } else {
    return fail(
      "UNSUPPORTED_SCRIPT_OPCODE",
      "script",
      `opcode ${opcode.toString(16).padStart(2, "0")}`,
    );
  }

  const end = index + length;
  if (end > stable.byteLength) {
    return fail("TRUNCATED_OP_RETURN_PAYLOAD", "script");
  }
  if (end !== stable.byteLength) {
    return fail("TRAILING_SCRIPT_DATA", "script");
  }
  return ok(stable.slice(index, end));
}

/** Decode and verify exact QPET envelope bytes without assuming a chain identity. */
export async function decodeQpetEnvelope(
  envelope: Uint8Array,
): Promise<QpetResult<QpetArtifact>> {
  const snapshot = snapshotBytes(envelope, MAX_ENVELOPE_BYTES);
  if (!snapshot.ok && !snapshot.tooLarge) {
    return fail("INVALID_INPUT", "input", "envelope must be a Uint8Array");
  }
  if (!snapshot.ok) {
    return fail("ENVELOPE_TOO_LARGE", "envelope");
  }
  const stable = snapshot.value;
  if (stable.byteLength < 7) {
    return fail("TRUNCATED_QPET_ENVELOPE", "envelope");
  }
  const view = new DataView(stable.buffer, stable.byteOffset, stable.byteLength);
  if (
    view.getUint8(0) !== MAGIC[0] ||
    view.getUint8(1) !== MAGIC[1] ||
    view.getUint8(2) !== MAGIC[2] ||
    view.getUint8(3) !== MAGIC[3]
  ) {
    return fail("INVALID_QPET_MAGIC", "envelope");
  }
  if (view.getUint8(4) !== QPET_VERSION) {
    return fail(
      "UNSUPPORTED_QPET_VERSION",
      "envelope",
      `version ${view.getUint8(4)}`,
    );
  }

  const manifestLength = view.getUint16(5, true);
  const manifestEnd = 7 + manifestLength;
  if (manifestLength === 0 || manifestEnd > stable.byteLength) {
    return fail("TRUNCATED_QPET_MANIFEST", "envelope");
  }

  const parsed = parseStrictJson(stable.subarray(7, manifestEnd));
  if (!parsed.ok) {
    return parsed;
  }
  const body = stable.subarray(manifestEnd);
  const normalized = normalizeManifest(parsed.value, body);
  if (!normalized.ok) {
    return normalized;
  }

  const sheetSha256 = await sha256Hex(body);
  if (sheetSha256 !== normalized.value.declaredHash) {
    return fail("SPRITESHEET_HASH_MISMATCH", "body");
  }
  const envelopeSha256 = await sha256Hex(stable);
  return ok(
    makeQpetArtifact(
      normalized.value.manifest,
      stable,
      manifestEnd,
      envelopeSha256,
      sheetSha256,
    ),
  );
}

/** Extract and verify a QPET artifact from one complete legacy OP_RETURN script. */
export async function decodeQpetOpReturn(
  script: Uint8Array,
): Promise<QpetResult<QpetArtifact>> {
  const extracted = extractQpetEnvelope(script);
  if (!extracted.ok) {
    return extracted;
  }
  return decodeQpetEnvelope(extracted.value);
}
