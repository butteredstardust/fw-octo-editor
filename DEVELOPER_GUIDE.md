# Developer Guide — Forever Winter Save Editor

## System Architecture & Design Patterns

### Architectural Paradigm
The application follows a **layered service architecture** with no formal MVC framework:

```
public/                  Vanilla JS SPA (no bundler, no framework)
  index.html             Markup + inline CSS (~370 lines)
  app.mjs                Entry point — imports feature modules
  app.js                 Legacy monolithic bundle (~3016 lines, retained but unused by index.html)
  modules/
    core.mjs             Shared utilities, icons, escaping
    runtime.mjs          App bootstrap, page routing, state
    api-client.mjs       Typed fetch wrappers
    ui-utils.mjs         Filtering, ranking, debounce, receipts
    features/
      dashboard.mjs      Overview page
      characters.mjs     Characters + character detail
      weapons.mjs        Weapon builds, presets, weapon XP
      inventory.mjs      Inventory + add items + rigs
      vendors-repair.mjs Vendors + repair bench
      settings-planners.mjs Settings + workshop + munitions
      hub.mjs            Hub upgrades
    system.mjs           Backups + diagnostics
    recipe-planner.mjs   Workshop/munitions planning logic
    recipe-data.mjs      Recipe definitions
  styles.css             Base styles
  css/
    foundation.css
    shared-pages.css
    inventory.css
    progression.css
    people-and-vendors.css
    planners.css
    repair.css
    refinements.css
  catalog.json           100%-save item catalog
  workshop-recipes.js    Workshop recipe data
  munitions-recipes.js   Munitions recipe data
  ui-utils.js            Legacy shared utilities (retained)
  api-client.js          Legacy API client (retained)
  recipe-planner.js      Legacy recipe planner (retained)
  recipe-data.js         Legacy recipe data (retained)

routes/
  api.js                 Express Router — all /api/* endpoints (~511 lines)
  pages.js               SPA fallback (non-/api GETs -> index.html)

services/
  saveService.js         Relational-table reads/writes (~1012 lines)
  gvasService.js         TempInventory / GVAS blob engine (~728 lines)
  binaryParser.js        Legacy heuristic inventory parser (~178 lines, fallback only)
  mutationService.js     Staged copy-on-write mutation orchestrator (~122 lines)
  backupService.js       App-level backup creation / restore / delete (~188 lines)
  configService.js       Save-directory override + AsyncLocalStorage context (~94 lines)
  compatibilityService.js Pre-write compatibility checks (~33 lines)
  weaponBuildService.js  BIS weapon build selection + part ownership logic (~73 lines)
  presetService.js       Weapon/rig preset parsing from PlayerCustomRigs (~24 lines)

utils/
  validation.js          SQLite3MC shell wrapper, integrity/FK checks, output sanitization (~85 lines)
  keyLoader.js           Loads the 32-char DB key from the bundled resource (~11 lines)
  processCheck.js        Detects if The Forever Winter game process is running (~18 lines)
```

### Key Design Decisions
- **No build step**: `server.js` + `public/app.mjs` are served directly. Feature code lives in vanilla ES modules under `public/modules/`. No transpilation, bundling, or framework runtime.
- **Single runtime dependency**: Only `express` is in `dependencies`.
- **Loopback-only binding**: Server listens on `127.0.0.1:3000`; it can overwrite the live save, so network exposure is prevented at the bind level.
- **Staged mutations**: `mutationService.mutate()` copies the live save to a temp directory, runs the action there, validates, then atomically installs. If installation validation fails, it **automatically rolls back** using a pre-install snapshot.
- **Write safety gates**: Every mutation checks (1) game is closed, (2) compatibility is confirmed, (3) no concurrent mutation is active, (4) live save hasn't changed during staging.
- **Frontend state management**: No framework state manager. The SPA uses module-scoped variables (`_inventory`, `_weaponXp`, `_rigData`, etc.) and re-fetches data after mutations. Session storage preserves filter/selection state across page navigations.

## Request Lifecycle & Data Flow

### Read Request (e.g., `GET /api/characters`)
1. **Middleware pipeline** (`server.js`): Host validation (rejects non-loopback `Host` headers), security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, CSP), JSON body parsing (50MB limit), static file serving.
2. **Route handler** (`routes/api.js`): Calls `resolveKey(req)` to get the DB key from `app.locals.dbKey`.
3. **Service layer** (`saveService.listCharacters(key)`): Builds parameterized SQL, calls `runShell(dbPath, key, [sql])`.
4. **Shell execution** (`utils/validation.js`): Spawns `sqlite3mc_shell_x64.exe`, pipes `PRAGMA key`, `PRAGMA cipher_compatibility = 3`, the SQL, and `.quit`. Filters `ok` lines and redacts the key from output via `sanitizeOutput()`.
5. **Response**: Service returns parsed JSON; route sends `res.json()`.

### Write Request (e.g., `PUT /api/characters/:id/level`)
1. **CSRF / mutation gate** (`server.js`): Rejects non-GET mutations without a valid `X-CSRF-Token`, blocks if another mutation is active, and rejects if the game process is running.
2. **Route handler**: Validates input, wraps the service call in `runMutation(req, label, callback)`.
3. **Mutation orchestrator** (`mutationService.mutate`):
   - Creates a session backup (`before-<label>-<timestamp>`).
   - Copies all three save variants to a temp directory.
   - Takes a pre-install hash of the live primary.
   - Runs the action callback against the temp directory (via `configService.withSaveDir`).
   - Validates the staged database (integrity + foreign keys).
   - Re-checks that the live primary hasn't changed.
   - Atomically copies staged primary over live primary.
   - Re-validates the installed live save.
   - Returns a unified receipt with `operationId`, `backupId`, `beforeHashes`, `afterHashes`, `beforeIntegrity`, `afterIntegrity`, `beforeFk`, `afterFk`, `targetVerification`, and `rollbackStatus`.
4. **Rollback on failure**: If any step after installation throws, the service restores the pre-install snapshot and reports `rollbackStatus`.

### GVAS / Inventory Write Path
1. `gvasService` reads the encrypted `TempInventory` blob from `BinaryData`.
2. Decrypts and pipes through `uesave to-json` in a temp directory.
3. **Mandatory byte-identical round-trip check**: `to-json -> from-json` must reproduce the original blob exactly. If not, inventory writes are disabled.
4. Edits are made in-place on the parsed JSON object.
5. `uesave from-json` re-serializes the blob.
6. Blob is written back to SQLite via `UPDATE BinaryData SET Value = X'<hex>'`.
7. Full verification: installed blob hash, JSON re-parse, entry count, and quantity checks.

## Core Modules & Services

### `saveService.js`
The primary relational-table service. Contains:
- **Input validators**: `toNumber`, `toInteger`, `sqlStr`, `requireChangedRows`. All server-side; no client coercion is trusted.
- **Character operations**: `listCharacters`, `updateCharacterLevel`, `setPrestige` (imports exact 28-row grant set from the reference save), `listCharacterDetails`, `setCharacterXp`, `setCharacterSkills`.
- **Hub upgrades**: `listHubUpgrades`, `setHubUpgrades` (preserves unknown tags, replaces managed set).
- **Weapon XP**: `listWeaponXp`, `setWeaponXp`, `batchSetWeaponXp`, `getReferenceWeaponXp` (reads the 100% reference save on demand).
- **Vendors**: `listFactionScores`, `setFactionScore`, `listTraderUnlocks`, `setTraderUnlock`.
- **Currencies**: `getCurrencies` (`WaterBarrels`, `TestCurrency`), `setCurrency`.
- **Dashboard**: `getDashboardData` aggregates character, loadout, quests, inventory, and currencies.
- **Repair**: `getRepairStatus` (repair timer, bench unlock, IFF chips, destroyed weapons), `collectRepair` (sets `NextOccurrence` to now), `setQuestReady` (experimental — the game may re-validate quest counters on load and revert the status).
- **Hashing**: `getFileHashes()` computes SHA-256 for all three save variants.

### `gvasService.js`
The GVAS blob engine. Contains:
- `readTempInventoryBlob` / `writeTempInventoryBlob` — decrypt/encrypt via SQL shell.
- `blobToJson` / `jsonToBlob` — shell out to `uesave to-json` / `uesave from-json` in temp dirs.
- `listInventoryItems` — structured read across `Items_0`, `Weapons_0`, `Danglies_0`; falls back to `binaryParser` if uesave is unavailable.
- `updateInventoryItem` / `addInventoryItem` / `ensureInventoryItems` — structured writes (verified in-game).
- `readAllMaps` / `readNamedBlobJson` — generic GVAS readers for other blobs (`PlayerLoadout`, `PlayerCustomRigs`).
- `listRigs` / `addRigOwnership` / `addHighQualityContainerSet` — rig and container structured edits (verified in-game).
- **Circular dependency note**: `saveService` requires `gvasService` and vice versa. `gvasService` uses lazy `require('./saveService')` inside functions to avoid empty exports at load time.

### `mutationService.js`
The single entry point for all database mutations. Enforces:
- Game-closed checks before and during mutation.
- Compatibility validation.
- Session backup creation.
- Staged copy-on-write with temp directory isolation.
- Pre/post integrity, foreign-key, and hash verification.
- Automatic rollback on post-install validation failure.

### `configService.js`
Manages the save-directory override and `AsyncLocalStorage` context. Key behaviors:
- `getSaveDir()` returns the override, the `AsyncLocalStorage` context (for staged mutations), or the default.
- `withSaveDir(dir, callback)` runs a callback in an `AsyncLocalStorage` context so nested service calls resolve the temp directory correctly.
- **Database keys are never persisted in settings**; the API explicitly rejects `dbKey` in `POST /api/settings`.

### `backupService.js`
Creates timestamped backup directories with `MANIFEST.json` containing SHA-256 hashes for all three save variants. Restore requires the exact confirmation phrase `RESTORE <id>` and creates a safety backup before replacing the live primary.

### `compatibilityService.js`
Pre-write gate that checks:
- All three save variant files exist.
- `sqlite3mc_shell_x64.exe` is available.
- Required tables (`BinaryData`, `Characters`, `CharacterSkills`, `Currencies`, `Names`, `PlayerUpgrades`, `ScopedCounterValues`) exist.
- Required rows exist (21 total from a fixed formula).

### `weaponBuildService.js`
Deterministic best-in-slot (BIS) weapon build selector. Uses canonical weapon/part data from `data/weapon-builds.canonical.json` and a scoring formula that weights accuracy, stability, damage, rate of fire, magazine size, and optic FOV suitability by weapon category (precision vs close-quarters). Handles part dependencies and suppression preferences. Exposes:
- `listBuilds(key)` — enriches builds with inventory ownership and XP gating.
- `addMissing(key, weaponId)` — adds all missing BIS parts for a weapon.
- `addBuildPart(key, weaponId, partId)` — adds a single BIS part.
- `addMissingForOwnedWeapons(key)` — adds missing BIS parts for every owned weapon.

### `presetService.js`
Parses saved weapon and rig presets from the `PlayerCustomRigs` GVAS blob. Correlates with local `.exr` preview files found in the game's Saved directory. Exposes attachment overrides, container/frame changes, active preset detection, and BIS comparison.

## Frontend Architecture & UI Deep Dive

### SPA Structure
The frontend is a **hand-rolled vanilla JS SPA** with no framework, no bundler, and no build step. The entry point is `public/app.mjs`, which imports feature modules from `public/modules/`. CSS is split across `public/styles.css` and `public/css/*.css`. Pages are `<div class="page">` sections toggled via `hidden` and CSS classes.

### Navigation & Routing
- **Top safety bar**: Five indicators (Game status, Compatibility, Writes, Session backup, Active save) polled every 10 seconds via `/api/status`.
- **Primary nav**: Grouped buttons (Overview, Progression, Innards, Inventory, System) with mobile-responsive hamburger menu.
- **Page routing**: `showPage(pageName)` hides all `.page` elements, shows the target, updates nav active state, focuses the heading for accessibility, and triggers page-specific loaders.

### State Management
- **Module-scoped variables**: Each page's data is held in a top-level variable (e.g., `_inventory`, `_weaponXp`, `_rigData`, `presetData`, `weaponBuildData`).
- **Session storage**: Persists filter selections and dropdown choices (preset type, weapon build category/ID, rig filters).
- **No centralized store**: Pages re-fetch from the API after mutations. The `api()` helper wraps `fetch` with CSRF token injection, mutation locking (`mutationRequestActive`), and aria-busy management.

### Page-by-Page Functionality

#### Overview (`page-dashboard`)
Aggregated dashboard loading four endpoints in parallel:
- `/api/dashboard` → character, loadout, quests, inventory summary, currencies.
- `/api/vendors` → faction trust cards.
- **Resources card**: Water, Credits, and three utility drones (Fast Travel, Construction, Recovery). Each has a quantity input and Set/Add buttons. Currencies use `PUT /api/currencies/:rowName`; drones use `POST /api/inventory/update` or `POST /api/inventory/add`.
- **Faction Trust card**: Visual progress bars for each faction's `FactionScore`.
- **Active Character & Loadout**: Shows selected character's HP (base + prestige), prestige level, XP bar, walk/sprint speeds, and equipped weapons with attachment counts and rig nickname.
- **Tracked Quests**: Summary badges (Complete, Ready, In Progress, Not Started). Active quests listed with state, progress, and "Mark Ready to Turn In" button for in-progress quests.
- **Inventory Summary**: Item type count, total units, and navigation shortcuts.

#### Characters (`page-characters`)
- Loads `/api/characters` and `/api/dashboard` in parallel.
- Renders a card grid with character metadata (icon, name, role, blurb, health, walk/sprint, skills).
- Each card shows prestige level, XP with progress bar, and controls: Set Prestige (level only), Apply Prestige (level + skill reset), Set XP, Open Skill Editor.
- Active character is highlighted with an amber border and badge.

#### Character Detail / Skill Editor (`page-character`)
- Loads `/api/characters` and `/api/characters/:id/details`.
- Shows prestige level, total health, speed bonus, XP with cap.
- **Skill tracks**: Flat skill list grouped into tracks (e.g., "Sprinting Expert", "PST Expert"). Each track renders ordered nodes (tiers v1–v5 or numeric tiers). Gates (`AllowUse`) render as "Use" nodes. Nodes are clickable with ordering enforcement (higher tiers locked until previous tier is enabled).
- **Prestige Bonuses**: Separate track showing all `PlayerSkill.Prestige.*` skills.
- Apply Skills button batch-saves all toggled states.

#### Hub Upgrades (`page-hub-upgrades`)
- Loads `/api/hub-upgrades` and `/api/inventory` in parallel.
- Renders upgrades grouped by category (Terminals, Welfare, Special) and subgroup (Crafting Stations, Water Tank, Defense Turrets, etc.).
- Each card shows: icon, name, water cost, description, prerequisite with met/unmet state, credit cost, build time, required materials with on-hand counts and missing amounts.
- **Material actions**: "Add verified missing materials" button per card if components have writable item IDs.
- **Bulk actions**: "Unlock All Known" and "Clear All".
- Unlock/Lock/Permanent buttons per card. Prerequisites gate the Unlock button's disabled state.

#### Weapon Builds (`page-weapon-builds`)
- Loads `/api/weapon-builds`.
- Top section: "Owned weapon loadout kit" button adds missing BIS parts for every supported weapon currently in inventory.
- Toolbar: search, category filter, weapon selector dropdown.
- Detail view: selected weapon's base stats, balanced score, suppression status, owned/missing part count.
- Part cards show slot, name, stat contribution, dependencies, required XP, ownership status, and Add button for missing parts.
- Source disclosure explains that saved presets only store changed overrides.

#### Presets (`page-presets`)
- Loads `/api/presets`.
- Read-only view of saved weapon and rig presets from `PlayerCustomRigs` + `PlayerLoadout`.
- Search, type filter (weapons, rigs, all).
- Weapon preset cards: active badge, EXR preview badge, attachment overrides, BIS match/missing counts.
- Rig preset cards: container and frame overrides, EXR preview badge.

#### Weapon XP (`page-weapon-xp`)
- Loads `/api/weapon-xp` and `/api/weapon-xp/reference` in parallel.
- Category filter dropdown populated from weapon metadata.
- Weapon cards grouped by category: current XP, reference XP target, progress bar, delta to target, "At or above reference" badge.
- Actions: Set XP (manual input), Set to reference value, "Set visible to their reference XP" (batch).
- Batch endpoint (`POST /api/weapon-xp/batch`) updates up to 250 weapons atomically.

#### Inventory (`page-inventory`)
- Loads `/api/inventory` and `catalog.json` in parallel.
- Search by name, category, sub-type, technical ID, or source map.
- Filters: category, sub-type (dynamic per category), source (Base Weapons, Damaged Weapons, Items), quantity state (any, owned, empty, ≥10, ≥100), "Needs review" (items with `validLayout: false`).
- Results grouped by category with collapsible sections. Expand/collapse all.
- Each item row: icon, friendly wiki name, technical ID, category pills, source map, current quantity, new quantity input, Set button, quick-set 0/Max buttons.
- Inline operation status with verification receipt.

#### Add Items (`page-add-items`)
- Loads `/api/inventory/catalog` and `/api/inventory` in parallel.
- Catalog of known items from the 100% reference save, enriched with current holdings.
- Search, category, sub-type, source, and ownership state filters.
- Each item card: icon, name, technical ID, category pills, ownership count, Add button with quantity input.
- Already-owned items show "Have N · edit on Inventory page".
- Add endpoint returns `added: false` if item already exists; UI falls back to quantity update.

#### Rigs (`page-rigs`)
- Loads `/api/rigs`.
- Summary metrics: owned/total rigs, missing count, unique HQ module types.
- Search, ownership filter (all, missing, owned), weight class filter.
- Rig cards: name, weight class, ownership badge, base/HQ capacity, weight, slot breakdown (large, medium, small, open, weapon bins), compatible characters, HQ container set details.
- Actions: Add rig (ownership), Add HQ set (increments all high-quality containers by 1).
- Filter state persisted in session storage.

#### Vendors (`page-vendors`)
- Loads `/api/vendors`.
- **Vendor roster**: wiki-canonical list of vendors (Heisenburg, Slade, Bunco, Bundleton, Auto-Vendor, Luca, Kane, Vladelets) with faction, availability type (default, water, flag, auto), and status.
- **Faction Trust**: Per-faction score input with tier presets (Untrusted: -1000, Neutral: 50000, Trusted: 239000). Visual trust track with draggable indicator.
- **Trader Unlock**: Toggle buttons for `Trader.Kane.Unlocked` and `Trader.Luca.Unlocked`.

#### Repair Bench (`page-repair`)
- Loads `/api/repair`.
- **Active Repair Job**: Shows repair timer status (idle, in progress, ready to collect), completion time, and live countdown (updates every second).
- **Collect/Complete button**: Advances `NextOccurrence` to now so the bench is free.
- **Workbench status**: Whether the Repair Bench upgrade is built.
- **Faction IFF Chips**: On-hand counts of all 9 IFF chips (3 factions × 3 levels) with "used by N weapon(s)" annotations.
- **Repairable Weapons**: 40 recipe cards sorted by readiness. Each card shows destroyed weapon requirement, IFF chip requirement, and readiness status. Bench-busy state blocks all cards.

#### Workshop (`page-workshop`) & Munitions (`page-munitions`)
- Shared recipe planner architecture (`recipe-planner.js`).
- Loads `/api/inventory` to build local inventory map.
- Product search, product selector, quantity input.
- Component preview: lists each requirement with needed/have/missing/unsupported status.
- Actions: "Add Missing Components" (adds only shortfalls) and "Add ALL Components" (adds full requirement regardless of ownership).
- Uses `POST /api/inventory/add` with fallback to `POST /api/inventory/update` if item already exists.
- Workshop covers 37 products; Munitions covers 23 products.

#### Backups (`page-backups`)
- Loads `/api/backups` and `/api/status`.
- Create backup with label (1–48 chars, alphanumeric + spaces/underscores/hyphens).
- Backup list shows name, creation time, app version, manifest validity, active session backup indicator.
- Restore requires typing exact confirmation phrase `RESTORE <id>`. Creates safety backup first, validates staged primary, then installs.
- Delete requires typing `DELETE <id>`.
- Receipt display shows backup ID, safety backup ID, restored files, and installed SHA-256.

#### Diagnostics (`page-diagnostics`)
- Loads `/api/diagnostics`.
- Read-only checks rendered as diagnostic cards:
  - Three save variants present
  - SQLite3MC available
  - uesave available
  - Key and schema compatible
  - Inventory byte-identical round-trip
  - Game process closed
  - Write readiness
  - Session backup status
  - Steam Cloud warning
- Detailed section shows checked timestamp, active save directory, schema fingerprint, inventory maps, and blocking reasons.

#### Settings (`page-settings`)
- Loads `/api/settings`.
- Save directory input with native directory picker (`webkitdirectory`) and "Use default" clear button.
- DB key display only (loaded from local resource, cannot be overridden).
- Save Settings persists `saveDir` to `config/settings.json` (mode `0o600`).

### Centralized Event Handling
All click actions are dispatched through a single `document.addEventListener('click', ...)` handler that reads `data-action` attributes. Supported actions include:
- `set-resource`, `add-resource` — dashboard currencies/drones
- `set-level`, `apply-prestige`, `set-character-xp`, `show-character` — characters
- `set-detail-level`, `detail-prestige`, `set-detail-xp`, `toggle-skill`, `apply-skills` — character detail
- `bulk-hub`, `toggle-section`, `toggle-upgrade`, `add-upgrade-materials` — hub upgrades
- `weapon-build-add-part`, `weapon-build-add`, `set-weapon-xp` — weapon builds
- `update-item`, `set-quantity`, `add-item` — inventory
- `add-rig`, `add-rig-kit` — rigs
- `set-faction`, `toggle-trader` — vendors
- `collect-repair` — repair bench
- `quest-ready` — quests
- `show-page` — navigation

## Error Handling & Logging

- **No global error handler middleware**: Each route uses its own `try/catch`, returning `{ error, operationId, backupId, rollbackStatus }` for 500s.
- **Key redaction**: `sanitizeOutput()` in `validation.js` replaces the DB key in all shell stdout/stderr with `***REDACTED***` before it reaches logs or error messages.
- **Structured error objects**: Service errors are plain `Error` instances augmented with `.status` (e.g., `Object.assign(new Error('...'), { status: 422 })`). Routes use `err.status || 500`.
- **Verification-first**: Every mutation verifies affected rows and target values before declaring success. Verification failures throw with status 422.
- **No secrets in responses**: The API never returns the DB key. Settings responses include only `keySource: 'bundled-resource'`.
- **Frontend error presentation**: `showNotice()` renders a dialog; `showToast()` renders a transient banner. Inline operation regions show pending/success/error states with verification receipts.

## Adding New Features (Cookbook)

### 1. Adding a New Read Route
```js
// routes/api.js
router.get('/my-feature', async (req, res) => {
  try {
    const data = await myService.readSomething(resolveKey(req));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null });
  }
});
```

### 2. Adding a New Write Route
```js
// routes/api.js
router.post('/my-feature', async (req, res) => {
  try {
    const result = await runMutation(req, 'my-feature-label', () =>
      myService.writeSomething(resolveKey(req), req.body.param)
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null, backupId: err.backupId || null, rollbackStatus: err.rollbackStatus || null });
  }
});
```

### 3. Adding a Service Function
Follow the existing mutation pattern in `saveService.js`:
1. Validate inputs with `toInteger`, `sqlStr`, etc.
2. Capture `beforeIntegrity`, `beforeFk`, `beforeHashes`.
3. Run `BEGIN IMMEDIATE` + SQL + `SELECT changes()` + `COMMIT` via `runShell`.
4. Verify with `requireChangedRows` and a follow-up `SELECT`.
5. Capture `afterIntegrity`, `afterFk`, `afterHashes`.
6. Return the standardized receipt object.

For GVAS/inventory writes, follow `gvasService.js`:
1. Read blob, run `requireByteIdenticalRoundTrip`.
2. Mutate the parsed JSON in-place.
3. Re-serialize with `jsonToBlob`.
4. Write back, then verify installed blob hash, JSON structure, entry counts, and quantities.

### 4. Adding Frontend UI
- Add a `<div class="page" id="page-my-feature">` section in `public/index.html` using the existing card/grid classes.
- Add a render function in the appropriate `public/modules/features/*.mjs` or `public/modules/system.mjs` using `esc()` for all dynamic interpolation.
- Use the existing `FWAPI.*` helpers (adds CSRF token for mutations, manages `mutationRequestActive`).
- Bind events via the centralized `document.addEventListener('click', ...)` dispatcher or `bind()` helper in `runtime.mjs`.
- Add a `data-page="my-feature"` nav button in the appropriate nav group.

### 5. Adding Data Files
- Canonical item data lives in `data/items.canonical.json` and `public/catalog.json`.
- Recipe data lives in `data/recipes.canonical.json` and `public/recipe-data.js`.
- Weapon build data lives in `data/weapon-builds.canonical.json`.
- Rig data lives in `data/rigs.json`.
- Generation scripts in `scripts/` fetch wiki snapshots and produce the canonical files.

## Technical Debt & Architectural Observations

### Security
- **No authentication**: The app relies entirely on loopback binding and CSRF tokens. If exposed beyond `127.0.0.1`, there is no user authentication layer. This is acceptable for the stated threat model but should be documented as a constraint.
- **Shell injection defense**: SQL is built via string interpolation, but all user values pass through `sqlStr()` (escapes `'`, rejects NUL/newline) or `toInteger()`/`toNumber()`. The pattern is consistent but fragile—any new SQL construction that bypasses these helpers would be a vulnerability.
- **Key file permissions**: `fwinter-db-key.txt` is read from the project root. `config/settings.json` is written with mode `0o600`, but the key file itself has no enforced permissions.
- **CSRF token is static per process**: The token is generated once at boot (`crypto.randomBytes(32)`) and never rotated. For the loopback-only threat model this is acceptable, but a long-running process would benefit from rotation.

### Code Quality
- **Circular dependency**: `gvasService.js` and `saveService.js` require each other. This is managed with lazy `require()` inside functions, but it is a maintenance hazard.
- **Inline SQL**: All database access is raw SQL via the SQLite3MC shell. There is no query builder or ORM, which keeps the surface small but increases the risk of injection if validators are bypassed.
- **Hardcoded paths**: Several paths are hardcoded to Windows-style locations (e.g., `C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe`). The app derives defaults from `LOCALAPPDATA`, but Linux/macOS would require manual overrides.
- **No input length limits on strings**: `sqlStr()` rejects NUL and newlines but does not enforce a maximum length. Extremely long strings could cause shell buffer issues.
- **Missing `.env` support**: Environment variables are read directly from `process.env`. There is no `.env` loading library (e.g., `dotenv`).
- **Legacy monolithic frontend file**: `public/app.js` is ~3016 lines and is no longer loaded by `index.html`. The active frontend is now modular under `public/modules/` with `app.mjs` as the entry point. Keep `app.js` only as a reference or remove it once all functionality has been ported.

### Testing
- **Good coverage of pure logic**: `backupService`, `configService`, `mutationService`, `weaponBuildService`, and `presetService` have unit tests using `node:test` and `node:assert/strict`.
- **Gaps**: `saveService` and `gvasService` tests exist (`saveService.validation.test.js`, `gvasService.validation.test.js`) but rely on a real or mocked encrypted database. The actual database-mocking strategy is not visible in the test directory contents reviewed.
- **No integration/E2E tests**: There are no tests that spin up the Express server and hit HTTP endpoints.
- **Frontend has no automated tests**: UI logic (`app.js`) is untested. The `test/ui-utils.test.js` file covers only utility functions, not rendering or event handling.

### Performance
- **Shell spawning per query**: `runShell` spawns a new `sqlite3mc_shell_x64.exe` process for every batch of SQL. For high-frequency reads, this is acceptable, but batch operations (e.g., `batchSetWeaponXp`) pack many commands into a single shell session to amortize the cost.
- **Temp directory cleanup**: `gvasService` creates temp dirs under `os.tmpdir()` for every `to-json`/`from-json` round-trip. Cleanup is in `finally` blocks, but failures during cleanup are silently swallowed (`catch {}`), which could leak temp files.
- **No caching**: The compatibility check, schema lookup, and reference save reads are not cached. This is intentional for correctness but adds latency.
- **Full inventory re-fetch after mutation**: The UI re-fetches the entire inventory list after every add/update. For saves with 360+ entries, this is acceptable but could be optimized with optimistic updates.

### Known Experimental Features
- `setQuestReady` — the game may re-validate quest counters on load and revert the status. Verify in-game before relying on it.