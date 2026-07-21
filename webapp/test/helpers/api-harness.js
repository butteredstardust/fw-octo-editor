'use strict';
const express = require('express');
const crypto = require('crypto');
const { isGameRunning: realIsGameRunning } = require('../../utils/processCheck');
const apiRoutes = require('../../routes/api');
const pagesRoutes = require('../../routes/pages');

// Builds a real Express app that mounts the actual API router with the same
// security middleware as server.js (loopback host check, security headers,
// CSRF/origin gate, game-closed gate). The DB key and game-state checks are
// injected so route tests do not need the real key file or a live process.
function createTestApiServer({ dbKey = 'test-key-0123456789abcdef test-key', gameRunning = false } = {}) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  let gameState = gameRunning;
  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    const host = String(req.headers.host || '').toLowerCase();
    if (!/^((127\.0\.0\.1)|(localhost))(\:\d+)?$/.test(host)) return res.status(403).json({ error: 'Invalid Host' });
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'"
    });
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.locals.dbKey = dbKey;
  app.locals.isGameRunning = async () => gameState;

  app.get('/api/session', (req, res) => res.json({ csrfToken }));
  app.use('/api', async (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return res.status(403).json({ error: 'Cross-origin mutation rejected' });
    if (req.headers['x-csrf-token'] !== csrfToken) return res.status(403).json({ error: 'Missing or invalid CSRF token' });
    if (await gameState) return res.status(409).json({ error: 'The Forever Winter is running' });
    next();
  });
  app.use('/api', apiRoutes);
  app.use(pagesRoutes);

  app.csrfToken = csrfToken;
  app.setGameRunning = flag => { gameState = flag; };
  return app;
}

module.exports = { createTestApiServer, realIsGameRunning };
