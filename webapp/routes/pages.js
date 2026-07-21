const express = require('express');
const path = require('path');
const router = express.Router();

// SPA fallback: serve index.html for any GET that isn't an API route and isn't
// a static asset. Unknown /api/* paths fall through to the 404 handler below so
// the client gets JSON (not HTML) on API errors.
router.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// API 404 for unmatched /api routes (so fetch().json() doesn't get HTML).
router.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

module.exports = router;
