# Changelog

All notable changes to the Forever Winter Save Editor webapp are documented in
this file. The project follows a simple `MAJOR.MINOR.PATCH` scheme; it has not
yet reached `1.0.0` (see release blockers in `TODO.md`).

## [Unreleased]

Internal, behavior-preserving modularization — no user-facing changes.

### Changed
- Split `webapp/services/saveService.js` and `webapp/services/gvasService.js`
  into domain modules under `webapp/services/save/` and `webapp/services/gvas/`
  respectively, with the original files kept as thin re-exporting facades so
  existing `require()` call sites are unaffected. Factored the repeated
  before/after integrity+FK+hash snapshot in every write function into a
  shared `withWriteReceipt()` helper (`webapp/services/save/receipt.js`).
- Split `webapp/routes/api.js` into per-domain routers under
  `webapp/routes/api/` (settings, status, characters, hub, weapons,
  inventory, vendors, quests, backups), plus shared `webapp/routes/lib/`
  helpers (`handle`/`handleMutation`, `resolveKey`/`runMutation`) factoring
  out the repeated try/catch and mutation-response boilerplate.
- Split the frontend `webapp/public/modules/core.mjs`,
  `webapp/public/modules/system.mjs`, and
  `webapp/public/modules/features/inventory.mjs` into smaller sibling
  modules/directories, kept behind the same import surface.
- HTTP routes, method/path pairs, and all public export surfaces are
  unchanged; this is a file-layout refactor only.

## [0.10.0] — 2026-07-21

Nexus-readiness pass: closes the shared-key distribution blocker, sweeps UI
consistency/accessibility issues, and fixes several real correctness bugs
found along the way. **Still not yet ready for public (Nexus) distribution**
— the offline installer, license/EULA review, and closed-game acceptance
pass are unfinished (see `TODO.md`).

### Added
- Database key is no longer shipped as plaintext: the bundled key is stored
  as an AES-256-GCM encrypted resource (`webapp/resources/dbkey.resource.json`,
  built from the private `fwinter-db-key.txt` via `npm run key:build-resource`)
  with a salted/iterated PBKDF2-HMAC-SHA512 verifier. Users can also enter
  their own key via Settings (`POST /api/settings`), verified against the
  live save before being accepted and stored encrypted at rest with a
  per-install secret — never as plaintext.
- Codex resource cards on the Overview page (the 6 variants confirmed
  present in the 100% reference save).
- Card iconography on Vendors, Weapon XP, and Crafting (previously the only
  pages without it), reusing the existing dependency-free `APP_ICON_PATHS`
  icon set rather than introducing a new system.
- Recipe/upgrade component overrides double-checked against live wiki data;
  `IED` (a crafted product with no prior override) now resolves to its real
  wiki internal tag instead of a dead-end "unresolved" state.

### Changed
- Crafting page redesigned from a single dropdown-driven detail view to a
  searchable/filterable per-recipe card grid (all 60 Workshop/Munitions
  recipes visible at once, each with its own Ready/Missing badge, component
  breakdown, and craft-qty + Add controls).
- Repair Bench layout: Faction IFF Chips moved out of a cramped sidebar list
  into its own full-width card grid, eliminating a large wasted-space gap
  under the Active Repair Job panel.
- Search/filter bars on Weapon XP, Saved Presets, and Best-in-Slot Weapon
  Builds now match the shared `.filter-bar` style used elsewhere.
- Trimmed redundant page headings that only restated the sidebar nav label.
- App title font (Black Ops One) is now vendored locally instead of loaded
  from `fonts.googleapis.com`, which CSP silently blocked and which
  conflicted with the "no outbound requests" release requirement.

### Fixed
- Regenerated stale recipe/hub-upgrade data (`recipes.canonical.json` and
  friends were ~18 hours stale relative to `items.canonical.json`), fixing
  Construction Drone and 10 other components that showed as "holding
  unknown · not safely writable" despite being manageable elsewhere in the
  app.
- Overview Resource cards (Codex/Drones): the "Set" button was shown even
  for unowned items, but the underlying write always fails for anything not
  yet in inventory — Set is now hidden until an item is owned, leaving only
  the (correct) Add action.
- `vendors-repair.mjs` carried a dead duplicate of Inventory's quantity-update
  logic that silently shadowed the real implementation via module load
  order, leaving Manage Inventory's displayed totals stale after edits.
- WCAG AA contrast failure on primary amber CTAs (white-on-amber measured
  ~3.45:1); switched to a dark `--on-amber` token (~6.1:1 resting).
- Sticky filter bars were silently broken on Manage Inventory, Add Items,
  and Rigs by a `.card { overflow:hidden }` rule added for an unrelated
  decorative element.
- Various smaller UI/escaping/dead-CSS cleanups (see `TODO.md` for detail).

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

[0.10.0]: #0100--2026-07-21
[0.9.0]: #090--2026-07-19
