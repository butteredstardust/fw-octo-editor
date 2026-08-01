# Acknowledgements and Notices

FW OCTO Editor bundles game-data derivatives and third-party software. We are grateful to their authors and communities.

## Game-data attribution (CC BY-SA)

Item catalogs, weapon-build tables, workshop and munitions recipes, and hub upgrade projections derive from and incorporate content from [The Forever Winter Wiki](https://theforeverwinter.wiki.gg).

> The Forever Winter Wiki contributors — *CC BY-SA*

The underlying wiki content is licensed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Where this project redistributes or derives from that content, it is offered under the same CC BY-SA terms and credits the original wiki as the source (`sourceUrl: https://theforeverwinter.wiki.gg/api.php`; attribution: "The Forever Winter Wiki contributors, CC BY-SA").

## Application license

The FW OCTO Editor webapp source code (the `webapp/` directory and associated scripts) is licensed under the [MIT License](webapp/LICENSE).

> Copyright (c) 2026 FW OCTO Editor contributors.
>
> The MIT License does **not** grant any rights to the game *Forever Winter* or its assets, which remain the property of their respective owners.

## Third-party software and files

### Express

- Package: `express` (`^4.18.2`); license: MIT; copyright: Express.js Foundation and other contributors.
- <https://github.com/expressjs/express>
- Express depends on many MIT-licensed sub-packages (including body-parser, qs, send, finalhandler, and mime-types); their license files are included in `webapp/node_modules/*/LICENSE` when dependencies are installed.

### Node.js

- Runtime: Node.js; license: MIT; copyright: Node.js contributors.
- <https://github.com/nodejs/node/blob/main/LICENSE>
- Node.js includes bundled dependencies such as libuv, V8, and ICU under their own licenses. See the Node.js LICENSE file for the complete list.

### SQLite3 Multiple Ciphers (SQLite3MC)

- Binary: `sqlite3mc_shell_x64.exe` (SQLite3MC 2.3.6, SQLite 3.53.3).
- License: SQLite core public domain; SQLite3MC MPL 2.0. Copyright: (c) 2026 Ulrich Telle.
- <https://github.com/utelle/SQLite3MultipleCiphers>
- The Windows shell binary was downloaded from the SQLite3MC release dated 2026-07-10. It may optionally bundle ICU 78.3, which is available under the Unicode Data License.

### uesave

- Binary: `uesave.exe` (from `tools/uesave-src`); license: MIT; copyright: (c) 2022 Truman Kilen.
- <https://github.com/trumank/uesave-rs>
- Used to read and write the Unreal Engine 5 GVAS `TempInventory` blob.

### Playwright (development dependency)

- Package: `@playwright/test` (`^1.61.1`); license: Apache-2.0; copyright: Microsoft Corporation.
- <https://github.com/microsoft/playwright>
- Used only for browser tests; it is not part of the distributed runtime.

### Chart.js 4.5.1 and @kurkle/color 0.3.4

- License: MIT. Copyright: (c) 2014–2024 Chart.js Contributors; (c) 2018–2024 Jukka Kurkela for `@kurkle/color`.
- Chart.js: <https://github.com/chartjs/Chart.js>; `@kurkle/color`: <https://github.com/kurkle/color>, version 0.3.4.
- Chart.js is a development dependency. Its generated ESM build is committed in `webapp/public/vendor/` for browser runtime, so the browser uses the committed asset even when development dependencies are omitted.

### Black Ops One typeface

- License: SIL Open Font License 1.1 (OFL-1.1). Copyright: (c) 2011, Asterism (<https://www.asterism-fonts.com>), with Reserved Font Name "Black Ops One".
- Original source: <https://fonts.google.com/specimen/Black+Ops+One>
- Bundled locally as a TTF file so the app makes no outbound request to load the application-title typeface.

`mc_loop_res1.gif`, the favicon, and application icons are included as local application files; this notice makes no claim about their provenance or license beyond any applicable rights held by their respective owners.

## Trademarks and disclaimer

“Forever Winter” and related names, logos, and assets are trademarks or copyrights of their respective owners. They are used only for informational and interoperability purposes and remain their owners' property.

FW OCTO Editor is **unofficial**, **not affiliated with or endorsed by Fun Dog Studios**, and intended for **single-player use only**. It is provided for personal save-backup and editing convenience without a warranty of future-game compatibility. Users remain responsible for complying with the game's EULA and applicable third-party platform terms.
