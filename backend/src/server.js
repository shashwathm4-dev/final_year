/**
 * Express Server Entry Point
 * AI Physiotherapy Assistant — Phase I Backend
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const verifyRoute = require('./routes/verify');
const sessionRoute = require('./routes/session');
const usersRoute = require('./routes/users');
const exercisesRoute = require('./routes/exercises');
const assignmentsRoute = require('./routes/assignments');
const privacyRoute = require('./routes/privacy');
const { globalLimiter } = require('./middleware/rateLimits');
const analyticsRoute = require('./routes/analytics');
const commentsRoute = require('./routes/comments');
const clinicsRoute = require('./routes/clinics');
const programsRoute = require('./routes/programs');
const reportsRoute = require('./routes/reports');
const insightsRoute = require('./routes/insights');
const modelsRoute = require('./routes/models');
const agentRoute = require('./routes/agent');


const app = express();
const PORT = process.env.PORT || 3001;

// Behind a proxy/load balancer set TRUST_PROXY=1 so rate limits see the real client IP
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

// Middleware
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));

// Only /api/verify-rep carries a camera frame; every other route gets a small body limit
const bigJson = express.json({ limit: '5mb' });
const smallJson = express.json({ limit: '100kb' });
app.use((req, res, next) => (req.path === '/api/verify-rep' ? bigJson(req, res, next) : smallJson(req, res, next)));
app.use(express.urlencoded({ limit: '100kb', extended: true }));

// Broad per-IP guard on the whole API
app.use('/api', globalLimiter);

// Routes
app.use('/api', verifyRoute);
app.use('/api', sessionRoute);
app.use('/api/users', usersRoute);
app.use('/api/exercises', exercisesRoute);
app.use('/api/assignments', assignmentsRoute);
app.use('/api/privacy', privacyRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/comments', commentsRoute);
app.use('/api/clinics', clinicsRoute);
app.use('/api/programs', programsRoute);
app.use('/api/reports', reportsRoute);
app.use('/api/insights', insightsRoute);
app.use('/api/models', modelsRoute);
app.use('/api/agent', agentRoute);



// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Physiotherapy Assistant Backend',
    timestamp: new Date().toISOString(),
    env: {
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      firebaseConfigured: !!process.env.FIREBASE_PROJECT_ID,
    },
  });
});

// Serve frontend static files if built (e.g. single-container Docker / Render deployment)
const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

// For all non-API GET routes, fall back to index.html for SPA routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(publicPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) next();
  });
});

// JSON-friendly error handler (body too large, malformed JSON, unexpected errors)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  console.error('[Unhandled error]', err);
  res.status(500).json({ error: 'Server error' });
});

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  // Auto-seed mock data on startup (idempotent — skips if already seeded)
  try {
    const { seedData } = require('./scripts/seed');
    seedData();
  } catch (err) {
    console.warn('[Server] Auto-seed skipped:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`
  ======================================================
  🚀 AI Physiotherapy Assistant Backend Running!
  ------------------------------------------------------
  📡 Server listening on: http://localhost:${PORT}
  🏥 Health check endpoint: http://localhost:${PORT}/api/health
  🤖 Gemini API configured: ${process.env.GEMINI_API_KEY ? 'YES ✓' : 'NO (Set GEMINI_API_KEY in .env)'}
  🔥 Session Logging:     ${require('./config/firebase').db ? 'Firebase Firestore ✓' : 'Local In-Memory Mode ✓'}
  ======================================================
  `);
  });
}

module.exports = app;
