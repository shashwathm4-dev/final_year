/**
 * Session & rep logging. Every route requires login. Writes require session ownership.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  createSession, logRep, endSession, getSession, getSessionsByPatient, getUserProfile,
} = require('../services/firestore');

async function loadOwnedSession(req, res) {
  const { sessionId } = req.body;
  if (!sessionId) {
    res.status(400).json({ error: 'Missing required field: sessionId' });
    return null;
  }
  const session = await getSession(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  if (session.patientId !== req.user.uid) {
    res.status(403).json({ error: 'Forbidden: not your session' });
    return null;
  }
  return session;
}

router.post('/session/start', requireAuth, async (req, res) => {
  try {
    const exerciseId = typeof req.body.exerciseId === 'string' ? req.body.exerciseId : 'unknown';
    const sessionId = await createSession(exerciseId, req.user.uid);
    res.json({ sessionId });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

router.post('/session/log-rep', requireAuth, async (req, res) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    const b = req.body;
    if (b.repNumber == null) {
      return res.status(400).json({ error: 'Missing required field: repNumber' });
    }
    await logRep(b.sessionId, {
      exerciseId: b.exerciseId,
      repNumber: b.repNumber,
      timestamp: b.timestamp,
      angles: b.angles,
      verdictSource: b.verdictSource,
      skipReason: b.skipReason,       // item 3
      correct: b.correct,
      issue: b.issue,
      severity: b.severity,
      tempoScore: b.tempoScore,
      smoothnessScore: b.smoothnessScore,
      romScore: b.romScore,
      qualityScore: b.qualityScore,
      side: b.side,
      mode: b.mode,
      holdSeconds: b.holdSeconds,
      breaks: b.breaks,
      compensations: Array.isArray(b.compensations) ? b.compensations : [],
      calibrationScale: b.calibrationScale,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging rep:', err);
    res.status(500).json({ error: 'Failed to log rep' });
  }
});

router.post('/session/end', requireAuth, async (req, res) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    // Prefer server-side counts from stored reps; fall back to client numbers.
    const reps = Array.isArray(session.reps) ? session.reps : [];
    const totalReps = reps.length || Math.max(0, parseInt(req.body.totalReps, 10) || 0);
    const correctReps = reps.length
      ? reps.filter((r) => r.correct === true).length
      : Math.max(0, parseInt(req.body.correctReps, 10) || 0);
    await endSession(req.body.sessionId, { totalReps, correctReps });
    res.json({ success: true });
  } catch (err) {
    console.error('Error ending session:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

const handleGetMySessions = async (req, res) => {
  try {
    const sessions = await getSessionsByPatient(req.user.uid);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching patient sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};
router.get('/sessions/my', requireAuth, handleGetMySessions);
router.get('/session/my', requireAuth, handleGetMySessions);

// Doctor may only read sessions of patients linked to them
router.get('/sessions/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const patient = await getUserProfile(req.params.patientId);
    if (!patient || patient.doctorId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: this patient is not assigned to you' });
    }
    const sessions = await getSessionsByPatient(req.params.patientId);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching patient sessions for doctor:', err);
    res.status(500).json({ error: 'Failed to fetch patient sessions' });
  }
});

// NOTE: keep this AFTER /session/my so "my" is not treated as an id
router.get('/session/:id', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.patientId !== req.user.uid) {
      const patient = session.patientId ? await getUserProfile(session.patientId) : null;
      if (!patient || patient.doctorId !== req.user.uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json(session);
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

module.exports = router;
