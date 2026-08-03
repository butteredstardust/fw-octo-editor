<div align="center">

# FW OCTO Editor

**Safely read and edit *The Forever Winter* encrypted saves. Local only, staged writes, automatic backups.**

[![Release](https://img.shields.io/github/v/release/butteredstardust/fw-octo-editor?style=for-the-badge&logo=github&color=181717)](https://github.com/butteredstardust/fw-octo-editor/releases/latest)
[![Build](https://img.shields.io/github/actions/workflow/status/butteredstardust/fw-octo-editor/release.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=build)](https://github.com/butteredstardust/fw-octo-editor/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](webapp/LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2022-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/butteredstardust/fw-octo-editor/releases/latest)

</div>

A local, loopback-only Node.js/Express web application for safely reading and editing *The Forever Winter* encrypted save files. It provides a browser-based UI for modifying character progression, inventory, currencies, hub upgrades, weapon XP, vendor reputations, and more—with staged copy-on-write mutations, automatic backups, and byte-level integrity verification.

| Overview | Progression and inventory |
|---|---|
| ![FW OCTO Editor overview showing an active scavenger, resources, loadout, and quests](docs/screenshots/overview.png) | ![FW OCTO Editor characters and prestige controls](docs/screenshots/characters.png) |
| Active character, resources, loadout, and quest snapshot. | Character progression and prestige controls. |
| ![FW OCTO Editor weapon-build recommendations](docs/screenshots/weapon-builds.png) | ![FW OCTO Editor inventory with categorized equipment](docs/screenshots/inventory.png) |
| Best-in-slot build recommendations and owned-part actions. | Searchable, categorized inventory quantities. |
| ![FW OCTO Editor lifetime statistics dashboard](docs/screenshots/stats.png) | ![FW OCTO Editor acknowledgements dialog](docs/screenshots/acknowledgements.png) |
| Lifetime combat, map, and territory statistics. | Attribution, licenses, and the single-player disclaimer. |

## Tech Stack Overview

| Category       | Technology / Detail |
|----------------|---------------------|
| Runtime        | Node.js `>=22` (no build step) |
| Framework      | Express 4.x |
| Database       | SQLite3MC (encrypted SQLite, `cipher_compatibility = 3`) |
| GVAS Engine    | trumank/uesave (Rust CLI) — byte-identical round-trip verified |
| Frontend       | Vanilla JS SPA (`public/index.html` loads `public/app.mjs`, modular ES files in `public/modules/`, no bundler, no framework) |
| Testing        | Node built-in test runner (`node --test`) + Playwright browser tests |
| Dependencies   | `express` (single runtime dependency); `chart.js`, `@playwright/test`, `eslint` are dev-only |

## Quick start

The app lives in **`webapp/`** — there is no root `package.json`, so every `npm`/`node` command below runs from that directory.

```bash
cd webapp
npm install
npm start
```

The app binds to `http://127.0.0.1:3000` (loopback only). See **`INSTALL_GUIDE.md`** for the full setup walkthrough, including the native tools (SQLite3MC shell, `uesave`) and DB key the app needs before it can open a real save.

## Which doc do I read?

| Doc | Read it for |
|---|---|
| **`INSTALL_GUIDE.md`** | Setup: prerequisites, native tools, DB key, environment variables, first run, test suite. |
| **`DEVELOPER_GUIDE.md`** | Architecture, request lifecycle, service/route layering, and a cookbook for adding routes/services/UI. |
| **`AGENTS.md`** | Canonical agent ruleset — safety model, full API surface, conventions. Shared by every coding agent (Claude included). |
| **`CLAUDE.md`** | Short Claude Code-specific supplement to `AGENTS.md`. |
| **`TROUBLESHOOTING.md`** | Fixes for common runtime errors (missing tools, key/database problems, port conflicts). |
| **`TODO.md`** | Remaining `1.0.0` release blockers and historical changelog of stabilization work. |
| **`CHANGELOG.md`** | Released-version history. |
| **`ACKNOWLEDGEMENTS.md`** | Third-party software/data licenses and attribution. |

## What it does

The SPA is organized into five nav groups — Overview, Progression, Innards (hub upgrades), Inventory, and System (backups/diagnostics/settings) — covering characters, prestige, skills, weapon builds, weapon XP, presets, hub upgrades, inventory, rigs, vendors, repair, currencies, and lifetime stats. Every write is staged, verified, and automatically rolled back on failure; see `AGENTS.md` for the full safety model and API route table.

## Testing & Verification

```bash
cd webapp
npm test          # unit + relational/inventory validation tests (node --test)
npm run test:browser  # Playwright browser/UX tests
```

See `INSTALL_GUIDE.md` for the full test-suite breakdown and `webapp/test/TESTING-AUDIT.md` for the testing hardening history.
