export function normalizeSearch(value) {
  return String(value == null ? '' : value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchTokens(value) {
  return normalizeSearch(value).split(/\s+/).filter(Boolean);
}

export function searchScore(query, fields) {
  const tokens = searchTokens(query);
  if (!tokens.length) return 1;
  const normalized = fields.map(normalizeSearch);
  const combined = normalized.join(' ');
  if (!tokens.every(token => combined.includes(token))) return -1;
  const primary = normalized[0] || '';
  const secondary = normalized[1] || '';
  let score = 0;
  for (const token of tokens) {
    if (primary.startsWith(token)) score += 100;
    else if (primary.includes(token)) score += 70;
    else if (secondary.startsWith(token)) score += 45;
    else if (secondary.includes(token)) score += 30;
    else score += 10;
  }
  return score;
}

export function filterAndRank(rows, query, fieldsForRow) {
  return rows.map((row, index) => ({ row, index, score: searchScore(query, fieldsForRow(row)) }))
    .filter(result => result.score >= 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(result => result.row);
}

export function cleanFallbackName(id) {
  const cleaned = String(id || '')
    .replace(/^(?:Inventory\.(?:Item|Weapon)\.|Scope\.Weapon\.)/i, '')
    .replace(/_Broken$/i, ' (Destroyed)')
    .replace(/[._-]+/g, ' ')
    .replace(/\b(\w)/g, letter => letter.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Unknown item';
}

export function debounce(fn, wait) {
  let timer;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function resetFilterControls(defaults, { focusId, root = globalThis.document } = {}) {
  if (!root || typeof root.getElementById !== 'function') return;
  for (const [id, value] of Object.entries(defaults || {})) {
    const control = root.getElementById(id);
    if (!control) continue;
    if (typeof value === 'boolean') control.checked = value;
    else control.value = value;
  }
  if (focusId) root.getElementById(focusId)?.focus();
}

export function receiptSummary(result) {
  if (!result) return '';
  const parts = [];
  if (result.operationId) parts.push(`Operation ${result.operationId}`);
  if (result.backupId) parts.push(`Backup ${result.backupId}`);
  if (result.afterIntegrity) parts.push(`Integrity ${result.afterIntegrity.passed ? 'passed' : 'failed'}`);
  if (result.afterFk) parts.push(`Foreign keys ${result.afterFk.passed ? 'passed' : 'failed'}`);
  if (result.rollbackStatus) {
    const rs = result.rollbackStatus;
    const label = rs.attempted
      ? (rs.succeeded ? 'rolled back' : `rollback failed${rs.error ? ` (${rs.error})` : ''}`)
      : 'not rolled back';
    parts.push(`Rollback ${label}`);
  }
  return parts.join(' · ');
}

export function validateInteger(value, label, options) {
  const settings = options || {};
  const min = settings.min == null ? Number.MIN_SAFE_INTEGER : settings.min;
  const max = settings.max == null ? Number.MAX_SAFE_INTEGER : settings.max;
  const name = label || 'Value';
  if (value === '' || value == null) throw new Error(`${name} is required.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${name} must be a whole number.`);
  if (number < min || number > max) throw new Error(`${name} must be between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
  return number;
}

export function readIntegerInput(input, label, options) {
  if (!input) throw new Error(`${label || 'Value'} input is unavailable.`);
  try {
    const value = validateInteger(input.value, label, options);
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    return value;
  } catch (error) {
    error.code = 'validation';
    input.setCustomValidity(error.message);
    input.setAttribute('aria-invalid', 'true');
    if (typeof input.reportValidity === 'function') input.reportValidity();
    throw error;
  }
}
