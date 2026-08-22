import { fail, ok, type QpetResult } from "./result.js";

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(value: JsonRecord, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

export function isInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number";
}

const utf8Encoder = new TextEncoder();

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export function isBoundedUtf8String(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    (allowEmpty || value.length > 0) &&
    !hasUnpairedSurrogate(value) &&
    utf8Encoder.encode(value).byteLength <= maximum
  );
}

/**
 * Python's historical QPET decoder distinguishes JSON integers from floats,
 * while JavaScript normally loses that lexical distinction. Replace only
 * floating/exponent number tokens with null before the final parse. JSON.parse
 * then preserves the legacy last-key-wins behavior: a shadowed invalid token
 * disappears, while a surviving token fails the integer schema checks.
 */
function maskNonIntegerNumbers(text: string): string {
  const chunks: string[] = [];
  let copiedThrough = 0;
  let index = 0;
  let inString = false;

  while (index < text.length) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (code === 0x5c) {
        index += 2;
        continue;
      }
      if (code === 0x22) {
        inString = false;
      }
      index += 1;
      continue;
    }
    if (code === 0x22) {
      inString = true;
      index += 1;
      continue;
    }
    if (code !== 0x2d && (code < 0x30 || code > 0x39)) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < text.length) {
      const tokenCode = text.charCodeAt(end);
      if (
        tokenCode === 0x2c ||
        tokenCode === 0x5d ||
        tokenCode === 0x7d ||
        tokenCode === 0x20 ||
        tokenCode === 0x09 ||
        tokenCode === 0x0a ||
        tokenCode === 0x0d
      ) {
        break;
      }
      end += 1;
    }
    const token = text.slice(index, end);
    if (token.includes(".") || token.includes("e") || token.includes("E")) {
      chunks.push(text.slice(copiedThrough, index), "null");
      copiedThrough = end;
    }
    index = end;
  }

  if (chunks.length === 0) {
    return text;
  }
  chunks.push(text.slice(copiedThrough));
  return chunks.join("");
}

export function parseStrictJson(bytes: Uint8Array): QpetResult<unknown> {
  let text: string;
  try {
    // ignoreBOM=true preserves a leading BOM so JSON.parse rejects it, matching
    // Python's strict UTF-8 decoder plus json.loads behavior.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return fail("INVALID_MANIFEST_UTF8", "manifest");
  }

  try {
    // Validate the original text before transforming numeric tokens.
    JSON.parse(text);
  } catch {
    return fail("INVALID_MANIFEST_JSON", "manifest");
  }

  return ok(JSON.parse(maskNonIntegerNumbers(text)));
}
