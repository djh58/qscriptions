# Qscriptions

Qscriptions is the public home for byte-exact Qbit inscription formats and verification tools. The first release is intentionally narrow: a dependency-free TypeScript core that decodes and validates the frozen QPET format already committed to Qbit mainnet.

The Genesis artifact is the animated Qbit mascot in transaction [`852748890119300166f0c3050da3fee5c55316d199bcff1425424c009d2e62b9`](https://mempool.qbit.org/tx/852748890119300166f0c3050da3fee5c55316d199bcff1425424c009d2e62b9), block 53,026. The [live Genesis viewer](https://qbit-onchain-pet.thedanhepworth.chatgpt.site/) reconstructs it from public chain data; its source lives in [`djh58/qbit-onchain-pet`](https://github.com/djh58/qbit-onchain-pet).

## Current scope

- Parse one complete `OP_RETURN` data push using the four push encodings accepted by historical QPET.
- Decode QPET v1 envelopes with strict UTF-8 and exact manifest validation.
- Verify declared body length and SHA-256, then return a normalized immutable artifact.
- Return stable typed results for hostile input instead of throwing expected parser errors.
- Run in Node.js, current secure-context browsers, and workers using `Uint8Array` and WebCrypto.

Networking, transaction reconstruction, browser media decoding, Blob URLs, UI, wallet access, encoding, QSCR, and publication are deliberately outside this package.

## Install

The first public API will ship on the `next` tag. `canary` releases prove the tokenless npm trusted-publishing path and should not be used as an API contract.

```bash
npm install qscriptions@next
```

## Trust model

The core verifies bytes supplied by its caller. It does not claim where those bytes came from, confirm chain inclusion, or hardcode the Genesis mascot's hashes. Applications own transport and chain evidence, then compare any artifact-specific expected identity after generic QPET validation succeeds.

Published packages are built in public GitHub Actions and tested as exact tarballs. The one-time `0.0.0-canary.0` namespace bootstrap is manually uploaded from that CI artifact because npm cannot configure trusted publishing before a package exists; it carries no provenance and is not an API release. `0.0.0-canary.2` is the first successful npm trusted-publishing proof; later releases use the same provenance-bearing path with no long-lived registry token. Canonical fixtures remain in this repository and are explicitly excluded from the npm tarball.

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Security reports belong in GitHub private vulnerability reporting, not public issues.

MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for fixture provenance.
