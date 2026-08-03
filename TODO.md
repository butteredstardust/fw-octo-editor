# TODO — FW OCTO Editor

Current version: **0.10.0** (see `webapp/package.json`, `CHANGELOG.md`). This is a Nexus-readiness pass and is **not yet ready for Nexus publication** — see the open items below. The rest of this file is a historical log of stabilization work already completed.

## Remaining work before 1.0.0

### Safety and tests

- Add comprehensive GVAS golden fixtures for every supported map, duplicate names, additions, malformed layouts, and missing uesave.
- Add API smoke tests for every route and response-code class.
- Add browser tests for onboarding, navigation, write-disabled states, dialogs, error recovery, keyboard operation, responsive layouts, and reduced motion.

### Backup UX

- Add browser automation for backup keyboard flow, dialog focus trapping, API failures, and narrow responsive layouts.

### Data and licensing

- Add CC BY-SA dataset attribution plus application license and third-party notices for Express, Node, SQLite3MC, and uesave.
- Verify shared-key and native-binary redistribution against the game EULA and Nexus policy before packaging.

### Distribution and documentation

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

- Re-fetch and regenerate weapon data after major game/wiki schema changes; structured inventory acceptance still requires in-game confirmation.

---

## Completed (historical log)

This section is a running record of stabilization work already finished. Nothing below is an open item — it is kept for context on what has already been built and verified.

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
- Removed developer-specific save/key defaults by deriving paths from the environment and supporting `FW_DB_KEY_FILE`.
- Confirmed the updated loopback health endpoint reports compatible with SQLite3MC and uesave available.
- [done 2026-07-21] The bundled default DB key is no longer shipped as a plaintext file: `webapp/scripts/build-key-resource.js` encrypts it (AES-256-GCM, `webapp/utils/keyProtect.js`) into `webapp/resources/dbkey.resource.json`, which is what the app and the release build (`releases/build.ps1`) actually load/bundle; `fwinter-db-key.txt` stays a private, gitignored, never-shipped dev source. Users can now enter their own DB key via Settings → Database Key (verified against the live save, stored AES-256-GCM-encrypted at rest with a per-install secret, never as plain text) — replaces the prior hard rejection of any `dbKey` in `POST /api/settings`.

### Automated verification

- Node test runner configured with 19 passing tests.
- Current coverage includes validation, key redaction/loading, portable and Unicode paths, async staged-path isolation, data validation, backup hashes/manifests/sorting, restore confirmation, tamper rejection, and rollback.
- Disposable integration checks completed for weapon XP, prestige, and inventory quantity changes; live and known-good hashes remained unchanged.
- [done 2026-07-21] Added coverage for the encrypted key resource and custom-key flow: `keyProtect` round-trip/tamper/verifier tests, `keyLoader` resource-vs-plaintext-source precedence and dev auto-build fallback, `build-key-resource` script output, `configService` encrypted-override sanitize/set/clear round-trips (never plaintext on disk), and HTTP-level `/api/settings` tests for the new `dbKey` accept/reject/live-verify/clear paths (coverage gate stays green; `npm test` is otherwise green apart from 4 pre-existing unrelated `accessibility.test.js` failures and one pre-existing data-dependent e2e failure, neither touched by this change).

### Rigs and container kits

- Added a dedicated Rigs page with ownership/class/search filters, responsive rig cards, local SVG iconography, slot/capacity summaries, and session-preserved filters.
- Added an authoritative 11-rig server-side catalog whose rig and HQ container IDs are verified against the 100% reference save.
- Added staged ownership-only rig insertion and full high-quality container-set increments with byte-round-trip, target, integrity, foreign-key, hash, backup, race, and rollback verification.
- Kept active loadouts, Frames, large-item bins, and weapon bins outside the new mutations; structured rig writes remain experimental pending in-game confirmation.
- Added validation, structural, accessibility, duplicate, malformed-map, insertion, increment, and overflow tests.
- Corrected Overview loadout semantics: `ThrowWeapon_0/GRL00` is retained only as an internal throw mechanism in the API and is no longer presented as the equipped throwable, whose selection is not persisted in the readable loadout blobs.

### Safety and tests (release-blocker items now complete)

- Dependency-injected mutation fault coverage is implemented for concurrency, game/hash races, validation/action failures, install-copy failure, exact rollback, and rollback-copy failure reporting.
- Read-only diagnostics now surface save/tool/schema readiness and the inventory byte-round-trip result before mutation.

### Backup UX (release-blocker items now complete)

- Validated backup deletion and the accessible create/restore/delete UI are implemented with typed confirmations, progress states, focus return, active-session protection, and operation receipts.

### UI and accessibility

- [done 2026-07-19] Reviewed and corrected the automated UI/UX audit; fixed broken Overview resource request signatures, strict integer validation, visible mutation progress, ambiguous connection handling, mobile drawer focus isolation, page/render state preservation, skeleton/empty states, action contrast, touch targets, and last-verified-edit status.
- [done 2026-07-19] Added development-only Playwright coverage using a fully intercepted static fixture so browser UX tests cannot touch the live save.
- [done 2026-07-19] Semantic header/nav/main landmarks, skip navigation, visible focus, arrow-key navigation, page focus/announcements, responsive navigation, reduced-motion support, and the persistent safety header are implemented.
- [done 2026-07-19] Reorganized navigation into the planned Overview, Progression, Innards, Inventory, and System groups with a responsive mobile drawer.
- [done 2026-07-19] Added a cinematic industrial visual layer, balanced compact filtering layouts, and responsive data-heavy pages.
- [done 2026-07-19] Added shared ranked token search, result counts, filter chips, empty states, and debounced updates for Inventory and Add Items; Workshop and Munitions now search product names, IDs, and components.
- [done 2026-07-19] Friendly catalog names are primary across inventory, catalog, loadout attachments, crafting components, and weapon scopes; technical IDs remain available through accessible details controls.
- [done 2026-07-19] Inventory and catalog mutations now show per-row pending/success/error states, verified value updates, transient toasts, and expandable operation receipts.
- [done 2026-07-19] Workshop and Munitions batch actions now report per-item progress and refresh displayed inventory totals when complete.
- [done 2026-07-19] Blocking browser `alert`/`confirm` flows are replaced with accessible reusable dialogs; routine mutation outcomes now use contextual inline receipts with expandable verification metadata.
- [done 2026-07-19] Static and dynamically rendered inline event handlers are removed in favor of listeners/delegation; API-backed render paths are escaped and covered by a hostile-markup browser fixture.
- [done 2026-07-19] Split the SPA into native browser ES modules with shared runtime/API/UI contracts and page-domain features; extracted the inline stylesheet into an ordered external CSS module manifest without adding a framework or build step.
- [done 2026-07-21] Fixed WCAG AA contrast failure on primary amber CTAs (`.set`, `.btn-primary`, `.vendor-set`, `.add1`, `.res-set`, active nav button, skip link, hub unlock button): white-on-amber measured ~3.45:1; switched to a dark `--on-amber` text token (~6.1:1 resting, ~8:1 on the brightened hover state), matching the precedent already set by `.char-active-badge`.
- [done 2026-07-19] Migrated character, skill, hub, weapon XP, vendor, repair, and quest mutation outcomes and page-scoped errors into the shared inline feedback pattern; modal notices remain only for uncertain writes and pages without a contextual region.
- [done 2026-07-21] Redesigned the Crafting page from a single dropdown-driven detail view (pick one product, see its requirements in a mostly-empty pane) to a searchable/filterable card-per-recipe grid matching the Rigs/Inventory/Weapon XP pattern: all 37 Workshop / 23 Munitions recipes are now visible at once, each card carries its own Ready/Missing badge (computed against current inventory), full component breakdown, and its own craft-qty + Add Missing/Add All controls, plus a State filter (All/Ready/Missing) alongside the existing search. Removed the now-dead `.planner-split`/`.workshop-*` markup and CSS this replaced, consolidated `.recipe-card`'s box styling into the shared card-look rule other pages already use, and fixed a bug caught during testing where the grid was accidentally double-wrapped (only used its first ~320px column) and another where long component names clipped off their technical-ID disclosure button. Verified live: search, the state filter, and both card actions round-trip through the real save correctly.
- [done 2026-07-21] Added Codex resource cards to the Overview page's Resources section, reusing the existing Water/Credits/Drones card pattern (`RESOURCE_DEFS` in `dashboard.mjs`, same inventory update/add endpoints). The Codex (<https://theforeverwinter.wiki.gg/wiki/Codex>) is boss-drop crafting/quest material, not a lore log — confirmed via the wiki before building anything. Only the 6 variants actually confirmed present in the 100% reference save are shown (Rat King, Medium Mech, Grabber, Shield Officer, Mother Courage, Opal); the wiki also names Toothy/OrgaMech/Kotleta variants that aren't yet in `items.canonical.json`, intentionally omitted rather than guessed at an ID. Verified live: Add/Set both round-trip through the real save correctly, and the "Add" button correctly disappears once a variant is owned (matching Drones' behavior).
- [done 2026-07-21] Fixed Construction Drone (and 10 other components) showing as "holding unknown · not safely writable" on Upgrades/Crafting despite being manageable in Inventory: `data/recipes.canonical.json`/`recipe-audit.json`/`hub-upgrades.json` were stale — `items.canonical.json` had already picked up `Drone_Construction`'s correct `Items` mapping 18 hours earlier, but the derived recipe files were never regenerated to match. Re-ran `npm run recipes:generate` (pure local/offline transform, confirmed no network calls) and unsupported components dropped from 22 to 11 (unsupported products 2 to 1), with zero manual overrides needed. Investigated the user's other named example, Military Hard Drive, plus the remaining unresolved list against the wiki item/recipe snapshots: every remaining entry's override ID already matches the wiki's own internal tag (`Plans03` for Military Hard Drive, `BP_Loot_Explosives_C` for Explosives, the three `DecoLoot_0*_WaterThiefMask0*` IDs) — they're correctly flagged unsupported because those specific items were never captured in the reference save `items.canonical.json` was built from, not because of a wrong mapping; guessing a substitute ID would violate the project's verified-ID-only rule. Toothy/Orga Codex remain unresolved because no such wiki item page exists at all (consistent with the earlier Codex-cards exclusion). Added one small correctness fix: `IED` (the crafted product, not a component) had no override entry at all and fell through to a hard "unresolved" with no itemId; added `"IED": "IEDxplosive"` (its real wiki internal tag) so it resolves the same way its siblings do — still unsupported today (also absent from the reference-save catalog) but no longer a dead end, and it'll start working automatically if that item is ever added to `items.canonical.json`. Updated `test/recipeData.test.js`'s stale 22/2 count assertion and its Construction-Drone-is-unsupported assertion (inverted — it's now supported); added a new test asserting Construction Drone resolves to `Drone_Construction`/`writable:true` across all recipes, and swapped the unsupported-example assertion to Military Hard Drive (still correctly unsupported, and the user's own second example). Verified live: Bar Upgrade V2's Construction Drone requirement now shows "have 12 · ready" instead of "holding unknown"; Crafting page renders correctly against the regenerated data. Full suite (132/132) and lint pass.
- [done 2026-07-21] Fixed the app title never actually rendering in Black Ops One: it loaded from `fonts.googleapis.com`, which CSP's `style-src 'self' 'unsafe-inline'` silently blocks (confirmed via console error) — and even if it weren't blocked, an outbound request on every launch conflicts with the "no outbound requests" release requirement. Vendored the (OFL-1.1 licensed, redistribution-permitted) TTF locally and load it via `@font-face` instead. Also fixed the existing browser regression test for this (`application title uses the Black Ops One font family`): it only asserted the CSS *declares* the font, which stays true even when the browser fails to fetch it — exactly why it never caught this bug — so it now asserts via the `document.fonts` API that the font actually finished loading, and would have failed before this fix (verified).
- [done 2026-07-21] Extended the same fix to Saved Presets and Best-in-Slot Weapon Builds: both toolbars were bespoke bare grids (`.preset-toolbar`, `.weapon-build-toolbar`) with no box/border/background at all, so they visibly didn't match the shared `.filter-bar` look used everywhere else. Switched both to the `.filter-bar` class, keeping only their page-specific column-count override; removed the now-redundant `display/gap/align-items/label` declarations that duplicated what `.filter-bar` already provides. Verified search/select filtering still works on both pages after the markup change.
- [done 2026-07-21] Made Weapon XP's search/filter bar genuinely match Rigs/Add Items/Inventory instead of a hand-matched imitation: switched its markup to the shared `.filter-bar` class (same box, grid layout, label style, results-count line) instead of a bespoke `.weapon-controls` flex row, added it to the same sticky-bar CSS pattern, and removed the now-dead `.weapon-controls` rules (also found and removed a fully-superseded, always-losing `.filter-bar`/`.weapon-controls` sticky rule left over in shared-pages.css from before the per-page sticky fix).
- [done 2026-07-21] Fixed a real bug found while extending the Enter-to-submit work: `vendors-repair.mjs` carried a leftover duplicate of Inventory's quantity-update logic; because of ES module load order it silently shadowed the real (correct) implementation in `inventory.mjs`, so Manage Inventory's displayed totals and category counts went stale after every edit (verified live: edited a quantity, watched the total not update; removed the dead duplicate, re-verified the total updates correctly). Also extended Enter-to-submit/auto-select to Character detail (Prestige level/XP — correctly resolves each field to its own button, not a single "primary" per container), Weapon XP, and Vendors faction score; added a missing search field to Weapon XP (previously the only item-heavy page without one) and made its filter bar sticky, reusing the Rigs/Inventory/Add Items pattern.
- [done 2026-07-21] Targeted UX refinements for Manage Inventory, Add Items, and Rigs (the highest-traffic pages): quantity fields now submit on Enter (matches the adjacent Set/Add Item button) instead of requiring a mouse click; focusing a quantity field auto-selects its value so typing immediately replaces it; the search/filter bar is now sticky while scrolling a long expanded category (previously only styled as sticky on Rigs, but silently broken everywhere — `.card`'s `overflow:hidden`, added to clip the decorative top accent bar to its rounded corners, was suppressing `position:sticky` on every descendant; fixed by giving the accent bar its own `border-radius:inherit` and scoping `overflow:visible` back onto these three pages' card).
- [done 2026-07-21] Pre-release UI sweep: removed a dead `.nav button.active` CSS rule shadowed by refinements.css (it never rendered — the fix looked applied but wasn't); de-duplicated a hardcoded `#20232A` hover color (6 sites) onto the existing `--surface-hover` token; added `esc()` to previously-unescaped hub upgrade name/group and inventory/add-items category text; replaced duplicated inline `style="..."` strings (inventory summary line, character-detail section headings, character-detail number-input widths) with shared CSS classes; added a `gap` to `.repair-card-head` and a narrow-viewport rule for `.char-xp-bar` to match sibling pages. (Card-grid gap and number-input-width variance across pages were reviewed and intentionally left as-is — content-driven, not bugs.)

### Data and licensing

- [done 2026-07-19] Version Workshop, Munitions, and Innards recipes through wiki snapshots, canonical generation, reviewed overrides, and audit data.
- [done 2026-07-19] Hub-upgrade costs, prerequisites, exact tag checks, and recipe/prerequisite cycle validation are generated and tested.
- [done 2026-07-19] Manufacture Booster now comes directly from the structured wiki recipe snapshot.

### Distribution and documentation

- [done 2026-07-21] Trimmed redundant page headings to match the nav label they sit under (heading text was restating context already visible in the sidebar): Upgrades page dropped its "Writes are experimental / dismantled at no cost" caveat sentence and shortened "Innards / Hub Upgrades" to "Innards"; Vendors dropped "& Faction Trust"; Crafting dropped "— Batch Component Planner"; Weapon Builds dropped "Best-in-Slot". No functional changes; verified full suite (132/132) and lint after each.
- [done 2026-07-21] Added iconography to Vendors page cards (previously plain text, the only remaining page without card icons): named vendors (`.trader-card`, both the roster and the save-flag unlock sections) now show an icon reflecting what they're known for (medic cross for Heisenburg, ammo box for Bunco, pack for Bundleton, weapon silhouette for Luca/Kane, quest scroll for Vladelets, runner for Slade, robot for the automated Auto-Vendor), and Faction Trust cards (`.vendor-card`) get a shield badge. Added 3 new icons (`weapon`, `quest`, `shield`) to the existing dependency-free `APP_ICON_PATHS` set in `core.mjs` rather than a new icon system; reused the same chip-box CSS pattern already established for `.char-icon`/`.hub-icon`/`.res-icon`. Verified live via a full-page screenshot against the real save — all 8 named vendors and all 6 factions (including ScavengerNPC/WaterThief, which aren't in the curated roster list) render distinct, correctly-aligned icons; full suite (132/132) and lint pass.
- [done 2026-07-21] Extended card iconography to Weapon XP and Crafting. Weapon XP cards (`.weapon-card`) all use the same `weapon` icon (reused from the Vendors work) rather than one icon per weapon category: `itemTypeIcon`'s keyword matching would have collapsed most of the 9 categories (Pistols/Rifles/Heavy Rifles/LMG/HMG/Shotguns/Grenade Launchers) onto the same icon anyway since they all contain a matched keyword, while Submachine Guns/Gunhead would've landed on the generic fallback by accident — a meaningless, confusing split; the category is already shown via the adjacent `.weapon-cat-badge` text. Crafting cards (`.recipe-card`) use a station-based icon instead (`workshop` for Workshop Components, `ammo` for Munitions, keyed off the reliable `recipe.station` field) rather than guessing per-product-name icons, since recipe products have no taxonomy data to key off and `itemTypeIcon` is built for category strings, not proper names like "20mm Turret" or "Adrenaline Stim". Verified live via screenshots on both pages (including switching to the Munitions tab to confirm the icon actually changes) against the real save; full suite (132/132) and lint pass.
- [done 2026-07-21] Fixed a real bug on the Overview Resources cards (`dashboard.mjs`): the "Set" button was always shown for every Codex/Drone card, but `POST /inventory/update` throws ("Item X not found in TempInventory") for any inventory item not yet owned — so clicking Set on an unowned Codex card (quantity 0, which is all 6 of them by default) was a guaranteed error. Since this is the shared `RESOURCE_DEFS` render path, the same bug affected the 3 Drone cards too, not just Codex. Fixed by hiding the Set button whenever an inventory-kind card isn't owned yet, leaving only Add (which is the only op that can actually succeed); currency cards (Water/Credits) are unaffected since currency rows always exist and Set always works there. Verified live: all 6 unowned Codex cards now show only Add, while owned Drone cards still show Set; full suite (132/132) and lint pass.
- [done 2026-07-21] Fixed wasted space on the Repair Bench page: the "Active Repair Job" panel was forced to `min-height:100%` against a right-hand sidebar stack containing both the Workbench panel and a tall 9-row Faction IFF Chips list, so an idle job (just a status line + em-dash) got stretched to match that combined height, leaving a large empty gap before the button (pinned to the bottom via `margin-top:auto`). Split Faction IFF Chips out of the sidebar into its own full-width section below, rendered as a `.iff-grid` of small per-chip cards (name, faction/level, quantity, "used by N weapon(s)") instead of one narrow list — same pattern already used for Repairable Weapons. `.repair-grid` is now just two comparably-sized panels (Active Repair Job, Workbench) side by side, so the height-matching no longer produces a large gap. Removed the now-dead `.repair-side-stack`/`.repair-iff-panel`/`.repair-req-row` CSS this replaced. Verified live: IFF chips now render as a 5-column card grid and the top panels are both compact regardless of repair state; full suite (132/132) and lint pass.
- [done 2026-07-21] Package the portable loader with a release-only encrypted key resource (never the plaintext key file); `releases/build.ps1` builds and bundles `webapp/resources/dbkey.resource.json` instead of copying `fwinter-db-key.txt`.

### Weapon builds

- Added a versioned wiki Cargo snapshot, canonical mapping audit, deterministic balanced build recommendations, progression/ownership disclosure, and guarded experimental one-pass missing-part additions.
