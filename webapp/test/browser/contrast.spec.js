// WCAG AA contrast regression test for design tokens defined in
// webapp/public/css/foundation.css.
//
// Pairs below were derived by grepping every CSS file under webapp/public/css
// for foreground `color: var(--x)` declarations paired with a `background`
// (or `background-color`) `var(--y)` declaration on the same rule, or on an
// ancestor rule for nested selectors (e.g. `.dash-att small` inherits the
// `--teal-bg` fill set on `.dash-att`). Only pairs that are actually used
// together somewhere in the shipped CSS are included -- this is not a
// combinatorial matrix of every token against every other token.
//
// Contrast is computed in-page from the *resolved* computed-style values of
// the CSS custom properties (read off `getComputedStyle(document.documentElement)`),
// not from hardcoded hex literals in this file, so a future edit to
// foundation.css that regresses a token's contrast will fail this test
// automatically without needing the test updated.

const { test, expect } = require('@playwright/test');
const express = require('express');
const path = require('node:path');

let server;
let baseURL;

test.beforeAll(async () => {
  const app = express();
  app.use(express.static(path.join(__dirname, '..', '..', 'public')));
  server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

// [foreground token, background token, AA threshold, source note]
const PAIRS = [
  // Body/base text
  ['text', 'bg', 4.5, 'body text on page background'],
  ['text', 'surface', 4.5, 'card headings/body on card surface (foundation.css .card)'],
  ['text', 'surface-2', 4.5, 'text on nested-panel surface (multiple files)'],
  ['text', 'surface-hover', 4.5, 'text on hovered table row (foundation.css tr:hover)'],

  // Secondary/muted text -- the tokens this task specifically targets
  ['text-2', 'surface', 4.5, 'trader-status.auto on surface (people-and-vendors.css)'],
  ['text-2', 'surface-2', 4.5, 'header .status on surface-2 (foundation.css)'],
  ['text-2', 'gunmetal-dark', 4.5, 'notstart/secondary badges & btn-neutral on gunmetal-dark'],
  ['text-2', 'chip-bg', 4.5, 'char-capped/char-skill-tag/dash-quest-reward on chip-bg'],
  ['text-2', 'progress-bg', 4.5, 'hub-group-progress on progress-bg (progression.css)'],
  ['muted-text', 'surface-2', 4.5, 'nav-group-title / trader-toggle on surface-2'],
  ['muted-text', 'teal-bg', 4.5, 'dash-att small (nested) on teal-bg fill (shared-pages.css)'],

  // Tooltip text
  ['text-tooltip', 'surface-deep', 4.5, 'refinements.css tooltip on surface-deep'],

  // Status/accent chips and buttons
  ['amber-warn', 'warn-bg', 4.5, 'caution/cost badges & .ref/.btn-warn buttons'],
  ['amber-soft', 'warn-bg', 4.5, 'hv-badge / req-badge.unmet (refinements.css)'],
  ['amber-soft', 'cost-bg', 4.5, 'progression.css cost display'],
  ['on-amber', 'amber', 4.5, 'primary .set/.btn-primary buttons (also covered by ux.spec.js)'],
  ['teal-soft', 'teal-bg', 4.5, '.mini/.trader-toggle/.res-add ghost buttons'],
  ['teal-soft', 'chip-bg', 4.5, 'icon-chip and category chips'],
  ['teal-soft', 'skill-gate-on-bg', 4.5, 'people-and-vendors.css skill gate chip'],
  ['pill-teal-text', 'pill-teal-bg', 4.5, 'inventory.css .item-pill'],
  ['green', 'green-bg', 4.5, 'success banners / ready states'],
  ['green', 'green-deep-bg', 4.5, 'repair.css deep success fill'],
  ['green', 'skill-on-bg', 4.5, 'people-and-vendors.css active skill node'],
  ['red', 'red-bg', 4.5, 'danger/error banners and buttons'],
  ['red', 'red-deep-bg', 4.5, 'repair.css deep danger fill'],
];

// Note: decorative border/divider pairs (`border-color: var(--gunmetal)` etc.)
// are intentionally out of scope here. They're UI-component boundaries, not
// text -- WCAG's applicable rule for those is 1.4.11 Non-text Contrast (3:1,
// and only for *essential* graphical objects), not the 4.5:1 normal-text
// threshold this task audited. Some measure below 3:1 (e.g. --green-border on
// --green-bg, ~1.95:1); redesigning decorative borders is a separate,
// deliberately-out-of-scope pass, so it isn't silently folded in here.

async function measureContrast(page, pairs) {
  return page.evaluate(list => {
    const root = getComputedStyle(document.documentElement);
    const hexToRgb = hex => {
      hex = hex.trim().replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const relLuminance = ([r, g, b]) => {
      const [rs, gs, bs] = [r, g, b].map(c => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };
    const contrast = (hex1, hex2) => {
      const l1 = relLuminance(hexToRgb(hex1));
      const l2 = relLuminance(hexToRgb(hex2));
      const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (lighter + 0.05) / (darker + 0.05);
    };
    return list.map(([fg, bg, threshold, note]) => {
      const fgValue = root.getPropertyValue(`--${fg}`).trim();
      const bgValue = root.getPropertyValue(`--${bg}`).trim();
      return { fg, bg, threshold, note, fgValue, bgValue, ratio: contrast(fgValue, bgValue) };
    });
  }, pairs);
}

test('every used foreground/background text-token pair meets WCAG AA (4.5:1) contrast', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto(baseURL);

  const results = await measureContrast(page, PAIRS);

  for (const r of results) {
    expect(r.fgValue, `--${r.fg} should resolve to a hex value`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    expect(r.bgValue, `--${r.bg} should resolve to a hex value`).toMatch(/^#[0-9a-fA-F]{3,6}$/);
    expect(
      r.ratio,
      `--${r.fg} (${r.fgValue}) on --${r.bg} (${r.bgValue}) [${r.note}] measured ${r.ratio.toFixed(2)}:1, needs >= ${r.threshold}:1`
    ).toBeGreaterThanOrEqual(r.threshold);
  }
});
