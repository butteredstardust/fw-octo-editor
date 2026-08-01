# FW OCTO Editor — Agent Briefing

Read this before editing the webapp or save files. The **webapp** is the only supported interface. Legacy PowerShell scripts have been retired to `archive/legacy/` — do not build new functionality on them; extend the webapp instead.

## TL;DR

- All save edits go through the **webapp API** (`webapp/`, port 3000). Every write runs `integrity_check` + `foreign_key_check` + SHA-256 before/after hashes.
- The game **must be closed** while the app edits the live save.
- The app edits the **primary** `.dat` only. Two known-good variants are preserved automatically.
- The DB key is loaded from a local encrypted resource (never a plaintext file) and **never logged or exposed**. Users may set their own key via Settings; it's verified against the live save and stored AES-256-GCM-encrypted at rest.
- Inventory writes use the **uesave** engine (GVAS v3 / UE5). Structured edits are verified byte-identically.
- `setQuestReady` is **experimental** — the game may re-validate quest counters on load.

---

## 1. Webapp Architecture

`webapp/` is a Node/Express app with **no build step for the app itself** — the browser loads plain ES modules directly, no bundler in the request path. `express` is the only **runtime** dependency; `chart.js` is a **devDependency** whose ESM build is vendored into `public/vendor/` by `npm run vendor:chart` (committed output, re-run only when bumping the devDependency), so `npm ci --omit=dev` still installs zero extra runtime packages. It listens on `127.0.0.1:3000` (loopback only).

### Frontend
- **Entry:** `public/index.html` loads `public/app.mjs`
- **Modules:** `public/modules/` — vanilla ES modules, no bundler:
  - `core.mjs` — shared utilities, icons, escaping
  - `runtime.mjs` — app bootstrap, page routing, state
  - `api-client.mjs` — typed fetch wrappers
  - `ui-utils.mjs` — filtering, ranking, debounce, receipts
  - `charts.mjs` — Chart.js wrapper (`createChart`/`chartFigure`/`destroyCharts`); the only module that imports `vendor/chart.mjs`. Always call `destroyCharts(container)` right before an innerHTML swap that removes old canvases, and always pair a chart with the paired data table `chartFigure()` renders — never canvas-only. Validate any multi-series (categorical) chart palette with the `dataviz` skill's `scripts/validate_palette.js` (not a repo script) before shipping it; if nothing passes, fall back to `chartFigure`'s `panels` option (small multiples — a lone series needs no legend and no CVD-separation check).
  - `features/dashboard.mjs`, `characters.mjs`, `hub.mjs`, `inventory/`, `vendors-repair.mjs`, `settings-planners.mjs`, `weapons.mjs`
  - `recipe-planner.mjs`, `recipe-data.mjs`
- **Styles:** `public/styles.css` + `public/css/*.css` (foundation, shared-pages, inventory, progression, people-and-vendors, planners, repair, refinements)
- **Data:** `public/catalog.json`, `public/workshop-recipes.js`, `public/munitions-recipes.js`
- **Vendored:** `public/vendor/` — committed ESM build of chart.js from `npm run vendor:chart`; not hand-edited

### Backend
- **Entry:** `server.js` — Express boot, CSRF, mutation gate, loopback bind
- **Routes:** `routes/api/` — all `/api/*` endpoints, split by domain (`settings.js`, `status.js`, `characters.js`, `hub.js`, `weapons.js`, `inventory.js`, `vendors.js`, `quests.js`, `backups.js`), mounted by `routes/api/index.js`; shared helpers in `routes/lib/context.js` (`resolveKey`, `runMutation`) and `routes/lib/handler.js` (`handle`, `handleMutation`)
- **Services:**
  - `saveService.js` — facade over `services/save/*.js`; relational tables (Characters, Currencies, Hub, Quests, Vendors, Weapon XP, Repair, …)
  - `gvasService.js` — facade over `services/gvas/*.js`; TempInventory via uesave + binaryParser fallback
  - `mutationService.js` — centralized staged writes with backup, integrity, rollback
  - `backupService.js` — versioned backups with manifests, restore, delete
  - `configService.js` — save-dir override + key-file resolution
  - `compatibilityService.js` — schema/tool/row readiness checks
  - `weaponBuildService.js` — BIS weapon build recommendations
  - `presetService.js` — saved weapon/rig presets
- **Utils:** `validation.js` (runShell, integrity, FK), `keyLoader.js` (secret), `processCheck.js` (game running?)

### Key technical facts
- Save is an encrypted SQLite3MC database (`cipher_compatibility = 3`).
- Character prestige = `Characters.Level` + exact `CharacterSkills` rows (`PlayerSkill.Prestige.%`).
- Character XP = `ScopedCounterValues` resolved through `Names`. Never reuse numeric IDs across saves.
- **Water** = `Currencies.RowName='WaterBarrels'`; **Credits** = `Currencies.RowName='TestCurrency'`.
- Hub unlocks = `PlayerUpgrades.UpgradeTag` rows (`Permanent=0`). Include full prerequisite chains.
- Inventory = GVAS blob `Name='TempInventory'` inside `BinaryData.Value`. `Items` MapProperty is a JSON array of `{key, value}` pairs. To add an item, `push` onto the array — assigning by key disappears on re-serialization.
- `KnownItems` (separate `BinaryData` blob) = the game's "discovered weapon attachments / rig containers" list, not a general item log (ammo/meds/drones/codex are never in it). `ensureInventoryItems()` (`services/gvas/inventory-write.js`, re-exported from `gvasService.js`) writes it in the same transaction as TempInventory whenever it adds a weapon part (sourceMap `'Items'`), so an added BIS part is also marked discovered; base weapons are intentionally excluded (never observed there in a real save).
- `VaultInventory` (separate `BinaryData` blob) = the home stash, distinct from `TempInventory`/`Currencies` — items and Credits stored there are invisible to every other page. Read-only today (`getVaultInventory()`).
- Drones are inventory items: `Drone_FastTravel`, `Drone_Construction`, `Drone_Recovery`.

---

## 2. Safety / Mutation Model

All writes flow through `mutationService.mutate(key, label, action)`:

1. Reject if another mutation is active (409).
2. Reject if the game is running (409).
3. Run compatibility checks (schema, tables, tools).
4. Create a session backup if none exists.
5. Stage all three save variants to a temp dir.
6. Take a rollback snapshot of the primary.
7. Hash + validate (integrity + FK) the live primary before writing.
8. Execute the service action against the staged directory.
9. Validate + hash the staged primary; reject if unchanged.
10. Re-check game-closed + live-hash-unchanged.
11. Atomically copy staged primary to live.
12. Re-validate + hash live; return full receipt (operationId, backupId, before/after hashes, integrity, FK, targetVerification, warnings, rollbackStatus).
13. On any failure after install: automatic rollback from snapshot.

Frontend pages check `afterIntegrity.passed` before accepting a result.

---

## 3. Conventions

- **Frontend:** vanilla ES modules. Add UI as functions that call `FWAPI.*`, then set `el.innerHTML`. Escape dynamic values with `esc()`.
- **Backend:** add service functions in `services/save/*.js` or `services/gvas/*.js` (export them from the domain module, then from the `saveService.js`/`gvasService.js` facade), wire a route in the matching `routes/api/*.js` domain file using `handle()`/`handleMutation()` from `routes/lib/handler.js`.
- **Input validation:** use `toNumber(value, label)` and `sqlStr(value, label)` from `saveService` before SQL interpolation. Wrap writes in `BEGIN IMMEDIATE … COMMIT`.
- **Circular dependency:** `gvasService.js` and `saveService.js` require each other. Always `require('../saveService')` lazily inside functions in `services/gvas/*.js` (see `inventory-write.js`, `rigs.js`).
- **Key secrecy:** never `console.log` the key, never return it in API responses, never write it to logs. `sanitizeOutput` redacts it from shell output.

---

## 4. Frontend Pages

| Page | Route | Purpose |
|---|---|---|
| Overview | `#dashboard` | Resources, faction trust, active character/loadout, tracked quests, inventory summary |
| Characters | `#characters` | List characters |
| Character | `#character/:id` | Details, XP, skills |
| Weapon Builds | `#weapon-builds` | BIS recommendations, add missing parts for owned weapons |
| Presets | `#presets` | Saved weapon/rig configurations with EXR preview correlation |
| Weapon XP | `#weapon-xp` | Per-weapon XP, reference baselines, batch set |
| Vendors | `#vendors` | Faction scores + trader unlocks |
| Stats | `#stats` | Read-only lifetime combat/progression stats: kills/deaths/damage by faction, per-character combat, per-map entry/extract/death, Tug-of-War territory control |
| Hub Upgrades | `#hub-upgrades` | Innards terminals/welfare with prerequisite chains |
| Workshop | `#workshop` | Batch component planner (37 products) |
| Munitions | `#munitions` | Batch component planner (23 ammo/grenade products) |
| Repair Bench | `#repair` | Repair timer, IFF chips, collect ready repairs |
| Inventory | `#inventory` | Structured item list with search/filter, quantity edits |
| Add Items | `#add-items` | Catalog of known items, add missing to inventory |
| Rigs | `#rigs` | Rig ownership, container kits, class/ownership filters |
| Backups | `#backups` | Create, restore, delete versioned backups |
| Diagnostics | `#diagnostics` | Read-only readiness: compatibility, game status, inventory round-trip |
| Settings | `#settings` | Save-directory override; key is loaded from resource only |

---

## 5. API Surface

### Health / Settings / Diagnostics
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Loopback health + compatibility |
| GET | `/api/status` | Game running, schema, backup hashes, mutation state, write readiness |
| GET | `/api/diagnostics` | Full readiness: compatibility, inventory round-trip, mutation state |
| GET | `/api/settings` | Active save dir, defaults, key source |
| POST | `/api/settings` | Update save-dir override and/or set/clear a custom DB key (verified against the live save; stored encrypted) |
| GET | `/api/schema` | Current DB schema |

### Characters
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/characters` | List characters |
| PUT | `/api/characters/:id/level` | Set prestige level |
| POST | `/api/characters/prestige` | Set Level + CharacterSkills.State |
| GET | `/api/characters/:id/details` | XP + skills |
| PUT | `/api/characters/:id/xp` | Set character XP |
| POST | `/api/characters/:id/skills` | Set skill states |

### Progression
| Method | Route | Purpose |
|---|---|---|
| GET/POST | `/api/hub-upgrades` | List / set hub upgrades |
| GET | `/api/weapon-xp` | Weapon XP list |
| GET | `/api/weapon-xp/reference` | 100% reference XP baselines |
| POST | `/api/weapon-xp/batch` | Batch-set weapon XP |
| PUT | `/api/weapon-xp/:weapon` | Set single weapon XP |
| GET | `/api/presets` | Saved presets |
| GET | `/api/weapon-builds` | BIS weapon builds |
| POST | `/api/weapon-builds/add-missing-owned` | Add BIS parts for all owned weapons |
| POST | `/api/weapon-builds/:weaponId/add-missing` | Add missing BIS parts for one weapon |
| POST | `/api/weapon-builds/:weaponId/parts/:partId/add` | Add specific BIS part |
| GET | `/api/stats` | Read-only lifetime combat/progression stats |

### Vendors
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/vendors` | Faction scores + trader unlocks + read-only vendor stock economy (`NPCVendorTypes`/`NPCVendorConsumedItems`) |
| PUT | `/api/vendors/faction/:scope` | Set faction score |
| PUT | `/api/vendors/trader/:key` | Set trader unlock |

### Inventory
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/inventory` | Structured inventory (uesave) |
| GET | `/api/inventory/search?q=` | Name-substring filter |
| GET | `/api/inventory/catalog` | 100%-save catalog + current holdings |
| POST | `/api/inventory/update` | Set item quantity |
| POST | `/api/inventory/add` | Add new item row |
| GET | `/api/rigs` | List rigs |
| POST | `/api/rigs/:rigId/add` | Add rig ownership |
| POST | `/api/rigs/:rigId/high-quality-set` | Add HQ container set |
| GET | `/api/vault` | Vault (home stash) items + Credits -- a separate GVAS blob from TempInventory/Currencies; read-only |

### Currencies
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/currencies` | Water + Credits |
| PUT | `/api/currencies/:rowName` | Set Water/TestCurrency amount |

### Dashboard / Repair / Quests
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/dashboard` | Character + loadout + quests + inventory + currencies |
| GET | `/api/repair` | Repair bench status, IFF chips, destroyed weapons |
| POST | `/api/repair/collect` | Mark repair ready (NextOccurrence=now) |
| POST | `/api/quests/:id/ready` | Mark quest ready to turn in (experimental) |

### Backups
| Method | Route | Purpose |
|---|---|---|
| POST | `/api/backup` | Create session backup |
| POST | `/api/backups` | Create labeled backup |
| GET | `/api/backups` | List backups |
| POST | `/api/backups/:id/restore` | Restore primary from backup |
| DELETE | `/api/backups/:id` | Delete backup |

Every write route returns `beforeIntegrity/afterIntegrity`, `beforeFk/afterFk`, `beforeHashes/afterHashes`, `operationId`, `backupId`, and `rollbackStatus`. Unknown `/api/*` paths return JSON 404.

---

## 6. Run / Restart

- Start: `cd webapp && npm start` (or `start.bat`). Opens `http://127.0.0.1:3000`.
- Stop: `webapp\stop.bat` (PowerShell wrapper around `stop.ps1`).
- **No hot-reload.** After editing `services/`, `routes/`, `utils/`, or `server.js`, restart node. `public/*` changes need only a browser refresh.
- Requires `tools/uesave-src/target/release/uesave.exe` for inventory read/write. Override with `GVAS_UESAVE_BIN`.
- Requires `C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe`. Override with `FW_SQLITE_BIN`.
- The game must be closed while the app edits the live save.
- `npm run vendor:chart` regenerates `public/vendor/chart.mjs` from the `chart.js` devDependency; only needed when bumping that dependency, not part of the normal edit/refresh loop.

---

## 7. Tests

- Node tests: `npm test` (`node --test test/*.test.js`)
- Browser tests: `npm run test:browser` (Playwright; uses intercepted static fixtures, never touches live save)

---

## 8. Version-change Rule

After a major game update, treat encryption, table schema, internal tags, reference compatibility, and GVAS formulas as **unverified**. Reinspect raw bytes and prove the smallest possible staged test before larger edits. Re-run the uesave round-trip (`to-json` → `from-json` → compare SHA-256) on the new save blob before trusting structured edits.

---

## 9. Known Paths

```
Live save directory:    C:\Users\Admin\AppData\Local\ForeverWinter\Saved\SaveGames
Backup root:            C:\Users\Admin\AppData\Local\ForeverWinter\Saved\SaveBackups
SQLite3MC shell:        C:\tmp\fw-tools\sqlite3mc\bin\sqlite3mc_shell_x64.exe
Key source (dev):       C:\Users\Admin\Documents\Forever Winter\fwinter-db-key.txt (plaintext, private, never shipped)
Key resource (runtime): C:\Users\Admin\Documents\Forever Winter\webapp\resources\dbkey.resource.json (AES-256-GCM encrypted)
100% reference save:    C:\Users\Admin\Documents\Forever Winter\reference\YOUR_HASHCODE_HERE.dat
Webapp:                 C:\Users\Admin\Documents\Forever Winter\webapp\
uesave binary:          C:\Users\Admin\Documents\Forever Winter\tools\uesave-src\target\release\uesave.exe
App settings:           C:\Users\Admin\Documents\Forever Winter\webapp\config\settings.json (gitignored, mode 0o600)
Temp scripts/exports:   C:\Users\Admin\Documents\Forever Winter\.temp/  (clean before session end)
```
