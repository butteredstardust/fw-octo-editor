import { FW } from '../runtime.mjs';
import { metricGrid } from '../card-ui.mjs';

const { esc, emptyStateHtml } = FW;

// The lifetime player totals, rendered identically on the Overview and the
// Stats page so the same numbers never wear two different designs.
//
// Form: a KPI row, not a chart -- these are eight independent current values
// with no shared scale, no time axis and no part-to-whole relationship, so
// there is nothing for a plot to encode.
//
// Kills is the hero figure: one per view, the number each page leads with.
// K/D and extraction rate sit beside it because they are the two derived
// ratios (they say how well, where the counts only say how much); the raw
// counts follow as ordinary tiles.
//
// Extraction rate is the only value with a natural 0-100 scale, so it is the
// only one that earns a meter. K/D is unbounded -- a track for it would need
// an invented maximum, and the fill would then encode that invention rather
// than the data.
//
// The meter is deliberately single-hue (accent fill over a lighter step of
// the same ramp). The obvious alternative -- one bar split into green
// "extracted" and red "died" segments -- fails CVD validation outright:
// #5FD38A vs #FF8A7A is deuteranope dE 2.7, far below even the 6-8
// secondary-encoding floor. A lone series carries no such requirement, which
// is what makes the single-hue meter legal by construction.

const fmt = value => (value == null || !Number.isFinite(Number(value)) ? '—' : Math.round(Number(value)).toLocaleString());

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? (numerator / denominator).toFixed(2) : null;
}

function percent(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
    ? Math.round((numerator / denominator) * 100) : null;
}

// role="img" + aria-label rather than a bare styled div: the fill is a
// graphic, and its width is the only thing carrying the value visually.
function meter(label, value, detail) {
  const known = value != null;
  const width = known ? Math.max(0, Math.min(100, value)) : 0;
  return `<div class="lifetime-meter">
    <div class="lifetime-meter__head"><span class="lifetime-meter__label">${esc(label)}</span><strong class="lifetime-meter__value">${known ? `${value}%` : '—'}</strong></div>
    <div class="lifetime-meter__track" role="img" aria-label="${esc(label)}: ${known ? `${value} percent` : 'unavailable'}"><span class="lifetime-meter__fill" style="width:${width}%"></span></div>
    <p class="lifetime-meter__detail">${esc(detail)}</p>
  </div>`;
}

export function lifetimeSummaryHtml(player) {
  const stats = player || {};
  if (!Object.keys(stats).length) return emptyStateHtml('No lifetime statistics recorded yet');
  const kills = Number(stats.kills);
  const deaths = Number(stats.deaths);
  const extractions = Number(stats.extractions);
  const runs = (Number.isFinite(extractions) ? extractions : 0) + (Number.isFinite(deaths) ? deaths : 0);
  const kd = ratio(kills, deaths);
  const extractionRate = percent(extractions, runs);
  const items = [
    { label: 'Deaths', value: fmt(stats.deaths), detail: 'Runs that ended in death' },
    { label: 'Downed', value: fmt(stats.downed), detail: 'Times downed without dying' },
    { label: 'Extractions', value: fmt(stats.extractions), detail: 'Runs you got out of' },
    { label: 'Attacks', value: fmt(stats.attacks), detail: 'Attacks landed' },
    { label: 'Total XP', value: fmt(stats.xp), detail: 'Earned across every character' }
  ];
  return `<div class="lifetime">
    <div class="lifetime-lead">
      <div class="lifetime-hero">
        <span class="lifetime-hero__label">Kills</span>
        <strong class="lifetime-hero__value">${esc(fmt(stats.kills))}</strong>
        <span class="lifetime-hero__detail">Lifetime confirmed kills</span>
      </div>
      <div class="lifetime-ratio">
        <span class="lifetime-ratio__label">K/D</span>
        <strong class="lifetime-ratio__value">${esc(kd == null ? '—' : kd)}</strong>
        <span class="lifetime-ratio__detail">${kd == null ? 'Needs at least one death' : `${esc(fmt(kills))} kills · ${esc(fmt(deaths))} deaths`}</span>
      </div>
      ${meter('Extraction rate', extractionRate, extractionRate == null
        ? 'Needs at least one extraction or death'
        : `${fmt(extractions)} of ${fmt(runs)} runs`)}
    </div>
    ${metricGrid({ className: 'lifetime-kpis', ariaLabel: 'Lifetime player statistics', items })}
  </div>`;
}
