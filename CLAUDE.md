# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Forever Winter Save Editor is a **local, loopback-only Node.js/Express web app** for safely reading and editing encrypted *The Forever Winter* game save files. It provides a browser-based UI for character progression, inventory, currencies, hub upgrades, weapon XP, and vendor reputation management—with staged copy-on-write mutations, automatic backups, and byte-level integrity verification.

**Key constraints:**
- Single runtime dependency: `express` only
- No build step; no bundler; vanilla ES modules (`webapp/public/app.mjs` + `webapp/public/modules/*.mjs`)
- Loopback-only binding (`127.0.0.1:3000`); cannot be exposed to network
- Game must be closed during mutations (enforced at middleware level)

## Development Commands

Commands run from the `webapp/` directory:

```bash
cd webapp
npm start                      # Start server on http://127.0.0.1:3000
npm test                       # Run all unit & e2e tests (node --test)
npm run test:coverage          # Run coverage gate check
npm run lint                   # Lint with eslint
```

### Data Generation & Wiki Sync

```bash
npm run items:generate         # Generate items.canonical.json from wiki
npm run items:fetch-wiki       # Fetch fresh wiki item data
npm run items:extract-reference # Extract reference items from 100% save
npm run items:audit            # Show item audit counts

npm run recipes:generate       # Generate recipes.canonical.json
npm run recipes:fetch-wiki     # Fetch fresh wiki recipe data
npm run recipes:audit          # Show recipe audit counts

npm run weapons:generate       # Generate weapon build data
npm run weapons:fetch-wiki     # Fetch fresh wiki weapon data
npm run weapons:audit          # Show weapon build audit counts
```

## Architecture Overview

### Request Lifecycle & Layering

The application follows a **three-layer service architecture**:

```
Express Middleware (webapp/server.js)
  ↓ (host validation, security headers, CSRF, mutation gating, game-closed check)
Routes (webapp/routes/api.js, webapp/routes/pages.js)
  ↓ (input validation, wraps mutations with runMutation orchestrator)
Services (webapp/services/*.js)
  ↓ (SQL construction, GVAS blob handling, verification)
Utilities (webapp/utils/*.js)
  ↓ (shell spawning, key loading, process detection)
SQLite3MC Shell + uesave Rust CLI
```

### Read vs. Write Paths

**Read Requests** (`GET /api/*`):
1. Route handler calls service layer
2. Service builds SQL, spawns `sqlite3mc_shell_x64.exe` via `webapp/utils/validation.js::runShell()`
3. Pipes `PRAGMA key`, `PRAGMA cipher_compatibility = 3`, SQL, `.quit`
4. Key is redacted from all output before returning to caller

**Write Requests** (`PUT/POST /api/*`):
1. Middleware checks: CSRF token valid, game not running, no concurrent mutation active
2. Route wraps service call in `runMutation(req, label, callback)`
3. **Mutation orchestrator** (`webapp/services/mutationService.js`):
   - Creates session backup (pre-mutation snapshot)
   - Copies all three save variants to temp directory
   - Takes pre-install hash of live save
   - Runs action callback against temp directory (via `configService.withSaveDir`)
   - Validates staged database (integrity + foreign keys)
   - Re-checks live save hasn't changed
   - **Atomically copies** staged primary over live primary
   - Re-validates installed save
   - **Auto-rollback** on failure: restores pre-install snapshot
4. Returns unified receipt with `operationId`, `backupId`, hashes, integrity checks, rollback status

### Frontend Architecture

The frontend is a **hand-rolled vanilla JS SPA** with no framework, no bundler, no build step:

```
webapp/public/
  index.html          ~370 lines; markup + inline CSS
  app.mjs             Entry point; imports feature modules
  modules/
    core.mjs          Shared utils, icons, escaping
    runtime.mjs       App bootstrap, page routing, state
    api-client.mjs    Typed fetch wrappers + CSRF injection
    ui-utils.mjs      Filtering, ranking, debounce, receipts
    features/
      dashboard.mjs   Overview (character, loadout, quests, inventory, currencies)
      characters.mjs  Character list + skill editor
      weapons.mjs     Weapon builds, presets, weapon XP
      inventory.mjs   Manage inventory + add items + rigs
      vendors-repair.mjs Vendors, faction trust, repair bench
      settings-planners.mjs Settings, workshop, munitions recipes
      hub.mjs         Hub upgrades
    system.mjs        Backups + diagnostics
    recipe-planner.mjs Workshop/munitions planning
    recipe-data.mjs   Recipe definitions
  styles.css, css/*.css  Base + page-specific styles
  catalog.json        100%-save item catalog (read-only data)
```

**State Management**: Module-scoped variables (e.g., `_inventory`, `_weaponXp`, `presetData`) + session storage for filter state. Pages re-fetch API after mutations; no centralized store.

**Routing**: Single `showPage(pageName)` dispatcher. All click events routed through centralized `document.addEventListener('click', ...)` dispatcher reading `data-action` attributes.

### Core Services

| Service | Purpose | Key Functions |
|---------|---------|----------------|
| `saveService.js` | Relational table reads/writes (SQLite) | `listCharacters`, `setPrestige`, `setCharacterXp`, `setCharacterSkills`, `listHubUpgrades`, `setHubUpgrades`, `listWeaponXp`, `setWeaponXp`, `batchSetWeaponXp`, `listFactionScores`, `setFactionScore`, `getCurrencies`, `setCurrency`, `getRepairStatus`, `collectRepair` |
| `gvasService.js` | GVAS blob engine (TempInventory, PlayerCustomRigs) | `readTempInventoryBlob`, `writeTempInventoryBlob`, `blobToJson`, `jsonToBlob`, `listInventoryItems`, `updateInventoryItem`, `addInventoryItem`, `listRigs`, `addRigOwnership`, `addHighQualityContainerSet` |
| `mutationService.js` | Staged mutation orchestrator with automatic rollback | `mutate()` — entry point for all database writes |
| `weaponBuildService.js` | Best-in-slot weapon build selection + scoring | `listBuilds`, `addMissing`, `addBuildPart`, `addMissingForOwnedWeapons` |
| `backupService.js` | Backup creation / restore / delete with manifest | `createBackup`, `restoreBackup`, `deleteBackup`, `listBackups` |
| `configService.js` | Save directory override + AsyncLocalStorage context | `getSaveDir()`, `withSaveDir()`, `load()`, `save()` |
| `compatibilityService.js` | Pre-write compatibility gates | `isCompatible()` checks tool availability, schema, required rows |
| `presetService.js` | Saved weapon/rig preset parsing | `listPresets()`, preset correlation with `.exr` files |

**Circular Dependency Note**: `gvasService.js` ↔ `saveService.js` use lazy `require()` inside functions to avoid empty exports at load time.

### Key Design Decisions

1. **Staged mutations with automatic rollback**: Mutations run in a temp directory first, validated, then atomically installed. If post-install validation fails, the pre-install snapshot is restored automatically. No partial writes can corrupt the save.

2. **Game-closed enforcement**: Both middleware and mutation orchestrator check that *The Forever Winter* process is not running before write operations begin. Write gatekeeping is multi-layered.

3. **Byte-identical round-trip verification**: All GVAS/inventory writes include a mandatory round-trip check: `uesave to-json -> in-memory edit -> uesave from-json` must reproduce the original binary blob exactly. If not, inventory writes are disabled.

4. **Key file never persisted in settings**: Database keys are loaded only from `fwinter-db-key.txt` (bundled resource). The API explicitly rejects `dbKey` in `POST /api/settings` for security.

5. **Security by binding**: Server listens only on `127.0.0.1:3000`. No user authentication layer (acceptable for loopback-only threat model, but network exposure would require auth).

## External Dependencies

### Required Tools (Environment Configuration)

| Tool | Default Path | Env Override | Purpose |
|------|--------------|--------------|---------|
| **SQLite3MC** | `C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe` | `FW_SQLITE_BIN` | Encrypted SQLite shell (cipher_compatibility = 3) |
| **uesave** | `experiment/uesave-src/target/release/uesave.exe` | `GVAS_UESAVE_BIN` | Rust CLI for GVAS blob serialization/deserialization |
| **DB Key File** | `fwinter-db-key.txt` (in repo root) | `FW_DB_KEY_FILE` | 32-character plaintext database encryption key |

### Backup Root

- **Default**: `%LOCALAPPDATA%\ForeverWinter\Saved\SaveBackups`
- **Override**: `FW_BACKUP_ROOT`

## Adding Features

### Adding a Read Route

```javascript
// webapp/routes/api.js
router.get('/my-feature', async (req, res) => {
  try {
    const data = await myService.readData(resolveKey(req));
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, operationId: err.operationId || null });
  }
});
```

### Adding a Write Route

```javascript
// webapp/routes/api.js
router.post('/my-feature', async (req, res) => {
  try {
    const result = await runMutation(req, 'my-feature-label', () =>
      myService.writeData(resolveKey(req), req.body.value)
    );
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ 
      error: err.message, 
      operationId: err.operationId || null, 
      backupId: err.backupId || null, 
      rollbackStatus: err.rollbackStatus || null 
    });
  }
});
```

### Service Function Pattern

1. Validate inputs with `toInteger()`, `sqlStr()`, etc.
2. Capture `beforeIntegrity`, `beforeFk`, `beforeHashes`
3. Run `BEGIN IMMEDIATE` + SQL + `SELECT changes()` + `COMMIT` via `runShell()`
4. Verify with `requireChangedRows()` and follow-up `SELECT`
5. Capture `afterIntegrity`, `afterFk`, `afterHashes`
6. Return standardized receipt: `{ operationId, backupId, beforeHashes, afterHashes, beforeIntegrity, afterIntegrity, beforeFk, afterFk, targetVerification, rollbackStatus }`

### GVAS/Inventory Write Pattern

1. Read blob via `gvasService.readTempInventoryBlob()`
2. Call `requireByteIdenticalRoundTrip()` to validate round-trip capability
3. Mutate parsed JSON in-place
4. Re-serialize with `jsonToBlob()`
5. Write back via `UPDATE BinaryData SET Value = X'<hex>'`
6. Verify: installed blob hash, JSON re-parse, entry counts, quantities

### Frontend UI

1. Add `<div class="page" id="page-my-feature">` section in `webapp/public/index.html`
2. Add render function in appropriate `webapp/public/modules/features/*.mjs` using `esc()` for all dynamic interpolation
3. Use `FWAPI.*` helpers (adds CSRF token, manages `mutationRequestActive`)
4. Bind events via centralized dispatcher or `bind()` helper in `runtime.mjs`
5. Add `data-page="my-feature"` nav button in appropriate group

## Key Files for Navigation

- **Entry point**: `webapp/server.js` (middleware, bootstrapping, key loading)
- **API routes**: `webapp/routes/api.js` (all `/api/*` endpoints)
- **Frontend entry**: `webapp/public/app.mjs` (imports modules, sets up app)
- **Mutation orchestrator**: `webapp/services/mutationService.js` (read this first to understand write safety)
- **Main service**: `webapp/services/saveService.js` (relational table reads/writes)
- **GVAS service**: `webapp/services/gvasService.js` (inventory blob handling)
- **Developer reference**: `DEVELOPER_GUIDE.md` (deep architectural docs)

## Notable Implementation Details

- **SQL is raw**: No query builder or ORM. All SQL is string-interpolated with validators (`sqlStr()`, `toInteger()`, `toNumber()`). Maintainability hazard if validators are bypassed.
- **Hardcoded Windows paths**: Some defaults assume Windows (e.g., `C:\tmp\fw-tools\...`). Linux/macOS users must override via env vars.
- **Legacy monolithic frontend**: `webapp/public/app.js` (~3016 lines) is retained as reference but is no longer loaded. Active frontend is modular under `webapp/public/modules/` with `app.mjs` entry.
- **Temp cleanup**: `gvasService` creates temp dirs under `os.tmpdir()` for `to-json`/`from-json` round-trips. Failures during cleanup are silently swallowed; investigate if temp files accumulate.
- **Static CSRF token**: Token is generated once at boot and never rotated. Acceptable for loopback-only model; long-running processes would benefit from rotation.
- **No `.env` support**: Environment variables are read directly from `process.env`. No `.env` loading library.
