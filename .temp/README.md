# Temporary files directory

Place temporary files here during save-editing sessions:
- Test scripts: `*.ps1`
- Inventory snapshots: `inventory-*.csv`
- Config files: `*.json`, `*.csv`

Clean this folder before ending your session. This directory is ignored by version control.

For reference data and name mappings, see:
- `../reference/YOUR_HASHCODE_HERE.dat` — 100% reference save
- `../webapp/data/items.canonical.json` — canonical item catalog (generated via `npm run items:generate`)
- `../webapp/data/weapon-builds.canonical.json` — canonical weapon build data (generated via `npm run weapons:generate`)