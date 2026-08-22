export type QscriptionContentStatus =
  | "unfetched"
  | "source-received"
  | "envelope-located"
  | "byte-valid"
  | "invalid";

interface CheckedEvidence {
  readonly checkedAt?: string;
}

export type QscriptionContentProof =
  | (CheckedEvidence & {
      readonly status: "unfetched" | "source-received" | "envelope-located";
    })
  | (CheckedEvidence & {
      readonly status: "byte-valid";
      readonly contentId: `qscr:sha256:${string}`;
    })
  | (CheckedEvidence & {
      readonly status: "invalid";
      readonly errorCode: string;
    });

export type QscriptionTransactionProof =
  | (CheckedEvidence & {
      readonly status: "unverified";
      readonly requestedTxid?: string;
    })
  | (CheckedEvidence & {
      readonly status: "id-verified" | "mismatch";
      readonly requestedTxid: string;
      readonly recomputedTxid: string;
    });

export type QscriptionMediaProof =
  | (CheckedEvidence & {
      readonly status: "unchecked" | "structurally-valid" | "decoded";
    })
  | (CheckedEvidence & {
      readonly status: "resource-refused" | "invalid";
      readonly errorCode: string;
    });

export type QscriptionInclusionProof =
  | {
      readonly status: "unchecked";
      readonly method: "none";
    }
  | {
      readonly status: "verified" | "invalid";
      readonly method: "local-node" | "merkle-proof";
    };

export type QscriptionAnchorProof =
  | {
      readonly status: "unchecked";
      readonly method: "none";
    }
  | {
      readonly status: "verified";
      readonly method: "local-node" | "header-chain";
      readonly genesisHash: string;
    }
  | {
      readonly status: "invalid";
      readonly method: "local-node" | "header-chain";
      readonly genesisHash?: string;
    };

export type QscriptionAttestationSource =
  | "none"
  | "local-node"
  | "qscriptions-index"
  | "public-explorer";

type PositiveAttestationSource = Exclude<QscriptionAttestationSource, "none">;

interface QscriptionChainProofBase {
  readonly attestationSource: QscriptionAttestationSource;
  readonly inclusion: QscriptionInclusionProof;
  readonly anchor: QscriptionAnchorProof;
  readonly observedAt?: string;
  readonly observedTip?: {
    readonly blockHash: string;
    readonly height: number;
  };
}

export type QscriptionChainProof =
  | (QscriptionChainProofBase & {
      readonly status: "unknown";
    })
  | (Omit<QscriptionChainProofBase, "attestationSource"> & {
      readonly status: "mempool";
      readonly attestationSource: PositiveAttestationSource;
    })
  | (Omit<QscriptionChainProofBase, "attestationSource"> & {
      readonly status: "confirmed" | "stale";
      readonly attestationSource: PositiveAttestationSource;
      readonly blockHash: string;
      readonly height: number;
      readonly depth?: number;
    });

/** Orthogonal evidence owned and enriched by the caller, never fabricated by the byte decoder. */
export interface QscriptionProof {
  readonly content: QscriptionContentProof;
  readonly transaction: QscriptionTransactionProof;
  readonly media: QscriptionMediaProof;
  readonly chain: QscriptionChainProof;
}

export type QscriptionSourceKind =
  | "local-node"
  | "qscriptions-index"
  | "public-explorer"
  | "file";

export interface QscriptionSource {
  readonly kind: QscriptionSourceKind;
  /** A configured non-secret label, never a credential-bearing endpoint URL. */
  readonly sourceId: string;
  readonly fetchedAt: string;
}

export interface QscriptionChainLocator {
  readonly genesisHash: string;
  readonly txid: string;
  readonly vout: number;
}

/** Caller-owned evidence that can accompany a byte-valid artifact. */
export interface QscriptionEvidence {
  readonly proof: QscriptionProof;
  readonly source?: QscriptionSource;
  readonly locator?: QscriptionChainLocator;
}

/** One normalized consumer shape after a caller attaches its independently checked evidence. */
export interface QscriptionArtifactRecord<TArtifact> extends QscriptionEvidence {
  readonly artifact: TArtifact;
}
