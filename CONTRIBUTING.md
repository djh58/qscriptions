# Contributing

Thanks for helping make QPET inscriptions easier to inspect and reuse.

## Development setup

Use Node.js 24 and npm 11.11.0 or newer. This repository uses npm
workspaces; run commands from the repository root.

```sh
npm ci --ignore-scripts
npm run check
```

`npm run check` is the offline portion of the required core CI gate. It runs the
build, strict type checks, tests, and coverage without network or wallet access.

CI also compares the TypeScript decoder against an exact-pinned copy of the
historical Python QPET oracle. That cross-repository check intentionally remains
outside the offline local command.

To verify the exact archive consumers will receive:

```sh
pack_dir="$(mktemp -d)"
npm pack --workspace packages/core --pack-destination "$pack_dir"
tarball="$(find "$pack_dir" -maxdepth 1 -name '*.tgz' -print -quit)"
npm run test:tarball -- "$tarball"
```

## Pull requests

- Start from `main` and use a focused feature branch.
- Keep protocol behavior, tests, and documentation in the same pull request.
- Add boundary and malformed-input tests for parser changes.
- Keep the core package free of runtime dependencies, network access, DOM APIs,
  filesystem access, and chain-specific identity pinning.
- Never commit credentials, seed phrases, wallet files, private RPC endpoints,
  npm tokens, or real user data.
- Confirm `npm run check` and the packed-tarball test pass before requesting
  review.

Repository-only fixtures may contain publicly available inscription data needed
for parity tests. They must remain excluded from the npm tarball.

By contributing, you agree that your contribution is licensed under the
repository's MIT License and that you will follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
