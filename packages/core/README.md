# qscriptions

Dependency-free, byte-exact verification for the frozen QPET inscription format used by the Qbit Genesis mascot.

The `0.0.0-canary.*` line exists only to reserve the package and prove npm trusted publishing before the public API is frozen. The manually bootstrapped `canary.0` has no provenance; `canary.2` is the first successful OIDC/provenance proof. Install an `0.1.0-alpha.*` or later release for the decoder.

```bash
npm install qscriptions@next
```

The `next` dist-tag currently resolves to the latest `0.1.0-alpha.*` decoder release.

The package is ESM-only, has no runtime dependencies, performs no networking or DOM work, and targets Node.js 22.13+ plus current secure-context browsers and workers.

## Decode one QPET output

```js
import { decodeQpetOpReturn } from "qscriptions";

function hexBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/iu.test(hex)) throw new TypeError("invalid hex");
  return Uint8Array.from(hex.match(/../gu), (byte) => Number.parseInt(byte, 16));
}

const result = await decodeQpetOpReturn(hexBytes(scriptPubKeyHex));
if (!result.ok) {
  console.error(result.error.code, result.error.stage);
} else {
  const artifact = result.value;
  console.log(artifact.contentId, artifact.manifest, artifact.bodySha256);
  const verifiedWebpBytes = artifact.bodyBytes; // a defensive copy
}
```

Use `extractQpetEnvelope(script)` when you only need the historical script-push layer, or `decodeQpetEnvelope(envelope)` when another trusted boundary already extracted the envelope. Expected hostile-input failures are returned as a frozen discriminated result; unsupported platform primitives such as missing WebCrypto may still reject as platform failures.

Artifacts and nested metadata are immutable. `envelopeBytes` and `bodyBytes` return a fresh copy on every read. The decoder accepts the direct, `OP_PUSHDATA1`, `OP_PUSHDATA2`, and `OP_PUSHDATA4` forms recognized by the original QPET tool, then requires exactly one complete push and no trailing script bytes.

## Trust boundary

The core proves internal byte consistency: QPET framing and schema, declared body length and SHA-256, and the exact-envelope content ID. It does **not** perform network I/O, establish transaction identity or chain inclusion, validate the WebP container or decoded dimensions, or render media. Callers must establish provenance separately and run an allowlisted media validator before decoding untrusted body bytes.

The Genesis application additionally pins its expected content ID. Generic callers should not mistake “valid QPET” for “the Qbit Genesis artifact.”

The package exports shared `QscriptionProof`, `QscriptionSource`, and `QscriptionChainLocator` types so callers can represent byte validity, transaction identity, media validation, source attestation, and chain evidence independently. A `byte-valid` content proof carries the content ID plus the independently checked envelope and body hashes. Verified transaction, inclusion, anchor, and confirmed-chain variants likewise require their identifying methods and facts.

`QscriptionArtifactRecord<TArtifact>` is the normalized consumer shape for combining a decoded artifact with caller-owned evidence. It accepts only a `byte-valid` content proof and ties that proof's identity fields to the artifact's identity field types. Callers still compare dynamic string values at their trust boundary; TypeScript cannot prove equality between two runtime digests. The decoder returns no source or chain claim and never constructs this record itself.

See the [repository](https://github.com/djh58/qscriptions) for canonical fixtures, the compatibility boundary, security policy, and release evidence.
