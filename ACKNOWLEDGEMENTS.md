# Acknowledgements

This project bundles data and third-party software. We are grateful to the
respective authors and communities.

## Dataset Attribution (CC BY-SA)

Game data used by this application (item catalogs, weapon build tables,
workshop/munitions recipes, and hub upgrade projections) is derived from and
incorporates content from **The Forever Winter Wiki**
(<https://theforeverwinter.wiki.gg>).

> The Forever Winter Wiki contributors — *CC BY-SA*

The underlying wiki content is licensed under the **Creative Commons
Attribution-ShareAlike (CC BY-SA)** license. A copy of the license is
available at <https://creativecommons.org/licenses/by-sa/4.0/>.

Where this project redistributes or derives from that content, the work is
offered under the same CC BY-SA terms, and the original wiki is credited as
the source (`sourceUrl: https://theforeverwinter.wiki.gg/api.php`,
attribution: "The Forever Winter Wiki contributors, CC BY-SA").

## Application License

The Forever Winter Save Editor webapp source code (the `webapp/` directory
and associated scripts) is licensed under the **MIT License**. See
`webapp/LICENSE` for the full text.

> Copyright (c) 2026 Forever Winter Save Editor contributors.
>
> The MIT License does **not** grant any rights to the game *Forever Winter*
> or its assets, which are the property of their respective owners. This is an
> unofficial, community-made tool and is not affiliated with or endorsed by
> the game's developers or publishers.

## Third-Party Software Notices

### Express
- Package: `express` (`^4.18.2`)
- License: MIT
- Copyright: Copyright (c) Express.js Foundation and other contributors
- <https://github.com/expressjs/express>
- Express depends on many MIT-licensed sub-packages (body-parser, qs, send,
  finalhandler, mime-types, etc.). Their individual license files are present
  under `webapp/node_modules/*/LICENSE`.

### Node.js
- Runtime: Node.js
- License: MIT
- Copyright: Copyright (c) Node.js contributors
- <https://github.com/nodejs/node/blob/main/LICENSE>
- Node.js includes bundled dependencies (e.g. libuv, V8, ICU) under their own
  respective licenses (MIT, BSD, Unicode Data License). See the Node.js
  LICENSE file for the complete list.

### SQLite3 Multiple Ciphers (SQLite3MC)
- Binary: `sqlite3mc_shell_x64.exe` (SQLite3MC 2.3.6, SQLite 3.53.3)
- License: SQLite Public Domain License / Mozilla Public License 2.0
  (SQLite3MC is MPL 2.0; the SQLite core library is in the public domain)
- Copyright: (c) 2026 Ulrich Telle — <https://github.com/utelle/SQLite3MultipleCiphers>
- <https://github.com/utelle/SQLite3MultipleCiphers>
- Shell binaries downloaded from the SQLite3MC Windows release
  (release date 2026-07-10). May optionally bundle ICU 78.3
  (<https://github.com/unicode-org/icu>, Unicode Data License).

### uesave
- Binary: `uesave.exe` (from `experiment/uesave-src`)
- License: MIT
- Copyright: Copyright (c) 2022 Truman Kilen
- <https://github.com/trumank/uesave-rs>
- Used to read/write the GVAS `TempInventory` blob (Unreal Engine 5 save data).

### Playwright (dev dependency)
- Package: `@playwright/test` (`^1.61.1`)
- License: Apache-2.0
- Copyright: Copyright (c) Microsoft Corporation
- <https://github.com/microsoft/playwright>
- Used only for browser-based tests; not part of the distributed runtime.

## Trademarks

"Forever Winter" and related names, logos, and assets are trademarks or
copyrights of their respective owners. All such material is used here for
informational and interoperability purposes only and remains the property of
its owners.
