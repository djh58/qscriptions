export interface QpetFrame {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
}

export interface QpetState {
  readonly id: string;
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
}

export interface QpetSheetDeclaration {
  readonly contentType: "image/webp";
  readonly length: number;
  readonly sha256: string;
}

export interface QpetManifest {
  readonly format: "codex-pet-v1";
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly kind: string;
  readonly author: string;
  readonly frame: QpetFrame;
  readonly states: readonly QpetState[];
  readonly sheet: QpetSheetDeclaration;
}

export interface QpetHashes {
  readonly envelopeSha256: string;
  readonly sheetSha256: string;
}

export interface QpetArtifact {
  readonly wireFormat: "QPET";
  readonly wireVersion: 1;
  readonly contentId: `qscr:sha256:${string}`;
  readonly profile: "legacy/qpet-v1";
  readonly manifest: QpetManifest;
  readonly bodyLength: number;
  readonly bodySha256: string;
  readonly hashes: QpetHashes;
  /** A fresh copy on every read; mutating it cannot change the artifact. */
  readonly envelopeBytes: Uint8Array;
  /** The verified WebP body. A fresh copy is returned on every read. */
  readonly bodyBytes: Uint8Array;
}

export function makeQpetArtifact(
  manifest: QpetManifest,
  envelope: Uint8Array,
  bodyOffset: number,
  envelopeSha256: string,
  sheetSha256: string,
): QpetArtifact {
  const stableEnvelope = Uint8Array.from(envelope);
  const bodyLength = stableEnvelope.byteLength - bodyOffset;
  const hashes: QpetHashes = Object.freeze({ envelopeSha256, sheetSha256 });

  return Object.freeze({
    wireFormat: "QPET",
    wireVersion: 1,
    contentId: `qscr:sha256:${envelopeSha256}`,
    profile: "legacy/qpet-v1",
    manifest,
    bodyLength,
    bodySha256: sheetSha256,
    hashes,
    get envelopeBytes(): Uint8Array {
      return stableEnvelope.slice();
    },
    get bodyBytes(): Uint8Array {
      return stableEnvelope.slice(bodyOffset);
    },
  });
}
