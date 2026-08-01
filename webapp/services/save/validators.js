// ---- Input validation for SQL interpolation -------------------------------
// Every write in the save/* modules builds SQL by interpolation. The frontend
// coerces inputs, but we re-validate server-side so a bad/missing value can
// never reach the SQLite shell as a literal (e.g. `SET Value = NaN`).

// Coerce to a finite number (integer-friendly). Throws if not a valid number.
function toNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw Object.assign(new Error(`Invalid ${label || 'number'}: expected a finite number, got ${JSON.stringify(value)}`), { status: 400 });
  }
  return n;
}

function toInteger(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = toNumber(value, label);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw Object.assign(new Error(`Invalid ${label || 'integer'}: expected an integer from ${min} to ${max}`), { status: 400 });
  }
  return number;
}

function requireChangedRows(raw, expected, label) {
  const actual = Number.parseInt(String(raw || ''), 10);
  if (actual !== expected) throw Object.assign(new Error(`${label} changed ${actual} rows; expected ${expected}`), { status: 422 });
  return actual;
}

// Escape a single-quoted SQL string literal and reject embedded NULs. SQLite
// strings use '' doubling; this also blocks control characters that could
// break the shell command we pipe in.
function sqlStr(value, label) {
  if (typeof value !== 'string') {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: expected text, got ${typeof value}`), { status: 400 });
  }
  if (value.includes('\0')) {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: contains a NUL character, which is not allowed`), { status: 400 });
  }
  if (value.includes('\n') || value.includes('\r')) {
    throw Object.assign(new Error(`Invalid ${label || 'string'}: contains a newline character, which is not allowed`), { status: 400 });
  }
  return value.replace(/'/g, "''");
}

module.exports = {
  toNumber,
  toInteger,
  requireChangedRows,
  sqlStr
};
