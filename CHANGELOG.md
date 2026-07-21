# Changelog

All notable changes to the Forever Winter Save Editor webapp are documented in
this file. The project follows a simple `MAJOR.MINOR.PATCH` scheme; it has not
yet reached `1.0.0` (see release blockers in `TODO.md`).

## [0.9.0] — 2026-07-19

Stabilization build. **Not yet ready for public (Nexus) distribution.**

### Added
- Centralized, serialized copy-on-write mutations through `mutationService`
  with automatic primary rollback and live-hash race detection.
- Strict write safety: integrity check, foreign-key check, and SHA-256
  before/after hashing on every write, with standardized operation receipts
  (`operationId`, `backupId`, before/after hashes, integrity/FK, target
  verification, warnings, `rollbackStatus`).
- Game-closed enforcement before mutation and immediately before install.
- Mandatory `uesave` round-trip verification (byte-identical SHA-256) before
  every inventory write, with heuristic `binaryParser` read-only fallback.
- Versioned JSON backup manifests with app version, session ID, label,
  timestamp, and SHA-256 hashes; validated create/restore/delete with
  confirmation and sort by manifest time.
- `/api/health` and expanded `/api/status` with compatibility and write-readiness.
- Compatibility checks: schema, required-row, save-variant, SQLite3MC, and
  uesave availability.
- Security hardening: loopback-only bind, strict Host validation, same-origin
  mutation checks, per-launch CSRF token, conservative response headers.
- Portable Node key loader (no PowerShell); removed persisted plaintext key
  overrides; legacy settings sanitized.
- Dedicated Rigs page with server-side 11-rig catalog, HQ container IDs
  verified against the 100% reference save.
- Read-only Diagnostics page surfacing save/tool/schema readiness and the
  inventory byte-round-trip result.
- Responsive SPA split into native browser ES modules; removed inline event
  handlers; shared inline feedback/error pattern with expandable receipts.
- Semantic navigation, focus management, keyboard support, and
  `prefers-reduced-motion` support.
- CC BY-SA dataset attribution, MIT application license, and third-party
  notices (`ACKNOWLEDGEMENTS.md`, `webapp/LICENSE`, `TROUBLESHOOTING.md`).

### Changed
- Weapon and character XP window/counter targeting corrected.
- Weapon XP batches made atomic.
- Unknown hub-upgrade rows preserved during writes.
- Prestige handling imports the 28 exact reference grant rows using binary
  skill states.
- Overview loadout semantics corrected (`ThrowWeapon_0/GRL00` no longer shown
  as equipped throwable).
- Wiki-sourced recipes (Workshop, Munitions, Innards) versioned via snapshots,
  canonical generation, reviewed overrides, and audit data.

### Fixed
- Launcher working directory.
- Developer-specific save/key defaults removed; paths derived from environment
  with `FW_DB_KEY_FILE` support.
- Various UI/UX audit issues: broken Overview resource requests, integer
  validation, visible mutation progress, connection handling, mobile drawer
  focus isolation, page/render state preservation, skeleton/empty states,
  action contrast, touch targets, last-verified-edit status.

### Known limitations (experimental)
- Rig ownership / high-quality container sets.
- Structured `TempInventory` edits (confirm parts in-game).
- `setQuestReady` (game may re-validate quest counters on load).

## [0.2.0] — prior
- Themed UI iteration ("foreverwinter" theme) and item-data canonicalization
  work captured in backups (`v0.2-theme-foreverwinter-*`).

## [Unreleased]
See `TODO.md` "Remaining release blockers" for what must land before `1.0.0`:
- GVAS golden fixtures and full API/browser test coverage.
- Offline portable installer (Inno Setup) with bundled Node and pinned native
  tools, health polling, duplicate-instance protection, backup-preserving
  uninstall.
- README, privacy statement, support template, Nexus description, release guide.
- EULA/Nexus policy review of shared-key and native-binary redistribution.
- Final closed-game live-save acceptance and end-to-end rollback demo.

[0.9.0]: #090--2026-07-19
