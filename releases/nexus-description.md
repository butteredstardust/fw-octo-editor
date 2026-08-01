# FW OCTO Editor

A save editor for *The Forever Winter*. Fix a bad prestige reset, restock the gear a raid ate, top up Water and Credits, or unlock the Innards upgrades you already earned — all from a page in your browser, on your own PC.

No account, no launcher, no internet connection. It doesn't bleed blood — it bleeds data.

![The editor's overview page: active scavenger, loadout, tracked quests, and resources](https://raw.githubusercontent.com/butteredstardust/fw-octo-editor/main/docs/screenshots/overview.png)

## Get started

1. **Close *The Forever Winter*.** Completely — the editor refuses to touch a save the game still has open.
2. Download the `.exe` below and run it. Everything it needs is inside the installer; there's nothing else to download or set up.
3. Launch **FW OCTO Editor** from your Start menu. It opens a page in your browser — that page *is* the app.

Windows SmartScreen may warn you about an unrecognised publisher, because this installer isn't code-signed. Choose **More info → Run anyway** if you're comfortable with that.

## What you can change

**Your scavenger**
- Set prestige level (0–50) and XP, for any character in your roster.
- Open the full skill tree and grant nodes individually, or apply the exact skill set a maxed character is supposed to have.

**Your stash**
- Search and filter every item you own, then set any quantity you like.
- Add items you don't have yet, including rig containers and high-quality kits.
- Top up Water and Credits.

**Your guns**
- See how far each weapon is from max level, then set weapon XP by hand or match a maxed reference in one click.
- Get a best-in-slot parts recommendation for any weapon, built from wiki stat data — and add every missing part for the guns you actually own with one button.

**Your hub and standing**
- Unlock, lock, or remove Innards upgrades. Prerequisites are enforced so you can't build an impossible hub; material costs are shown for planning but aren't charged.
- Raise faction scores to open up vendor stock, or flip trader-unlock flags directly.
- Clear Repair Bench jobs, and mark quests ready to turn in (you still finish the hand-off in-game).

**Your numbers**
- A read-only Stats page: lifetime kills, extractions, damage by faction, per-map activity, and territory control, drawn straight from your save.

## Your save is not at risk

- **Automatic backup.** A timestamped, checksummed copy of your save is made before the first change of every session. You can take extra labelled backups, and restore any of them, from the Backups page.
- **Nothing is written while the game is open.** The editor checks, and refuses.
- **Every change is rehearsed first.** Edits are applied to a copy, verified, and only then swapped into place. If anything looks wrong at any point, the original is put back automatically and you're told what happened.
- **It stays on your PC.** The app is reachable only from your own machine and makes no outbound connections — nothing is uploaded, and nothing phones home.

If something does go wrong, the [troubleshooting guide](https://github.com/butteredstardust/fw-octo-editor/blob/main/TROUBLESHOOTING.md) covers the usual causes, and you can [open an issue](https://github.com/butteredstardust/fw-octo-editor/issues).

## Requirements

- Windows 10 or 11, 64-bit
- *The Forever Winter* installed via Steam, with saves in the standard location (`%LOCALAPPDATA%\ForeverWinter\Saved\SaveGames`)
- A web browser

## Before you use it

- **Single-player only.** This edits your local save for offline play. Taking edited saves into online or multiplayer sessions may breach the game's EULA or Terms of Service and could get your account restricted. If in doubt, don't.
- **Unofficial.** Not made by, affiliated with, or endorsed by Fun Dog Studios. All game trademarks and copyrights belong to their owners.
- **No warranty.** Provided as-is, with no guarantee it will keep working after a game update. Keep your own backups too.
- **A game update can change the save format.** If the editor warns you that it hasn't been verified against your installed game version, that's exactly what it means — proceed carefully, or wait for an update.

## Credits and licences

Full notices are in the app's **Acknowledgements** dialog.

- Game data derived from [The Forever Winter Wiki](https://theforeverwinter.wiki.gg) — CC BY-SA, by the wiki's contributors.
- Bundled software: Node.js and Express (MIT), `sqlite3mc` (SQLite Public Domain / MPL 2.0), `uesave` (MIT), Black Ops One typeface (OFL-1.1).
- The editor itself is MIT-licensed; `LICENSE` ships in the package.

---

*System operational. Gratitude to the developers, the community, and all Scavengers keeping us alive. Good hunting, comrade.*
