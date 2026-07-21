# 0.9 stabilization checklist

Current version: **0.9.0**. This is a stabilization build and is **not ready for Nexus publication**.

## Completed

### Save safety and mutations

- Created and hash-verified the pre-hardening source snapshot and independent three-save backup.
- Centralized writes through serialized copy-on-write staging.
- Enforced game-closed checks before mutation and immediately before installation.
- Added live-primary hash race detection, staged/install validation, and automatic primary rollback.
- Preserved both known-good save variants during normal writes and restores.
- Standardized mutation receipts with operation/backup IDs, hashes, integrity/FK results, target verification, warnings, and rollback status.
- Added exact affected-row and target-value verification to all relational and inventory mutations.
- Corrected weapon and character XP window/counter targeting.
- Made weapon XP batches atomic.
- Preserved unknown hub-upgrade rows.
- Corrected prestige handling to import the 28 exact reference grant rows and use binary skill states.
- Added strict integer, range, boolean, duplicate, identifier, and catalog validation where applicable.

### Inventory

- Made uesave mandatory for inventory writes while retaining the heuristic parser for read-only fallback.
- Added a mandatory byte-identical uesave round-trip before every inventory write.
- Added exact installed-blob, map, entry-count, and quantity verification.
- Verified a disposable inventory quantity mutation without changing live or known-good saves.

### Backups and restore

- Replaced PowerShell hashing/filesystem logic with Node `crypto` and `fs`.
- Added versioned JSON manifests with app version, session ID, label, timestamp, and SHA-256 hashes.
- Removed silent backup pruning and sort backups by manifest timestamp.
- Added validated `POST /api/backups` backup creation.
- Added explicit-confirmation `POST /api/backups/:id/restore`.
- Restore verifies all three backup variants, creates a fresh safety backup, stages and validates the selected primary, and restores only the primary.
- Tested tamper rejection and byte-exact automatic rollback after simulated installed-save validation failure.

### Compatibility, API, security, and portability

- Added `/api/health` and expanded `/api/status` with compatibility and write-readiness information.
- Added schema, required-row, save-variant, SQLite3MC, and uesave availability checks.
- Added strict loopback Host validation, same-origin mutation checks, per-launch CSRF protection, conservative response headers, and loopback-only binding.
- Fixed the launcher working directory.
- Replaced PowerShell key loading with a portable Node resource loader.
- Removed persisted plaintext key overrides from settings, API, and UI; legacy settings are sanitized.
- Removed developer-specific save/key defaults by deriving paths from the environment and supporting `FW_DB_KEY_FILE`.
- Confirmed the updated loopback health endpoint reports compatible with SQLite3MC and uesave available.

### Automated verification

- Node test runner configured with 19 passing tests.
- Current coverage includes validation, key redaction/loading, portable and Unicode paths, async staged-path isolation, data validation, backup hashes/manifests/sorting, restore confirmation, tamper rejection, and rollback.
- Disposable integration checks completed for weapon XP, prestige, and inventory quantity changes; live and known-good hashes remained unchanged.

### Rigs and container kits

- Added a dedicated Rigs page with ownership/class/search filters, responsive rig cards, local SVG iconography, slot/capacity summaries, and session-preserved filters.
- Added an authoritative 11-rig server-side catalog whose rig and HQ container IDs are verified against the 100% reference save.
- Added staged ownership-only rig insertion and full high-quality container-set increments with byte-round-trip, target, integrity, foreign-key, hash, backup, race, and rollback verification.
- Kept active loadouts, Frames, large-item bins, and weapon bins outside the new mutations; structured rig writes remain experimental pending in-game confirmation.
- Added validation, structural, accessibility, duplicate, malformed-map, insertion, increment, and overflow tests.
- Corrected Overview loadout semantics: `ThrowWeapon_0/GRL00` is retained only as an internal throw mechanism in the API and is no longer presented as the equipped throwable, whose selection is not persisted in the readable loadout blobs.

## Remaining release blockers

### Safety and tests

- Dependency-injected mutation fault coverage is implemented for concurrency, game/hash races, validation/action failures, install-copy failure, exact rollback, and rollback-copy failure reporting.
- Add comprehensive GVAS golden fixtures for every supported map, duplicate names, additions, malformed layouts, and missing uesave.
- Add API smoke tests for every route and response-code class.
- Add browser tests for onboarding, navigation, write-disabled states, dialogs, error recovery, keyboard operation, responsive layouts, and reduced motion.
- Read-only diagnostics now surface save/tool/schema readiness and the inventory byte-round-trip result before mutation.

### Backup UX

- Validated backup deletion and the accessible create/restore/delete UI are implemented with typed confirmations, progress states, focus return, active-session protection, and operation receipts.
- Add browser automation for backup keyboard flow, dialog focus trapping, API failures, and narrow responsive layouts.

### UI and accessibility

- [done 2026-07-19] Reviewed and corrected the automated UI/UX audit; fixed broken Overview resource request signatures, strict integer validation, visible mutation progress, ambiguous connection handling, mobile drawer focus isolation, page/render state preservation, skeleton/empty states, action contrast, touch targets, and last-verified-edit status.
- [done 2026-07-19] Added development-only Playwright coverage using a fully intercepted static fixture so browser UX tests cannot touch the live save.

- Semantic header/nav/main landmarks, skip navigation, visible focus, arrow-key navigation, page focus/announcements, responsive navigation, reduced-motion support, and the persistent safety header are implemented.
- Reorganized navigation into the planned Overview, Progression, Innards, Inventory, and System groups with a responsive mobile drawer.
- Added a cinematic industrial visual layer, balanced compact filtering layouts, and responsive data-heavy pages.
- Added shared ranked token search, result counts, filter chips, empty states, and debounced updates for Inventory and Add Items; Workshop and Munitions now search product names, IDs, and components.
- Friendly catalog names are primary across inventory, catalog, loadout attachments, crafting components, and weapon scopes; technical IDs remain available through accessible details controls.
- Inventory and catalog mutations now show per-row pending/success/error states, verified value updates, transient toasts, and expandable operation receipts.
- Workshop and Munitions batch actions now report per-item progress and refresh displayed inventory totals when complete.
- Blocking browser `alert`/`confirm` flows are replaced with accessible reusable dialogs; routine mutation outcomes now use contextual inline receipts with expandable verification metadata.
- [done 2026-07-19] Static and dynamically rendered inline event handlers are removed in favor of listeners/delegation; API-backed render paths are escaped and covered by a hostile-markup browser fixture.
- [done 2026-07-19] Split the SPA into native browser ES modules with shared runtime/API/UI contracts and page-domain features; extracted the inline stylesheet into an ordered external CSS module manifest without adding a framework or build step.
- Complete semantic navigation, focus management, keyboard, contrast, screen-reader, responsive, and `prefers-reduced-motion` work.
- [done 2026-07-19] Migrated character, skill, hub, weapon XP, vendor, repair, and quest mutation outcomes and page-scoped errors into the shared inline feedback pattern; modal notices remain only for uncertain writes and pages without a contextual region.

### Data and licensing

- [done 2026-07-19] Version Workshop, Munitions, and Innards recipes through wiki snapshots, canonical generation, reviewed overrides, and audit data.
- [done 2026-07-19] Hub-upgrade costs, prerequisites, exact tag checks, and recipe/prerequisite cycle validation are generated and tested.
- [done 2026-07-19] Manufacture Booster now comes directly from the structured wiki recipe snapshot.
- Add CC BY-SA dataset attribution plus application license and third-party notices for Express, Node, SQLite3MC, and uesave.
- Verify shared-key and native-binary redistribution against the game EULA and Nexus policy before packaging.

### Distribution and documentation

- Package the portable loader with a release-only key placeholder/resource; never commit or print the shared key.
- Build the offline per-user Inno Setup installer with bundled Node, production dependencies, pinned native tools, hidden launcher, duplicate-instance protection, health polling, and backup-preserving uninstall.
- Add README, installation/troubleshooting guide, privacy statement, changelog, support template, Nexus description, and release guide.
- Audit the release package to exclude saves, reference saves, secrets, developer paths, temporary exports, and development `node_modules` debris.

### Acceptance

- Validate install, launch, read, backup, staged write, restore, restart, and uninstall on a clean offline Windows VM.
- Complete final closed-game live-save acceptance with one minimal change per feature family, successful in-game persistence, and restoration afterward.
- Demonstrate end-to-end rollback and confirm there are no known data-loss defects.
- Confirm the package makes no outbound requests and passes Defender/Nexus scanning.
- Promote to `1.0.0` only after every release blocker above is resolved.

### Weapon builds

- Added a versioned wiki Cargo snapshot, canonical mapping audit, deterministic balanced build recommendations, progression/ownership disclosure, and guarded experimental one-pass missing-part additions.
- Re-fetch and regenerate weapon data after major game/wiki schema changes; structured inventory acceptance still requires in-game confirmation.
