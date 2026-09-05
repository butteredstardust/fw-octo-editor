# Contributing to FW OCTO Editor

Thanks for contributing. Because this project reads and writes live game saves,
data integrity and secret handling take priority over convenience.

## Before you start

- Search existing issues and read `AGENTS.md` plus `DEVELOPER_GUIDE.md`.
- Use [SECURITY.md](SECURITY.md) for vulnerabilities instead of a public issue.
- Do not commit save files, database keys, decrypted data, personal paths,
  generated backups, or proprietary game assets.
- Discuss format assumptions with evidence from round-trip tests or controlled
  samples. Do not add guessed write behavior.

## Set up

The application lives in `webapp/` and requires Node.js 22 or newer.

```bash
cd webapp
npm install
npm start
```

See `INSTALL_GUIDE.md` for native tool setup and environment variables. Keep the
app bound to loopback and keep the game closed during save mutations.

## Make a change

1. Fork the repository and create a focused branch from `main`.
2. Keep frontend code as browser-native ES modules and backend changes within
   the existing route/service boundaries.
3. Route every write through the centralized mutation service. Preserve staged
   writes, automatic backups, integrity checks, hash verification, and rollback.
4. Validate inputs and never log, return, or persist a plaintext database key.
5. Add tests for new behavior and update the relevant documentation.

## Validate

Run from `webapp/`:

```bash
npm test
npm run lint
npm run test:browser
```

State which checks ran and any Windows/native-tool limitations in the pull
request. Never run integration tests against a save you cannot afford to
restore.

## Pull requests

Describe the user-visible change, affected save structures, safety invariants,
test evidence, and rollback considerations. Keep generated or vendored data out
of a change unless regeneration is the purpose of the pull request and its
source and license are documented.

By participating, you agree to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
