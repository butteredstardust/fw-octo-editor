# Installation Guide — FW OCTO Editor

This guide walks a new developer from a fresh source download to a fully running local instance of the FW OCTO Editor webapp.

## What this app is

FW OCTO Editor is a local, loopback-only Node.js/Express app that reads and edits the game's encrypted SQLite3MC save files. It uses a Rust-based GVAS parser (`trumank/uesave`) for structured inventory edits and provides a vanilla JS browser UI for managing characters, inventory, hub upgrades, weapon XP, vendors, and backups.

---

## Prerequisites

| Tool | Minimum version | Purpose | Install / verify |
|------|-----------------|---------|-----------------|
| **Node.js** | v18+ (LTS recommended) | Runtime for the webapp and build scripts | `node --version` |
| **npm** | v8+ (bundled with Node) | Dependency install and script runner | `npm --version` |
| **Git** | any | Clone the repository | `git --version` |
| **Rust** | 1.94+ (stable) | Build the `uesave` GVAS CLI | `rustc --version` |
| **Cargo** | bundled with Rust | Rust package manager / build tool | `cargo --version` |
| **SQLite3MC shell** | `sqlite3mc_shell_x64.exe` | Encrypted SQLite3 database access | See below |
| **The Forever Winter** | installed on Windows | Provides the live save files and DB key | — |

> **Platform note:** This project is Windows-native. Paths, the SQLite3MC binary, and the game save locations all assume Windows. Linux/macOS may work with path overrides but are untested.

---

## Step 1: Clone the repository

```bash
git clone <repository-url>
cd Forever-Winter
```

The repository root should contain:
```
AGENTS.md
README.md
reference/
releases/
tools/
webapp/
```

Retired content (deprecated legacy scripts, old manual backups, one-off investigation
scripts) lives under `archive/` — not part of the working app, kept only for reference.

---

## Step 2: Obtain the SQLite3MC shell

The app shells out to `sqlite3mc_shell_x64.exe` for all database operations. This is **not** an npm package — it is a standalone native binary.

**Option A — Use the bundled path (if present)**
Check if the file already exists at:
```
C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe
```
If it exists, no further action is needed.

**Option B — Build or download SQLite3MC**
If the binary is missing:
1. Obtain the SQLite3MC (SQLite3 with SEE/Cipher compatibility) build for Windows x64.
2. Place it at a known location, for example:
   ```
   C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe
   ```
3. Note the path — you will set `FW_SQLITE_BIN` if you use a non-default location.

---

## Step 3: Build the `uesave` GVAS CLI

The app requires `uesave.exe` (trumank/uesave, pinned v0.7.1) for structured inventory reads and writes.

```bash
cd tools
git clone https://github.com/trumank/uesave.git uesave-src
cd uesave-src
cargo build --release -p uesave_cli
```

After a successful build, the binary should be at:
```
tools/uesave-src/target/release/uesave.exe
```

Verify it:
```bash
tools/uesave-src/target/release\uesave.exe --help
```

If you place the binary elsewhere, set the environment variable:
```powershell
$env:GVAS_UESAVE_BIN = "C:\path\to\uesave.exe"
```

---

## Step 4: Get the database key

The save file is an encrypted SQLite3MC database. Released builds ship an **encrypted** key resource (`webapp/resources/dbkey.resource.json`, AES-256-GCM) rather than a plaintext key file, so there is nothing to configure for a normal install — the app decrypts it automatically at boot.

**If your save needs a different key** (e.g. a different game build/region), you don't need to touch any files: open the app, go to **Settings → Database Key**, and paste in your 32-character key. It's verified against your live save before being accepted, and is stored encrypted at rest (never as plain text) — see `webapp/utils/keyProtect.js`.

**For local development** (building the encrypted resource yourself from a raw key):
- Place the plaintext key in `C:\Users\Admin\Documents\Forever Winter\fwinter-db-key.txt` (or wherever `FW_DB_KEY_FILE` points), wrapped in single quotes, e.g.: `'abcdef1234567890abcdef1234567890'`
- Run `npm run key:build-resource` (from `webapp/`) to produce the encrypted resource. If the resource file is missing, `npm start` will build it automatically from the plaintext source the first time.

```powershell
$env:FW_DB_KEY_FILE = "C:\path\to\your\key-file.txt"
```

> **Security note:** Never commit the plaintext key file to version control. It is already gitignored at the project level, and never gets copied into a release build (`releases/build.ps1` builds and bundles only the encrypted resource).

---

## Step 5: Install Node.js dependencies

```bash
cd webapp
npm install
```

This installs the single runtime dependency:
- `express` ^4.18.2

Dev dependencies are not used; the project relies on Node's built-in test runner.

---

## Step 6: Prepare the 100% reference save (optional but recommended)

Some features (prestige grants, reference weapon XP, item catalog) depend on a 100% complete reference save.

1. Obtain a 100% complete save file from your game.
2. Compute its SHA-256 hash.
3. Copy it to:
   ```
   reference/YOUR_HASHCODE_HERE.dat
   ```
   Replace `YOUR_HASHCODE_HERE` with the actual hash (lowercase, no extension).

Example (PowerShell):
```powershell
$hash = (Get-FileHash -Path "C:\Path\To\Save.dat" -Algorithm SHA256).Hash.ToLower()
Copy-Item "C:\Path\To\Save.dat" "reference\$hash.dat"
```

Without this file, prestige and reference XP features will return errors or fallback values.

---

## Step 7: Configure the save directory (optional)

The app defaults to the standard Windows save location:
```
%LOCALAPPDATA%\ForeverWinter\Saved\SaveGames
```

If your saves live elsewhere, you can either:
1. Set the environment variable before starting the app:
   ```powershell
   $env:FW_SAVE_DIR = "D:\MySaves\ForeverWinter"
   ```
   *(Note: the codebase uses `configService` overrides via the Settings UI rather than a direct env var for save dir; the env vars listed below are the ones actually read by the code.)*

2. Or start the app and set it via the **Settings** page in the UI. The override is persisted to `webapp/config/settings.json`.

---

## Step 8: Environment variables reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FW_SQLITE_BIN` | No | `C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe` | Path to the SQLite3MC shell |
| `GVAS_UESAVE_BIN` | No | `..\tools\uesave-src\target\release\uesave.exe` (relative to `webapp/`) | Path to `uesave.exe` |
| `FW_DB_KEY_RESOURCE` | No | `webapp/resources/dbkey.resource.json` | Path to the encrypted DB key resource |
| `FW_DB_KEY_FILE` | No | `..\fwinter-db-key.txt` (relative to `webapp/`) | Path to the plaintext DB key source (dev-only; used to build the resource) |
| `FW_BACKUP_ROOT` | No | `%LOCALAPPDATA%\ForeverWinter\Saved\SaveBackups` | Where app backups are stored |
| `LOCALAPPDATA` | Yes (OS) | e.g. `C:\Users\Admin\AppData\Local` | Used to derive default save/backup paths |

Example — setting all overrides in PowerShell before launch:
```powershell
$env:FW_SQLITE_BIN = "C:\tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe"
$env:GVAS_UESAVE_BIN = "C:\dev\FW\tools\uesave-src\target\release\uesave.exe"
$env:FW_DB_KEY_FILE = "C:\dev\FW\fwinter-db-key.txt"
$env:FW_BACKUP_ROOT = "C:\dev\FW\backups"
```

---

## Step 9: Start the application

```bash
cd webapp
npm start
```

Or double-click `start.bat`, which will:
1. Run `npm install` if `node_modules` is missing.
2. Start the server in a minimized window.
3. Poll `http://127.0.0.1:3000` until it responds.
4. Open the default browser to the app.

To stop the server, use `stop.bat` (or `stop.ps1` directly from PowerShell). It finds the Node.js process listening on port 3000, verifies it is a Node process, kills it, and confirms the port is released.

The server binds to **loopback only** (`127.0.0.1:3000`). It must not be exposed to the network.

---

## Step 10: Verify the installation

1. Open `http://127.0.0.1:3000` in your browser.
2. The **Diagnostics** page (`System → Diagnostics`) is the fastest sanity check. Click **Run diagnostics**.
3. You should see passing checks for:
   - Three save variants present
   - SQLite3MC available
   - uesave available
   - Key and schema compatible
   - Inventory byte-identical round-trip
   - Game process closed
   - Write readiness

4. The **Overview** page should load your active character, loadout, quests, and faction trust.

---

## Step 11: Run the test suite

```bash
cd webapp
npm test
```

This invokes Node's built-in test runner (`node --test`) against the `test/` directory. Current coverage includes:
- `backupService.test.js` — backup creation, manifest hashes, restore/delete confirmation
- `compatibilityService.test.js` — schema, table, and row checks
- `configService.test.js` — save-dir override and context isolation
- `gvasService.validation.test.js` — inventory map extraction and validation
- `keyLoader.test.js` — key file parsing and redaction
- `mutationService.test.js` — staged copy-on-write, rollback, concurrency
- `presetService.test.js` — preset parsing and BIS comparison
- `recipeData.test.js` — recipe catalog integrity
- `rigs.test.js` — rig catalog and container logic
- `saveService.validation.test.js` — character, weapon, hub, and currency validation
- `ui-utils.test.js` — frontend utility functions
- `weaponBuildPartAction.test.js` — BIS part add logic
- `weaponBuildService.test.js` — build selection and scoring

---

## Troubleshooting

### `uesave.exe not found`
- Confirm the binary exists at `tools/uesave-src/target/release/uesave.exe`.
- Rebuild with `cargo build --release -p uesave_cli` inside `tools/uesave-src`.
- If you placed it elsewhere, set `$env:GVAS_UESAVE_BIN` to the full path.

### `sqlite3mc_shell_x64.exe not found`
- Confirm the binary exists at `C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe`.
- If you placed it elsewhere, set `$env:FW_SQLITE_BIN` to the full path.

### `Valid database key not found in key resource`
- Ensure `fwinter-db-key.txt` exists at the project root or the path set in `FW_DB_KEY_FILE`.
- The file must contain a single-quoted 32-character string: `'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'`.
- Verify the file is readable by the user running Node.

### `Missing required tables` or `Key or database incompatible`
- The app could not open the save with the provided key, or the save schema is unexpected.
- Ensure The Forever Winter is closed (the save cannot be opened while the game has it locked).
- Verify you are pointing at the correct save directory (check Settings page).
- After a game update, the save schema may have changed — check for an updated reference save.

### `Write readiness: disabled` / `The Forever Winter is running`
- Close the game completely. The app checks for `ForeverWinter*` processes via PowerShell.
- If the game is closed but the app still detects it, restart the app or reboot.

### `Inventory byte-identical round-trip failed`
- The `uesave` binary is present but produced different bytes when re-serializing the save's TempInventory blob.
- This usually means the `uesave` version is incompatible with the current save format.
- Rebuild `uesave` from the pinned `uesave-src` and ensure `GVAS_UESAVE_BIN` points to the new binary.

### `Port 3000 already in use`
- Another instance of the app is already running, or another process is using the port.
- Stop the existing instance: `Stop-Process -Name node` (PowerShell) or `taskkill /F /IM node.exe`.
- Or change the port by editing `server.js` (not exposed via env var).

---

## Project structure reference

```
Forever-Winter/
  AGENTS.md                  Agent briefing and canonical rules
  README.md                  Project overview and API docs
  INSTALL_GUIDE.md           This file
  TODO.md                    0.9 stabilization checklist
  tools/
    uesave-src/              trumank/uesave repo (v0.7.1) — required build tool
  reference/
    README.md                Reference save instructions
    YOUR_HASHCODE_HERE.dat   100% reference save (placeholder name)
  archive/                   Retired backups, deprecated legacy/ scripts, and
                              one-off GVAS investigation scripts. Not part of
                              the working app; kept only as historical reference.
  webapp/
    server.js                Express boot, loopback bind, key load
    start.bat                Windows launcher (install + start + open browser)
    stop.bat / stop.ps1      Stop the running server reliably
    package.json             Dependencies and scripts
    .gitignore               Ignores node_modules/ and config/settings.json
    routes/
      api/                   ALL /api/* endpoints, split by domain
      lib/                   Shared route helpers (resolveKey/runMutation, handle/handleMutation)
      pages.js               SPA fallback
    services/
      saveService.js         Facade over services/save/*.js — relational-table reads/writes
      gvasService.js         Facade over services/gvas/*.js — TempInventory / GVAS blob engine
      binaryParser.js        Legacy heuristic inventory parser (fallback)
      mutationService.js     Staged copy-on-write mutation orchestrator
      backupService.js       Backup creation / restore / delete
      configService.js       Save-directory override + AsyncLocalStorage
      compatibilityService.js Pre-write compatibility checks
      weaponBuildService.js  BIS weapon build selection
      presetService.js       Weapon/rig preset parsing
    utils/
      validation.js          SQLite3MC shell wrapper, integrity/FK checks
      keyLoader.js           Loads the 32-char DB key
      processCheck.js        Is the game running?
    public/
      index.html             Markup + CSS (~370 lines)
      app.mjs                SPA entry point — imports feature modules
      modules/               Vanilla ES modules (no bundler)
        core.mjs             Composition root re-exporting dom.mjs, icons.mjs, feedback.mjs, game-data.mjs
        runtime.mjs          App bootstrap, page routing, state
        api-client.mjs       Typed fetch wrappers
        ui-utils.mjs         Filtering, ranking, debounce, receipts
        features/            Page-specific logic
        system/              Backups + diagnostics
        recipe-planner.mjs   Workshop/munitions planning logic
        recipe-data.mjs      Recipe definitions
      styles.css             Base styles
      css/                   Split stylesheets by feature
      catalog.json           100%-save item catalog
    test/                    test files (node --test)
    config/
      settings.json          User overrides (save dir), created at runtime
```

---

## Next steps

- Read `AGENTS.md` for the canonical save-editing rules and safety workflow.
- Read `README.md` for the full API surface and feature overview.
- Read `DEVELOPER_GUIDE.md` for architecture, request lifecycles, and contribution patterns.
- Run `npm test` to confirm your environment matches the expected test baseline.
