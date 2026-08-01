// Normalizes the two shapes /api/status and /api/diagnostics both use for
// "is the game running": either a list of matched processes, or a plain
// boolean/falsy sentinel when process detection itself is unavailable.
// Every call site must use this -- a raw truthiness check on an empty array
// is always true (`![]` is false), which previously let the Backups page
// claim writes were disabled while the header said otherwise.
export function isGameRunning(status) {
  const value = status && status.gameRunning;
  return Array.isArray(value) ? value.length > 0 : !!value;
}

// A single place to turn a possibly-missing/unparseable timestamp into
// either a real localized string or a clear, non-alarming fallback --
// `new Date(undefined).toLocaleString()` renders the literal text
// "Invalid Date", which reads as a bug rather than "this hasn't run yet".
export function formatTimestamp(value, fallback = 'Not run yet') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}
