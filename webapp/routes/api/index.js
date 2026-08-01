const express = require('express');
const router = express.Router();

// Domain routers. Route registration order across these files does not
// change any request's resolved handler: within the original monolithic
// routes/api.js, no two routes ever shared an HTTP method with an ambiguous
// literal-vs-:param path at the same position (verified route-by-route
// during the split into this directory), so grouping by domain here is
// behavior-preserving even though it doesn't replicate the original
// file's line order.
router.use(require('./settings'));
router.use(require('./status'));
router.use(require('./characters'));
router.use(require('./hub'));
router.use(require('./weapons'));
router.use(require('./inventory'));
router.use(require('./vendors'));
router.use(require('./quests'));
router.use(require('./backups'));

module.exports = router;
