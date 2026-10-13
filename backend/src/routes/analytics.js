/**
 * Analytics routes — Items 21-22.
 * GET /api/analytics/adherence        (doctor only)
 * GET /api/analytics/patient/:pid/trends (doctor or patient)
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canDoctorAccessPatient } = require('../services/access');
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
    const allowed = await canDoctorAccessPatient(req.user.uid, req.params.patientId);
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
      const allowed = await canDoctorAccessPatient(req.user.uid, pid);
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
    const allowed = await canDoctorAccessPatient(req.user.uid, req.params.patientId);
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
    const allowed = await canDoctorAccessPatient(req.user.uid, req.params.patientId);
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

// Real-Time ML & Data Mining Endpoints
const {
  getSyntheticMiningTelemetry,
  getClinicDataMining,
  forecastLinearTrend,
  detectAnomalies,
} = require('../services/mlMiningService');

// 1. Patient-level ML & Data Mining Analytics (accessible by doctor or the patient)
router.get('/ml-mining/patient/:patientId', requireAuth, async (req, res) => {
  try {
    const { patientId } = req.params;
    // Patient can view their own, doctor can view assigned patient
    if (req.user.uid !== patientId) {
      const allowed = await canDoctorAccessPatient(req.user.uid, patientId);
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    }

    const sessions = await getSessionsByPatient(patientId);
    let result = getSyntheticMiningTelemetry(patientId, req.user.uid);

    // If real sessions exist, augment and run real-time regression & anomaly detection
    if (sessions && sessions.length >= 2) {
      const sorted = [...sessions].sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
      const roms = sorted.map((s) => s.avgPeakAngle || s.peakAngle || (70 + (s.correctReps || 5) * 4));
      const accs = sorted.map((s) => s.totalReps > 0 ? Math.round(((s.correctReps || 0) / s.totalReps) * 100) : 75);
      
      const realRomForecast = forecastLinearTrend(roms, 5);
      const realAccForecast = forecastLinearTrend(accs, 5);
      const realAnomalies = detectAnomalies(roms);

      result.realTimeMetrics.romHistorical = roms;
      result.realTimeMetrics.romForecast = realRomForecast;
      result.realTimeMetrics.accuracyHistorical = accs;
      result.realTimeMetrics.accuracyForecast = realAccForecast;
      result.realTimeMetrics.anomalies = realAnomalies;
    }

    return res.json(result);
  } catch (err) {
    console.error('Error generating patient ML analytics:', err);
    return res.status(500).json({ error: 'Failed to generate patient ML analytics' });
  }
});

// 2. Doctor-level ML & Data Mining Analytics (Cohorts, Clustering & Performance)
router.get('/ml-mining/doctor', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const patients = await getPatientsForDoctor(req.user.uid);
    const clinicMining = getClinicDataMining(patients, 1);
    const telemetry = getSyntheticMiningTelemetry(null, req.user.uid);

    return res.json({
      doctorUid: req.user.uid,
      generatedAt: new Date().toISOString(),
      miningInsights: clinicMining,
      realTimeTelemetry: telemetry,
    });
  } catch (err) {
    console.error('Error generating doctor ML analytics:', err);
    return res.status(500).json({ error: 'Failed to generate doctor ML analytics' });
  }
});

// 3. Clinic-level ML & Data Mining Analytics
router.get('/ml-mining/clinic', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const patients = await getPatientsForDoctor(req.user.uid);
    const clinicMining = getClinicDataMining(patients, 4);

    return res.json({
      clinicId: req.user.clinicId || 'clinic_main',
      generatedAt: new Date().toISOString(),
      ...clinicMining,
    });
  } catch (err) {
    console.error('Error generating clinic ML analytics:', err);
    return res.status(500).json({ error: 'Failed to generate clinic ML analytics' });
  }
});

module.exports = router;
