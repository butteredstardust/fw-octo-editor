const { runMutation } = require('./context');

// Shared async route-handler wrapper. Almost every handler in this app is:
//   try { ...; res.json(data); }
//   catch (err) { res.status(err.status || 500).json({ error, operationId, backupId, rollbackStatus }); }
// `handle(fn)` captures that pattern so handlers only need to write their body.
//
// The error envelope is NOT uniform across the API (pre-existing, intentional
// inconsistencies from before this refactor), so this helper is configurable:
//   - onlyError: true    -> catch body is just `{ error: err.message }`
//   - defaultStatus: N   -> status fallback when err.status is unset (default 500)
// A handful of routes have envelopes this helper cannot express (custom fields
// derived from req rather than err, or a wholly different success/error shape,
// e.g. /health). Those are left hand-written in their route files rather than
// forced through this helper — see each file's comments.
function handle(fn, opts = {}) {
  const { onlyError = false, defaultStatus = 500 } = opts;
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (onlyError) {
        res.status(err.status || defaultStatus).json({ error: err.message });
      } else {
        res.status(err.status || defaultStatus).json({
          error: err.message,
          operationId: err.operationId || null,
          backupId: err.backupId || null,
          rollbackStatus: err.rollbackStatus || null
        });
      }
    }
  };
}

// Convenience variant for the common "run a mutation, return its receipt"
// shape: `const result = await runMutation(req, label, () => fn(req)); res.json(result);`
// wrapped in the same error handling as `handle()`.
function handleMutation(label, fn, opts) {
  return handle(async (req, res) => {
    const result = await runMutation(req, label, () => fn(req));
    res.json(result);
  }, opts);
}

module.exports = { handle, handleMutation };
