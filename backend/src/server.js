/**
 * Express Server Entry Point
 * AI Physiotherapy Assistant — Phase I Backend
 */
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const verifyRoute = require('./routes/verify');
const sessionRoute = require('./routes/session');
const usersRoute = require('./routes/users');
const exercisesRoute = require('./routes/exercises');
const assignmentsRoute = require('./routes/assignments');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// 10mb limit for base64 camera frame payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Routes
app.use('/api', verifyRoute);
app.use('/api', sessionRoute);
app.use('/api/users', usersRoute);
app.use('/api/exercises', exercisesRoute);
app.use('/api/assignments', assignmentsRoute);


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

// Start server
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
