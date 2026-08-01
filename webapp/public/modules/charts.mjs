// Chart.js wrapper -- the single place any page creates a chart. Feature
// modules never import Chart.js (or the vendor/ shim) directly; they import
// from here. This is a leaf utility module (same layer as dom.mjs /
// feedback.mjs): it has no dependency on runtime.mjs/FW state, so it is not
// exposed on the FW registry -- feature modules `import { ... } from
// '../charts.mjs'` directly, exactly like feedback.mjs imports esc directly
// from dom.mjs rather than routing it through FW. Putting a vendor-touching,
// stats-page-only API on the global FW namespace would only add surface area
// every other page has to ignore.
import Chart from '../vendor/chart.mjs';
import { esc } from './dom.mjs';

// ---------------------------------------------------------------------------
// Lifecycle: make leaking a Chart instance across a re-render impossible by
// construction, not by caller discipline.
//
// The stats page (and any future chart page) re-renders by replacing a
// container's innerHTML wholesale (setRenderedHtml/showLoading). If a Chart
// instance bound to an old <canvas> isn't destroyed, Chart.js keeps its
// ResizeObserver, animation frame loop, and event listeners alive against a
// detached node -- that's the leak, and the "mis-render" symptom is a stale
// chart's resize/animation handlers still running when a new chart happens
// to reuse the same canvas id.
//
// Two layers close this off:
//   1. createChart() ALWAYS destroys any chart already bound to the exact
//      canvas element passed in before creating the new one -- so calling
//      createChart() twice on the same live node can never leak.
//   2. A single module-scoped MutationObserver watches the document for
//      node removal and destroys+untracks any chart whose canvas has become
//      disconnected (e.g. because a container's innerHTML was replaced out
//      from under it without an explicit destroyCharts() call first). This
//      is the safety net for the case a caller forgets step 3 below -- it
//      does not depend on every call site remembering to clean up.
//   3. destroyCharts(container) is provided for callers that want
//      synchronous, immediate teardown (e.g. right before setRenderedHtml())
//      rather than waiting for the MutationObserver's next microtask.
const chartByCanvas = new Map(); // <canvas> -> live Chart instance
let cleanupObserver = null;

function ensureCleanupObserver() {
  if (cleanupObserver || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
  cleanupObserver = new MutationObserver(() => {
    for (const [canvas, chart] of chartByCanvas) {
      if (!canvas.isConnected) {
        chart.destroy();
        chartByCanvas.delete(canvas);
      }
    }
  });
  cleanupObserver.observe(document.body, { childList: true, subtree: true });
}

// Destroys and untracks every chart whose canvas is `container` itself or a
// descendant of it. Call this immediately before replacing a container's
// innerHTML (setRenderedHtml/showLoading) so old charts never linger even
// for one MutationObserver tick.
export function destroyCharts(container) {
  if (!container) return;
  const canvases = container instanceof HTMLCanvasElement ? [container] : [...container.querySelectorAll('canvas')];
  for (const canvas of canvases) {
    const chart = chartByCanvas.get(canvas);
    if (chart) {
      chart.destroy();
      chartByCanvas.delete(canvas);
    }
  }
}

// ---------------------------------------------------------------------------
// Theme: read the live CSS custom properties rather than hardcoding hex, so
// chart chrome always matches whatever the design tokens currently say (and
// so the contrast pairing validated in test/browser/contrast.spec.js is the
// one actually used for chart text). Text tokens are used ONLY for text --
// ticks, legend labels, and tooltip body -- never for a data series' mark
// color, and a series color is never used for text. That split is
// non-negotiable per the dataviz skill: color identifies a series, ink reads.
function cssVar(name, fallback) {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function chartTheme() {
  return {
    grid: cssVar('--gunmetal-dark', '#2A2D33'),
    tick: cssVar('--text-2', '#9AA0AB'),
    tooltipBg: cssVar('--surface-2', '#15171C'),
    tooltipText: cssVar('--text', '#E1E3E8')
  };
}

// Non-faction categorical series palette (up to 3 slots: e.g. kills / deaths
// / extractions, or entries / extractions / deaths). These are the reference
// dataviz-skill categorical palette's first three slots (blue/orange/aqua),
// which are the only three of the skill's eight hues that validate under
// `--pairs all` in both modes -- i.e. safe to show together in one legend,
// not just pairwise-adjacent. They numerically coincide with three of this
// app's seven FACTION_META colors (stats.mjs), but factions and these
// generic series are never legend-adjacent in the same chart, so that reuse
// does not create an identity collision in practice. Verified:
//   node validate_palette.js "#3987e5,#d95926,#199e70" --mode dark --surface "#15171C" --pairs all
//   -> ALL CHECKS PASS (worst all-pairs CVD ΔE 9.4 deutan; worst all-pairs
//      normal-vision ΔE 20.9)
export const SERIES_COLORS = Object.freeze(['#3987e5', '#d95926', '#199e70']);

export function seriesColor(index) {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

// Chart.js's scale shape is not one-size-fits-all: cartesian types (bar,
// line, scatter, bubble) use x/y; radar and polarArea use a single radial
// "r" scale with different sub-options (angleLines/pointLabels instead of
// grid/border, no x/y at all); doughnut/pie use no scales key whatsoever. A
// naive unconditional `scales: { x, y }` default deep-merges two meaningless
// cartesian scales into a radar or doughnut config unless the caller
// remembers to fully override `scales` themselves -- easy to miss, and
// exactly the kind of silent-junk bug this wrapper exists to prevent. So the
// scales default is chosen per chart type instead of applied unconditionally.
const RADIAL_TYPES = new Set(['radar', 'polarArea']);
const NO_SCALE_TYPES = new Set(['doughnut', 'pie']);

function scalesFor(type, theme) {
  if (RADIAL_TYPES.has(type)) {
    return {
      r: {
        beginAtZero: true,
        angleLines: { color: theme.grid },
        grid: { color: theme.grid },
        pointLabels: { color: theme.tick },
        // Chart.js defaults ticks.backdropColor to a light box (meant for a
        // light chart surface) drawn behind each numeric tick label -- on
        // this dark-only app that renders as a stray opaque light rectangle
        // over the dark surface. Turn the backdrop off so only the tick
        // text (in the theme's ink color) shows.
        ticks: { color: theme.tick, backdropColor: 'transparent' }
      }
    };
  }
  if (NO_SCALE_TYPES.has(type)) return null;
  // Cartesian types, and the default for any type this wrapper doesn't
  // special-case (a caller can still fully override `scales` if a future
  // chart type needs something else).
  return {
    x: {
      grid: { color: theme.grid, drawTicks: false },
      border: { color: theme.grid },
      ticks: { color: theme.tick }
    },
    y: {
      beginAtZero: true,
      grid: { color: theme.grid, drawTicks: false },
      border: { color: theme.grid },
      ticks: { color: theme.tick }
    }
  };
}

// Shared defaults applied to every chart: no chart junk, recessive grid,
// thin marks, tooltips on, legend shown only when there is more than one
// series to disambiguate (a lone series needs no legend box -- the chart's
// own aria-label/title names it), animation off under reduced-motion.
function baseOptions(type, datasetCount) {
  const theme = chartTheme();
  const reduced = prefersReducedMotion();
  const scales = scalesFor(type, theme);
  return {
    responsive: true,
    // The wrapper this module renders (see chartFigure) gives the canvas a
    // fixed CSS height, so the chart should fill that box exactly rather
    // than compute its own height from an aspect ratio -- otherwise the
    // canvas grows unbounded as its width changes on resize.
    maintainAspectRatio: false,
    color: theme.tick,
    font: { family: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
    interaction: { mode: 'nearest', intersect: false },
    elements: {
      line: { borderWidth: 2, tension: 0.3 },
      point: { radius: 3, hoverRadius: 5, borderWidth: 1 },
      bar: { borderWidth: 0, borderRadius: 3 },
      arc: { borderWidth: 2 }
    },
    plugins: {
      legend: {
        display: datasetCount > 1,
        labels: { color: theme.tick, boxWidth: 12, boxHeight: 12, usePointStyle: true }
      },
      tooltip: {
        enabled: true,
        backgroundColor: theme.tooltipBg,
        titleColor: theme.tooltipText,
        bodyColor: theme.tooltipText,
        borderColor: theme.grid,
        borderWidth: 1,
        padding: 8,
        cornerRadius: 4,
        boxPadding: 4
      }
    },
    ...(scales ? { scales } : {}),
    animation: reduced ? false : { duration: 400 }
  };
}

function buildConfig(config) {
  if (!isPlainObject(config) || !config.type || !config.data) {
    throw new Error('createChart: config.type and config.data are required');
  }
  const datasetCount = Array.isArray(config.data.datasets) ? config.data.datasets.length : 0;
  const options = deepMerge(baseOptions(config.type, datasetCount), config.options || {});
  return { ...config, options };
}

// Creates (or replaces) a Chart bound to `canvasEl`, applying the shared
// theme/behavior defaults above merged under any per-chart `config.options`.
// Any chart already bound to this exact canvas is destroyed first (see the
// lifecycle note above), so re-calling createChart() on the same node -- the
// normal case on a re-rendered page -- can never leak.
export function createChart(canvasEl, config) {
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('createChart: canvasEl must be a <canvas> element');
  destroyCharts(canvasEl);
  ensureCleanupObserver();
  const chart = new Chart(canvasEl, buildConfig(config));
  chartByCanvas.set(canvasEl, chart);
  return chart;
}

// ---------------------------------------------------------------------------
// Accessibility: a canvas is invisible to screen readers, so every chart
// gets role="img" + a meaningful aria-label AND a paired data table behind a
// "Show data table" disclosure -- never canvas-only. Returns markup (a
// caller inserts it via setRenderedHtml, same as every other render* helper
// in this codebase) rather than mutating the DOM itself, so it composes with
// the rest of a page's render function.
//
//   { id, ariaLabel, title, columns, rows, height, panels }
//     id        canvas element id (must be unique on the page); also set as
//               the figure's data-chart attribute, which is the stable hook
//               tests and other callers should select on (see
//               test/browser/ux.spec.js) rather than walking the DOM.
//     ariaLabel accessible name for the canvas (role="img")
//     title     optional visible caption for the data table / disclosure
//     columns   array of column header strings
//     rows      array of arrays (cell values, in column order)
//     height    px height for the CSS-sized wrapper (default 260)
//     panels    optional array of { id, ariaLabel, label } for a
//               small-multiples figure: one canvas per panel, laid out
//               side by side, sharing the single data table below. Used
//               instead of a single `id` canvas when a chart form has no
//               legal categorical (multi-series) color palette -- a lone
//               series per panel needs no legend and carries no CVD
//               separation requirement, so any semantic color is free.
export function chartFigure({ id, ariaLabel, title, columns = [], rows = [], height = 260, panels = null }) {
  const head = columns.map(col => `<th scope="col">${esc(col)}</th>`).join('');
  const body = rows.map(row => `<tr>${row.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
  const caption = esc(title || ariaLabel || '');
  const h = Number(height) > 0 ? Number(height) : 260;
  const chartMarkup = Array.isArray(panels) && panels.length
    ? `<div class="chart-figure-panels">${panels.map(p => `<div class="chart-panel">
        <p class="chart-panel-label">${esc(p.label || p.ariaLabel || '')}</p>
        <div class="chart-wrap" style="height:${h}px">
          <canvas id="${esc(p.id)}" role="img" aria-label="${esc(p.ariaLabel || p.label || '')}"></canvas>
        </div>
      </div>`).join('')}</div>`
    : `<div class="chart-wrap" style="height:${h}px">
      <canvas id="${esc(id)}" role="img" aria-label="${esc(ariaLabel || title || '')}"></canvas>
    </div>`;
  return `<div class="chart-figure" data-chart="${esc(id)}">
    ${chartMarkup}
    <details class="chart-data-disclosure">
      <summary>Show data table${title ? ` -- ${esc(title)}` : ''}</summary>
      <div class="chart-data-scroll"><table class="chart-data-table">
        <caption class="sr-only">${caption}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table></div>
    </details>
  </div>`;
}
