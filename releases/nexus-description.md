# Forever Winter Save Editor

A local save editor for *The Forever Winter*, forged in the bio-slums and upgraded with hope. It doesn't bleed blood—it bleeds data. Edit your scavenger's progression, stash, weapons, and reputation without losing your grip on what matters. *I wear it with gratitude.* Stay alive out there, comrade.

## What it does

- **Characters**: Set prestige level, tweak XP, or open the full skill-node editor. Import exact skill grants from a verified reference—the real *hardening* process, but without the memory wipes. Your build stays clean, even if you can't quite remember your real name.
- **Inventory**: Browse, search, and filter every item in your Inventory. Set quantities, add missing gear, or scrap the junk slowing you down—like looting the dead, but without the bandits stalking you.
- **Currencies**: Top up Water and Credits directly. No more performing for performance credits like the old days in the Department of State Security.
- **Hub Upgrades**: Unlock, lock, or remove Innards upgrades. Prerequisite chains are respected, and material costs are checked before you commit. One less thing to grieve over.
- **Weapon XP**: See exactly how far your weapons are from their best-in-slot potential. Set XP manually or batch-match the 100% reference in one click. Three-round groups at 300 meters, guaranteed.
- **Weapon Builds**: Get best-in-slot recommendations derived from wiki data. Add every missing owned part with a single button press—like the Magnificent Seven, but without the drug raid.
- **Vendors & Faction Trust**: Boost faction scores for better vendor access, or toggle trader-unlock flags directly. I advise on defense strategy and fighting tactics to improve the capability and readiness of your community.
- **Repair Bench**: Mark jobs complete. Those six lungs don't tune themselves.
- **Quests**: Mark quests ready to turn in (experimental—you still have to open the game to finish the hand-off). *I hope to make new memories here. Good ones.*
- **Rigs**: Manage rig ownership and add high-quality container kits. Stay safe, and thank you again.

## How it works

The app runs locally on your machine, bound to `127.0.0.1:3000`. It never phones home, never requests outbound network access, and never touches your save while the game is running. Every write is staged through a copy-on-write mutation with automatic versioned backups and byte-identical integrity checks. If anything goes wrong, rollback is automatic. *That felt like forever.*

## Installation

1. Download the latest `.exe` installer.
2. Run it. Everything the app needs—Node.js, dependencies, and native tools—is bundled. No separate setup required.
3. **Close the game** before editing the live save.

## Requirements

- Windows 10/11 (64-bit)
- *The Forever Winter* installed via Steam
- Local saves located at `%LOCALAPPDATA%\ForeverWinter\Saved\SaveGames`

## Important Notes

- **Unofficial tool**: This is not created, affiliated with, or endorsed by Fun Dog Studios. All game trademarks and copyrights remain the property of their respective owners.
- **Single-player use only**: This editor modifies local save files for offline use. Using or distributing edited save data in online or multiplayer sessions may violate the game's End User License Agreement or Terms of Service and could result in account restrictions or bans. If in doubt, keep flight mode on.
- **No warranty**: This tool is provided as-is. The authors make no guarantees about compatibility with current or future game versions. Always back up your save files before editing.
- **Game must be closed**: The app will refuse to write while the Forever Winter process is running. Editing an active save will corrupt it.
- **Backups are automatic**: Every write creates a timestamped, checksummed backup with a manifest. You can restore from the Backups page at any time.

## Third-Party Notices

This application bundles data and software from the following sources. Full notices, licenses, and attributions are available in the in-app **Acknowledgements** dialog.

- **Game data** — derived from [The Forever Winter Wiki](https://theforeverwinter.wiki.gg) (CC BY-SA).
- **Web server / runtime** — Express (MIT), Node.js (MIT).
- **Save engine** — `sqlite3mc` (SQLite Public Domain / MPL 2.0), `uesave` (MIT).
- **Typeface** — Black Ops One (OFL-1.1).

## License

The app source code is released under the **MIT License**. See `LICENSE` in the bundled package.

---

*System operational. Gratitude to the developers, the community, and all Scavengers keeping us alive. Good hunting, comrade.*
