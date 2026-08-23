# qscriptions

Dependency-free, byte-exact verification for the frozen QPET inscription format used by the Qbit Genesis mascot.

The `0.0.0-canary.*` line exists only to reserve the package and prove npm trusted publishing before the public API is frozen. The manually bootstrapped `canary.0` has no provenance; `canary.2` is the first successful OIDC/provenance proof. Install an `0.1.0-alpha.*` or later release for the decoder.

```bash
npm install qscriptions@next
```

The package is ESM-only, has no runtime dependencies, performs no networking or DOM work, and targets Node.js 22.13+ plus current secure-context browsers and workers.

See the [repository](https://github.com/djh58/qscriptions) for the protocol boundary, fixtures, threat model, and release evidence.
