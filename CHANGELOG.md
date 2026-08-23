# Changelog

Notable changes to Qscriptions are recorded here. The project follows semantic
versioning after the package-reservation canaries.

## Unreleased

### Added

- Dependency-free frozen-QPET script, envelope, manifest, and digest verifier.
- Immutable normalized artifacts plus orthogonal proof/source/locator types.
- Exact Genesis fixture and live TypeScript/Python compatibility gate.
- Exact-tarball runtime and TypeScript consumer tests.

### Security

- Bounded byte snapshots reject detached and forged typed-array inputs.
- Expected hostile-input failures return typed results without raw-data
  diagnostics.
- npm releases are promoted from the exact tested archive through least-
  privilege trusted publishing.
