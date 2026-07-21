const express = require('express');
const path = require('path');
const { loadKey } = require('./utils/keyLoader');
const config = require('./services/configService');
const apiRoutes = require('./routes/api');
const pagesRoutes = require('./routes/pages');
const crypto = require('crypto');
const { isGameRunning } = require('./utils/processCheck');

const app = express();
const PORT = 3000;
const csrfToken = crypto.randomBytes(32).toString('base64url');
let mutationActive = false;

app.disable('x-powered-by');
app.use((req, res, next) => {
  const host = String(req.headers.host || '').toLowerCase();
  if (!/^((127\.0\.0\.1)|(localhost))(\:\d+)?$/.test(host)) return res.status(403).json({ error: 'Invalid Host' });
  res.set({ 'X-Content-Type-Options':'nosniff', 'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'" });
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/session', (req,res) => res.json({ csrfToken }));
app.use('/api', async (req,res,next) => {
  if (!['POST','PUT','PATCH','DELETE'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return res.status(403).json({ error:'Cross-origin mutation rejected' });
  if (req.headers['x-csrf-token'] !== csrfToken) return res.status(403).json({ error:'Missing or invalid CSRF token' });
  if (mutationActive) return res.status(409).json({ error:'Another save operation is active' });
  if (await isGameRunning()) return res.status(409).json({ error:'The Forever Winter is running' });
  mutationActive = true; res.once('finish',()=>{ mutationActive=false; }); res.once('close',()=>{ mutationActive=false; }); next();
});

app.use('/api', apiRoutes);
app.use(pagesRoutes);

(async () => {
  try {
    // Load any persisted user overrides (save dir / optional DB key) first so
    // the rest of the app sees them.
    config.load();
    const key = await loadKey();
    app.locals.dbKey = key;
    // Bind to loopback only: this editor can overwrite the live game save,
    // so it must never be reachable from the network.
    app.listen(PORT, '127.0.0.1', () => {
      console.log(`Server running on http://127.0.0.1:${PORT} (loopback only)`);
    });
  } catch (err) {
    console.error('Failed to initialize:', err.message);
    process.exit(1);
  }
})();
