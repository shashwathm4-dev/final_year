/**
 * Express routes for session & rep logging
 * - POST /api/session/start
 * - POST /api/session/log-rep
 * - GET /api/session/:id
 */
const express = require('express');
const router = express.Router();
const { createSession, logRep, getSession } = require('../services/firestore');

router.post('/session/start', async (req, res) => {
  try {
    const { exerciseId } = req.body;
    const sessionId = await createSession(exerciseId || 'unknown');
    res.json({ sessionId });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

router.post('/session/log-rep', async (req, res) => {
  try {
    const { sessionId, exerciseId, repNumber, timestamp, angles, verdictSource, correct, issue, severity } = req.body;

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
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error logging rep:', err);
    res.status(500).json({ error: 'Failed to log rep' });
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
