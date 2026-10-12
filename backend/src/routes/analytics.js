/**
 * Analytics routes — Items 21-22.
 * GET /api/analytics/adherence        (doctor only)
 * GET /api/analytics/patient/:pid/trends (doctor or patient)
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canViewPatient } = require('../services/access');
const { computePatientAdherence, computeTrends } = require('../services/analytics');
const {
  getPatientsForDoctor,
  getSessionsByPatient,
  getAssignmentsByDoctor,
} = require('../services/firestore');

// 21 – Adherence dashboard
router.get('/adherence', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const patients = await getPatientsForDoctor(req.user.uid);
    const assignments = await getAssignmentsByDoctor(req.user.uid);

    // Fetch sessions for every patient (parallelised)
    const sessionsByPatient = await Promise.all(
      patients.map((p) => getSessionsByPatient(p.uid))
    );
    const allSessions = sessionsByPatient.flat();

    const adherence = computePatientAdherence(patients, allSessions, assignments);
    res.json({ adherence });
  } catch (err) {
    console.error('Error computing adherence:', err);
    res.status(500).json({ error: 'Failed to compute adherence data' });
  }
});

// 22 – Patient trend analytics
router.get('/patient/:patientId/trends', requireAuth, async (req, res) => {
  try {
    const allowed = await canViewPatient(req.user, req.params.patientId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const sessions = await getSessionsByPatient(req.params.patientId);
    const trends = computeTrends(sessions);
    res.json(trends);
  } catch (err) {
    console.error('Error computing trends:', err);
    res.status(500).json({ error: 'Failed to compute trend analytics' });
  }
});

// 29 – Personalized difficulty for a given patient+exercise
router.get('/patient/:patientId/difficulty/:exerciseId', requireAuth, async (req, res) => {
  try {
    // Patient can fetch their own; doctor can fetch for their patient
    const uid = req.user.uid;
    const pid = req.params.patientId;
    if (uid !== pid) {
      const allowed = await canViewPatient(req.user, pid);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    }
    const { getPersonalization, getExerciseById } = require('../services/firestore');
    const { buildAdaptedParams } = require('../services/personalization');
    const profile = await getPersonalization(pid, req.params.exerciseId);
    const exercise = await getExerciseById(req.params.exerciseId);
    const params = buildAdaptedParams(profile, exercise);
    res.json({ ...params, source: 'rule-based' });
  } catch (err) {
    console.error('Error computing difficulty:', err);
    res.status(500).json({ error: 'Failed to compute difficulty' });
  }
});

// 30 – Risk analysis for a given patient+exercise
router.get('/patient/:patientId/risk/:exerciseId', requireAuth, async (req, res) => {
  try {
    const allowed = await canViewPatient(req.user, req.params.patientId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { analyzeTrend } = require('../services/riskAnalysis');
    const { getExerciseById } = require('../services/firestore');
    const sessions = await getSessionsByPatient(req.params.patientId);
    const exercise = await getExerciseById(req.params.exerciseId);
    const sameEx = sessions
      .filter((s) => s.exerciseId === req.params.exerciseId && s.status === 'completed')
      .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
    const risk = analyzeTrend(sameEx, exercise);
    res.json(risk);
  } catch (err) {
    console.error('Error computing risk:', err);
    res.status(500).json({ error: 'Failed to compute risk analysis' });
  }
});

// 30 – All risk flags across all exercises for a patient (doctor dashboard)
router.get('/patient/:patientId/risk', requireAuth, async (req, res) => {
  try {
    const allowed = await canViewPatient(req.user, req.params.patientId);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { analyzeTrend } = require('../services/riskAnalysis');
    const sessions = await getSessionsByPatient(req.params.patientId);
    const completed = sessions.filter((s) => s.status === 'completed');
    const byExercise = {};
    for (const s of completed) {
      if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
      byExercise[s.exerciseId].push(s);
    }
    const allFlags = [];
    for (const [exId, exSessions] of Object.entries(byExercise)) {
      exSessions.sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
      const result = analyzeTrend(exSessions);
      if (result.flags.length > 0) {
        result.flags.forEach((f) => allFlags.push({ ...f, exerciseId: exId }));
      }
    }
    res.json({ flags: allFlags });
  } catch (err) {
    console.error('Error computing risk overview:', err);
    res.status(500).json({ error: 'Failed to compute risk overview' });
  }
});

module.exports = router;
