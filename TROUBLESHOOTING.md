# Troubleshooting Guide

This guide covers the common problems you may hit while running the Forever
Winter Save Editor webapp. The app listens on `http://127.0.0.1:3000` and edits
the **live** save, so the game must be closed during any write.

## Quick checks first

1. **Is the game closed?** The app refuses all writes while `ForeverWinter*`
   processes are running (returns HTTP 409). Close the game completely, including
   any lingering launcher/anti-cheat processes, then retry.
2. **Is the app running?** Open `http://127.0.0.1:3000` in your browser. If the
   page won't load, the server isn't up — see [The app won't start](#the-app-wont-start).
3. **Check Diagnostics.** The in-app `#diagnostics` page reports save/tool/schema
   readiness and the inventory byte-round-trip result *before* you make changes.

## The app won't start

### `npm start` fails / server exits immediately
- Confirm you are in the `webapp/` directory and dependencies are installed:
  ```powershell
  cd "C:\Users\Admin\Documents\Forever Winter\webapp"
  npm install
  npm start
  ```
- Node.js must be installed. Run `node --version`; if missing, install a current
  LTS from <https://nodejs.org>.
- If the error mentions a port already in use, make sure no other copy of the
  app (or another process) is bound to `3000`. Stop the old one:
  `webapp\stop.bat`, then try `npm start` again.

### Browser shows "This site can't be reached"
- The app binds to **loopback only** (`127.0.0.1`). Access it from the same
  machine via `http://127.0.0.1:3000` — not a LAN IP or `file://` path.
- Cross-origin requests are rejected. Open the page from the app's own URL; do
  not call the API from a different origin or a `localhost` proxy that rewrites
  the Host header (you'll get HTTP 403 "Invalid Host").

## Write rejected: "Another save operation is active" (HTTP 409)

Mutations are serialized. A previous operation may still be finishing, or a
prior run crashed without clearing its lock. Wait a few seconds and retry. If it
persists after a restart of the app, that usually means an earlier process
didn't exit cleanly — stop and restart the server.

## Write rejected: "The Forever Winter is running" (HTTP 409)

The app detects `ForeverWinter*` via `Get-Process`. Close the game and any
related processes. If you're *sure* the game is closed but still get this:
```powershell
Get-Process -Name ForeverWinter* -ErrorAction SilentlyContinue
```
Kill anything listed, then retry. A stuck anti-cheat or crash-handler process can
still trigger this check.

## Missing tool: SQLite3MC shell

Inventory and relational writes shell out to:
```
C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe
```
If you see errors like `Shell spawn error` or `ENOENT`, the binary is missing or
moved. Fix it by:
- Restoring the SQLite3MC Windows build to that path, **or**
- Setting the environment variable to point elsewhere:
  ```powershell
  $env:FW_SQLITE_BIN = "C:\path\to\sqlite3mc_shell_x64.exe"
  ```
  (Note: the variable name expected by the tooling is `FW_SQLITE_BIN`; set it
  before starting the app.)

## Missing tool: uesave

Inventory **writes** are disabled unless `uesave.exe` is available. Reads fall
back to a heuristic parser, but you'll see "uesave.exe is required for inventory
writes" (HTTP 503) if it's absent. Expected location:
```
C:\Users\Admin\Documents\Forever Winter\experiment\uesave-src\target\release\uesave.exe
```
Fix it by:
- Building the Rust crate in `experiment/uesave-src` (requires a Rust toolchain),
  **or**
- Pointing at a prebuilt binary:
  ```powershell
  $env:GVAS_UESAVE_BIN = "C:\path\to\uesave.exe"
  ```

### "uesave byte-round-trip compatibility check failed"
Before any inventory write, the app re-serializes the blob and compares the
SHA-256 to the original. A mismatch means the uesave build is incompatible with
this save's GVAS format. Don't force the write — it risks corrupting inventory.
Rebuild/obtain a matching `uesave.exe`, or treat inventory edits as unsupported
until the round-trip passes.

## Save directory / key problems

### "Save directory not found" or empty data
The default save directory is:
```
%LOCALAPPDATA%\ForeverWinter\Saved\SaveGames
```
Override it in the in-app `#settings` page (a `config/settings.json`, mode
`0o600`, gitignored). If your saves live elsewhere, set the override there.

### "Failed to decrypt" / key errors
The DB key is loaded from a **local resource only**:
```
C:\Users\Admin\Documents\Forever Winter\fwinter-db-key.txt
```
or via `FW_DB_KEY_FILE`. The key is never logged, returned by the API, or written
to settings. If decryption fails:
- Confirm the key file exists and is readable.
- If you relocated it, set `FW_DB_KEY_FILE` to the absolute path before starting.
- Never paste the key into settings — the app rejects `dbKey` on save and
  sanitizes any legacy value.

## Integrity / foreign-key failures

Every write validates the live primary with `PRAGMA integrity_check` and
`pragma_foreign_key_check`. If you get an integrity or FK failure:
- **Do not retry the write.** The mutation pipeline rolls back automatically and
  preserves known-good variants, so your data should be intact.
- Run a **Backup → Restore** from `#backups` if anything looks off, choosing a
  known-good backup.
- A failed validation usually means the underlying save was already in a bad
  state (e.g., edited by another tool, or a partial/corrupt file). Restore from a
  verified backup before continuing.

## Hashes unchanged after a write

The pipeline rejects a staged write whose primary hash is identical to the live
one ("nothing changed"). If an edit appears to do nothing:
- Confirm the value you set differs from the current value.
- Confirm the game was closed (the change may have been blocked earlier).
- Check the operation receipt's `warnings` — some writes (rigs, structured
  inventory, `setQuestReady`) are **experimental** and the game may re-validate
  on load.

## Experimental features caveat

These writes are supported by the tool but not guaranteed to persist in-game:
- Rig ownership / high-quality container sets (`warnings: experimental`).
- Structured `TempInventory` edits (verify parts in-game).
- `setQuestReady` (the game may re-validate quest counters on load).

Always make a backup before experimenting, and confirm results inside the game.

## Resetting / restoring safely

1. Before any risky edit, create a labeled backup: `#backups` → **Create**.
2. If something looks wrong, restore the primary from that backup (explicit
   confirmation required). Restore verifies all three backup variants, makes a
   fresh safety backup, stages/validates the selected primary, and restores only
   the primary.
3. Keep the game **closed** the entire time.

## Still stuck

- Open the in-app `#diagnostics` page and include its readiness output.
- Note the exact error text and the HTTP status (check the browser dev tools
  Network tab).
- For write failures, include the operation receipt's `operationId`,
  `backupId`, and `rollbackStatus`.
- Common root causes are: game still running, missing `sqlite3mc_shell_x64.exe`
  or `uesave.exe`, wrong save directory, or unreadable key file.
