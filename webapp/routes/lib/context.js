const config = require('../../services/configService');
const mutationService = require('../../services/mutationService');

// Resolve the active DB key for a request: a user-supplied override (persisted
// in configService, decrypted on demand) takes precedence over the boot-time
// bundled key. Checked per-request so a key change takes effect without a
// restart. The key is never logged.
function resolveKey(req) {
  return config.getActiveKeyOverride() || req.app.locals.dbKey;
}

async function runMutation(req, label, callback) {
  return mutationService.mutate(resolveKey(req), label, callback);
}

module.exports = { resolveKey, runMutation };
