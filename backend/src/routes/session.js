/**
 * Express routes for session & rep logging
 * - POST /api/session/start
 * - POST /api/session/log-rep
 * - GET /api/session/:id
 * - GET /api/sessions/my
 * - GET /api/sessions/patient/:patientId
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { createSession, logRep, getSession, getSessionsByPatient } = require('../services/firestore');

// Start session — optional auth: if authenticated, saves patientId
router.post('/session/start', async (req, res) => {
  try {
    const { exerciseId } = req.body;
    let patientId = null;

    // Check if auth token provided
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split('Bearer ')[1].trim();
        const { admin } = require('../config/firebase');
        if (admin.apps && admin.apps.length > 0) {
          const decoded = await admin.auth().verifyIdToken(token);
          patientId = decoded.uid;
        } else {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            patientId = payload.user_id || payload.sub || null;
          }
        }
      } catch (authErr) {
        // Fall back to unauthenticated session
      }
    }

    const sessionId = await createSession(exerciseId || 'unknown', patientId);
    res.json({ sessionId });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

router.post('/session/log-rep', async (req, res) => {
  try {
    const {
      sessionId,
      exerciseId,
      repNumber,
      timestamp,
      angles,
      verdictSource,
      correct,
      issue,
      severity,
      tempoScore,
      smoothnessScore,
      romScore,
      qualityScore,
    } = req.body;

    if (!sessionId || repNumber == null) {
      return res.status(400).json({ error: 'Missing required fields: sessionId, repNumber' });
    }

    await logRep(sessionId, {
      exerciseId,
      repNumber,
      timestamp,
      angles,
      verdictSource,
      correct,
      issue,
      severity,
      tempoScore,
      smoothnessScore,
      romScore,
      qualityScore,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error logging rep:', err);
    res.status(500).json({ error: 'Failed to log rep' });
  }
});

// Patient gets their own sessions
router.get('/sessions/my', requireAuth, async (req, res) => {
  try {
    const sessions = await getSessionsByPatient(req.user.uid);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching patient sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// Doctor views specific patient's sessions
router.get('/sessions/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const sessions = await getSessionsByPatient(req.params.patientId);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching patient sessions for doctor:', err);
    res.status(500).json({ error: 'Failed to fetch patient sessions' });
  }
});

router.get('/session/:id', async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json(session);
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

module.exports = router;

