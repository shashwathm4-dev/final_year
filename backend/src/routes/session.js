/**
 * Session & rep logging. Every route requires login. Writes require session ownership.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const validate = require('../middleware/validate');
const { logRepLimiter, writeLimiter } = require('../middleware/rateLimits');
const { sessionStartSchema, logRepSchema, sessionEndSchema } = require('../validation/schemas');
const {
  createSession, logRep, endSession, getSession, getSessionsByPatient, getUserProfile, saveSessionCoaching,
} = require('../services/firestore');
const { getSessionAccess, canDoctorAccessPatient } = require('../services/access');
const { applyProgression } = require('../services/progression');
const { savePlayback, getPlayback } = require('../services/entities');
const { summarizeSession } = require('../services/sessionMetrics');
const { generateCoachingSummary } = require('../services/coaching');
const { updateProfileFromSession } = require('../services/personalization');
const { analyzeTrend } = require('../services/riskAnalysis');

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

router.post('/session/start', writeLimiter, validate(sessionStartSchema), async (req, res) => {
  try {
    const exerciseId = typeof req.body.exerciseId === 'string' ? req.body.exerciseId : 'unknown';
    const { clientSessionId, startedAt, difficulty } = req.body;
    const sessionId = await createSession(exerciseId, req.user?.uid || null, {
      clientSessionId,
      startedAt,
      difficulty,
    });
    res.json({ sessionId });
  } catch (err) {
    console.error('Error starting session:', err);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

router.post('/session/log-rep', requireAuth, logRepLimiter, validate(logRepSchema), async (req, res) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    const b = req.body;
    if (b.repNumber == null) {
      return res.status(400).json({ error: 'Missing required field: repNumber' });
    }

    // Whitelist verdictSource: local|vlm|model|skipped|offline|error
    const allowedSources = ['local', 'vlm', 'model', 'skipped', 'offline', 'error', 'checkpoint_only', 'checkpoint_fail', 'hold_check'];
    const verdictSource = allowedSources.includes(b.verdictSource) ? b.verdictSource : 'local';

    const curve = Array.isArray(b.curve) && b.curve.length <= 32 && b.curve.every((n) => Number.isFinite(n))
      ? b.curve
      : null;
    const peakAngle = Number.isFinite(b.peakAngle) ? b.peakAngle : null;
    const durationMs = Number.isFinite(b.durationMs) ? b.durationMs : null;
    const modelProb = typeof b.modelProb === 'number' && Number.isFinite(b.modelProb) ? b.modelProb : null;

    await logRep(b.sessionId, {
      exerciseId: b.exerciseId,
      repNumber: b.repNumber,
      timestamp: b.timestamp,
      angles: b.angles,
      verdictSource,
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
      peakAngle,
      durationMs,
      curve,
      modelProb,
      checkpointDeltas: b.checkpointDeltas,
      failedCheckpoints: b.failedCheckpoints,
      hasPlayback: b.hasPlayback,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Error logging rep:', err);
    res.status(500).json({ error: 'Failed to log rep' });
  }
});

router.post('/session/end', requireAuth, writeLimiter, validate(sessionEndSchema), async (req, res) => {
  try {
    const session = await loadOwnedSession(req, res);
    if (!session) return;
    // Prefer server-side counts from stored reps; fall back to client numbers.
    const reps = Array.isArray(session.reps) ? session.reps : [];
    const totalReps = reps.length || Math.max(0, parseInt(req.body.totalReps, 10) || 0);
    const correctReps = reps.length
      ? reps.filter((r) => r.correct === true).length
      : Math.max(0, parseInt(req.body.correctReps, 10) || 0);
    const summary = summarizeSession(session);
    await endSession(req.body.sessionId, { totalReps, correctReps, summary });

    // 28 – Coaching summary
    let coaching = null;
    try {
      const exerciseName = session.exerciseId;
      // Compute previous-session deltas for coaching context
      const allSessions = await getSessionsByPatient(req.user.uid);
      const sameExSessions = allSessions
        .filter((s) => s.exerciseId === session.exerciseId && s.id !== req.body.sessionId && s.status === 'completed')
        .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
      let previousDeltas = null;
      if (sameExSessions.length > 0) {
        const prev = sameExSessions[0];
        const prevSummary = prev.summary || {};
        previousDeltas = {
          accuracy: (summary.accuracy || 0) - (prevSummary.accuracy || 0),
          avgQuality: (summary.avgQuality || 0) - (prevSummary.avgQuality || 0),
        };
      }

      // Risk flags for coaching prompt context
      let riskFlags = [];
      try {
        const trend = analyzeTrend(
          sameExSessions.concat(finalized || session).sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0))
        );
        riskFlags = trend.flags || [];
      } catch (_) { /* non-fatal */ }

      coaching = await generateCoachingSummary({
        session: finalized || session,
        summary,
        exerciseName,
        riskFlags,
        previousDeltas,
        uid: req.user.uid,
      });

      // Persist coaching on the session document
      const { saveSessionCoaching } = require('../services/firestore');
      await saveSessionCoaching(req.body.sessionId, coaching);
    } catch (cErr) {
      console.warn('[coaching] failed:', cErr.message);
    }

    // 29 – Personalized difficulty
    let difficulty = null;
    try {
      const profile = await updateProfileFromSession(req.user.uid, finalized || session, summary);
      if (profile) {
        difficulty = {
          thresholdScale: profile.thresholdScale,
          workingTargetPeak: profile.workingTargetPeak,
          sessions: profile.sessions,
          adaptive: (profile.sessions || 0) >= 2,
          source: 'rule-based',
        };
      }
    } catch (dErr) {
      console.warn('[personalization] failed:', dErr.message);
    }

    // 30 – Risk flags
    let risk = null;
    try {
      const allSessions = await getSessionsByPatient(req.user.uid);
      const sameExSessions = allSessions
        .filter((s) => s.exerciseId === session.exerciseId && s.status === 'completed')
        .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
      risk = analyzeTrend(sameExSessions);
    } catch (rErr) {
      console.warn('[risk] failed:', rErr.message);
    }

    res.json({ success: true, summary, progression, coaching, difficulty, risk });
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

router.get('/sessions/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const p = await getUserProfile(req.params.patientId);
    if (!p || p.doctorId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: not your patient' });
    }
    const sessions = await getSessionsByPatient(req.params.patientId);
    res.json({ sessions });
  } catch (err) {
    console.error('Error fetching patient sessions for doctor:', err);
    res.status(500).json({ error: 'Failed to fetch patient sessions' });
  }
});

// 28 – Fetch or generate coaching summary for a session
router.post('/session/:id/coaching', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    if (session.coaching && req.query.refresh !== '1') {
      return res.json(session.coaching);
    }

    const summary = session.summary || summarizeSession(session);
    const exerciseName = session.exerciseId;
    const patientId = session.patientId || req.user.uid;
    const allSessions = await getSessionsByPatient(patientId);
    const sameExSessions = allSessions
      .filter((s) => s.exerciseId === session.exerciseId && s.id !== req.params.id && s.status === 'completed')
      .sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

    let previousDeltas = null;
    if (sameExSessions.length > 0) {
      const prev = sameExSessions[0];
      const prevSummary = prev.summary || {};
      previousDeltas = {
        accuracy: (summary.accuracy || 0) - (prevSummary.accuracy || 0),
        avgQuality: (summary.avgQuality || 0) - (prevSummary.avgQuality || 0),
      };
    }

    let riskFlags = [];
    try {
      const trend = analyzeTrend(
        sameExSessions.concat(session).sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0))
      );
      riskFlags = trend.flags || [];
    } catch (_) {}

    const coaching = await generateCoachingSummary({
      session,
      summary,
      exerciseName,
      riskFlags,
      previousDeltas,
      uid: req.user.uid,
    });

    await saveSessionCoaching(req.params.id, coaching);
    res.json(coaching);
  } catch (err) {
    console.error('Error generating coaching summary:', err);
    res.status(500).json({ error: 'Failed to generate coaching summary' });
  }
});

// NOTE: keep this AFTER /session/my so "my" is not treated as an id
router.get('/session/:id', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });
    res.json(session);
  } catch (err) {
    console.error('Error getting session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// ---- Playback (Item 23) ----

router.post('/session/:id/playback/:repNumber', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.patientId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: not your session' });
    }
    const repNumber = parseInt(req.params.repNumber, 10);
    if (isNaN(repNumber)) return res.status(400).json({ error: 'Invalid rep number' });

    const docId = await savePlayback(req.params.id, repNumber, req.body);
    res.json({ success: true, docId });
  } catch (err) {
    console.error('Error saving playback:', err);
    res.status(500).json({ error: err.message || 'Failed to save playback' });
  }
});

router.get('/session/:id/playback/:repNumber', requireAuth, async (req, res) => {
  try {
    const session = await getSession(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const access = await getSessionAccess(req.user, session);
    if (!access) return res.status(403).json({ error: 'Forbidden' });

    const repNumber = parseInt(req.params.repNumber, 10);
    if (isNaN(repNumber)) return res.status(400).json({ error: 'Invalid rep number' });

    const playback = await getPlayback(req.params.id, repNumber);
    if (!playback) return res.status(404).json({ error: 'Playback not found' });
    res.json(playback);
  } catch (err) {
    console.error('Error fetching playback:', err);
    res.status(500).json({ error: 'Failed to fetch playback' });
  }
});

module.exports = router;

