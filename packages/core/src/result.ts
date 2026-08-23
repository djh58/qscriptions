export type QpetErrorStage =
  | "input"
  | "script"
  | "envelope"
  | "manifest"
  | "body";

export type QpetErrorCode =
  | "INVALID_INPUT"
  | "SCRIPT_TOO_LARGE"
  | "NOT_OP_RETURN"
  | "MISSING_DATA_PUSH"
  | "TRUNCATED_PUSHDATA_LENGTH"
  | "UNSUPPORTED_SCRIPT_OPCODE"
  | "TRUNCATED_OP_RETURN_PAYLOAD"
  | "TRAILING_SCRIPT_DATA"
  | "ENVELOPE_TOO_LARGE"
  | "TRUNCATED_QPET_ENVELOPE"
  | "INVALID_QPET_MAGIC"
  | "UNSUPPORTED_QPET_VERSION"
  | "TRUNCATED_QPET_MANIFEST"
  | "INVALID_MANIFEST_UTF8"
  | "INVALID_MANIFEST_JSON"
  | "INVALID_MANIFEST_SCHEMA"
  | "INVALID_SPRITESHEET_SIZE"
  | "SPRITESHEET_HASH_MISMATCH";

export interface QpetError {
  readonly code: QpetErrorCode;
  readonly stage: QpetErrorStage;
  readonly retryable: false;
  /** Bounded, developer-facing context. It never contains raw hostile input. */
  readonly diagnostic?: string;
}

export type QpetResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: QpetError };

export function ok<T>(value: T): QpetResult<T> {
  return Object.freeze({ ok: true, value });
}

export function fail<T>(
  code: QpetErrorCode,
  stage: QpetErrorStage,
  diagnostic?: string,
): QpetResult<T> {
  const error: QpetError =
    diagnostic === undefined
      ? Object.freeze({ code, stage, retryable: false })
      : Object.freeze({ code, stage, retryable: false, diagnostic });
  return Object.freeze({ ok: false, error });
}
