# Security Policy

FW OCTO Editor handles an encrypted game database and performs local save
mutations. Please report vulnerabilities privately and do not include database
keys, save files, decrypted records, or personal paths in a report.

## Supported versions

Security fixes are applied to the latest published release and current `main`.
Older releases are not maintained unless explicitly stated.

## Reporting a vulnerability

Do not open a public issue. Contact the maintainer privately using the contact
methods on the
[maintainer's GitHub profile](https://github.com/butteredstardust). If no private
contact method is available, open a public issue requesting a private channel
without including vulnerability details.

Include the affected version, platform, prerequisites, minimal reproduction
steps, impact, and suggested mitigation. Attach only synthetic or redacted
artifacts. You should receive an acknowledgment within 10 business days; the
maintainer will validate the report and coordinate remediation and disclosure.

## Scope

In scope are vulnerabilities in the loopback web application, CSRF and request
validation, key storage and redaction, save parsing and serialization, staged
mutation and rollback logic, backup handling, installer/build scripts, and
officially bundled dependencies.

Reports about game exploits, cheating, proprietary game services, or issues
that require a deliberately exposed non-loopback deployment are generally out
of scope. Third-party tool or dependency vulnerabilities should also be
reported upstream; notify this project when an official supported build is
affected.

## Safety invariants

Security fixes must not weaken the loopback-only bind, game-running gate,
copy-on-write staging, automatic backup, database integrity and foreign-key
checks, before/after hashing, key redaction, or automatic rollback. Test only on
systems and saves you own or are authorized to use.
