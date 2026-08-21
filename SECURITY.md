# Security policy

## Supported versions

Until the first stable release, security fixes are made on `main` and released
in the newest npm prerelease. After 1.0, only the latest release line will be
supported unless a release note says otherwise.

## Reporting a vulnerability

Please report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/djh58/qscriptions/security/advisories/new).
Do not include exploit details, wallet material, credentials, private node
addresses, or other sensitive data in a public issue.

If private reporting is temporarily unavailable, open a public issue containing
only a request for a private contact channel. A maintainer will reply without
asking you to disclose the vulnerability publicly.

You should receive an acknowledgement within seven days. Please allow time for
a fix and coordinated disclosure before publishing details.

## Scope

The published package is a pure decoder and verifier: it does not connect to a
wallet, node, explorer, or other network service. Security reports about input
validation, denial of service, digest verification, package provenance, or the
release pipeline are in scope. Reports about third-party explorers or qbit
consensus belong with those projects.
