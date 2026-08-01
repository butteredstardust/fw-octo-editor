import { esc } from './dom.mjs';

const TONES = new Set(['success', 'warning', 'danger', 'info', 'neutral']);

// Shared text-only status badge. Callers retain responsibility for mapping
// domain state to a visible label and semantic tone.
export function statusBadgeHtml(label, { tone = 'neutral', className = '' } = {}) {
  const safeTone = TONES.has(tone) ? tone : 'neutral';
  const legacyClasses = className ? ` ${esc(className)}` : '';
  return `<span class="status-badge status-badge--${safeTone}${legacyClasses}">${esc(label)}</span>`;
}
