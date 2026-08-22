# Roadmap

Qscriptions starts with one deliberately narrow compatibility contract. The
published `qscriptions` package decodes frozen QPET v1 bytes; it does not yet
define or publish a new inscription format.

## Current release gate

- Reproduce the Qbit Genesis envelope, sheet digest, geometry, and all nine
  animation states exactly.
- Match the historical Python decoder, including all four accepted script-push
  encodings and last-value-wins JSON behavior.
- Ship a dependency-free, environment-neutral TypeScript package from an exact
  tested tarball with npm provenance.
- Let the Genesis viewer consume that one package as its only protocol decoder.

## Deferred Foundry work

The following work requires a new engineering and security review after the
Genesis/shared-core gate passes:

1. A normative `QSCR/0-draft` envelope, strict inert-media profiles, threat
   model, malformed corpus, and an independently written Python decoder.
2. A `qscribe` inspect/verify/fetch CLI, followed later by explicit prepare,
   approve, and broadcast phases that never auto-broadcast.
3. Regtest and testnet publication trials, policy/fee evidence, and a clean-room
   trial by someone who did not build the tooling.
4. A reorg-aware indexer, bounded API, generic viewer, and recent-artifact
   gallery.
5. QSCR v1 freeze and a second independently published mainnet artifact only
   after the two implementations and security review agree.

Composition, active content, agent-installable resources, marketplaces,
ownership semantics, and wallet-connected hosted publishing are not current
goals. Qbit node and wallet RPC remain private throughout.
