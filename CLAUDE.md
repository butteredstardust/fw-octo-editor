# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

**`AGENTS.md` is the canonical agent ruleset for this repo** — architecture, safety/mutation model, full API surface, and coding conventions. Read it first; it applies to every coding agent working here, not just Claude, so keep it agent-agnostic if you edit it.

Other canonical docs:
- **`INSTALL_GUIDE.md`** — setup, prerequisites, environment variables, running the app and test suite. There is no root `package.json`; every `npm`/`node` command runs from `webapp/`.
- **`DEVELOPER_GUIDE.md`** — deep architecture, request lifecycle, and a cookbook for adding routes/services/UI.
- **`TROUBLESHOOTING.md`** — fixes for common runtime failures.

## Claude-specific notes

- **Charts**: never import `chart.js` (or `vendor/chart.mjs`) from a feature module — everything goes through `webapp/public/modules/charts.mjs` (`chartFigure()` / `createChart()` / `destroyCharts()`). Every chart needs its paired data table; a canvas alone is invisible to screen readers. Call `destroyCharts(container)` immediately before any `innerHTML` swap that removes old canvases. Validate any multi-series (categorical) palette with the `dataviz` skill's palette validator before shipping; if nothing passes, fall back to `chartFigure`'s `panels` option (small multiples).
- **Skills referenced in this repo's docs** (e.g. `dataviz`) are Claude Code tooling, not repo scripts — don't go looking for them under `webapp/scripts/`.
