/**
 * Insights routes: Personalization and Risk Analysis
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  getPersonalization,
  getExerciseById,
  getSessionsByPatient,
  getUserProfile,
} = require('../services/firestore');
const { buildAdaptedParams } = require('../services/personalization');
const { analyzeTrend } = require('../services/riskAnalysis');
let defaultExercises;
try {
  defaultExercises = require('../config/exercises.json');
} catch {
  defaultExercises = require('../../../frontend/src/config/exercises.json');
}

async function resolveExercise(exerciseId) {
  let exercise = null;
  try {
    exercise = await getExerciseById(exerciseId);
  } catch (_) {}
  if (!exercise && defaultExercises[exerciseId]) {
    exercise = defaultExercises[exerciseId];
  }
  return exercise;
}

// 29 – Personalized difficulty for current user + exercise
router.get('/personalization/:exerciseId', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { exerciseId } = req.params;
    const exercise = await resolveExercise(exerciseId);
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }

    const profile = await getPersonalization(uid, exerciseId);
    const adapted = buildAdaptedParams(profile, exercise);
    res.json({ profile, adapted });
  } catch (err) {
    console.error('Error fetching personalization insight:', err);
    res.status(500).json({ error: 'Failed to fetch personalization insight' });
  }
});

// 30 – Risk analysis across exercises for current user (patient)
router.get('/risk/me', requireAuth, async (req, res) => {
  try {
    const sessions = await getSessionsByPatient(req.user.uid);
    const completed = sessions.filter((s) => s.status === 'completed');
    const byExercise = {};
    for (const s of completed) {
      if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
      byExercise[s.exerciseId].push(s);
    }

    const results = [];
    for (const [exerciseId, exSessions] of Object.entries(byExercise)) {
      exSessions.sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
      const exercise = await resolveExercise(exerciseId);
      const analysis = analyzeTrend(exSessions, exercise);
      results.push({ exerciseId, ...analysis });
    }

    res.json({ results });
  } catch (err) {
    console.error('Error computing risk analysis for me:', err);
    res.status(500).json({ error: 'Failed to compute risk analysis' });
  }
});

// 30 – Risk analysis for a patient (doctor only)
router.get('/risk/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId } = req.params;
    const patientProfile = await getUserProfile(patientId);
    if (!patientProfile || patientProfile.doctorId !== req.user.uid) {
      return res.status(403).json({ error: 'Forbidden: you are not this patient\'s assigned doctor' });
    }

    const sessions = await getSessionsByPatient(patientId);
    const completed = sessions.filter((s) => s.status === 'completed');
    const byExercise = {};
    for (const s of completed) {
      if (!byExercise[s.exerciseId]) byExercise[s.exerciseId] = [];
      byExercise[s.exerciseId].push(s);
    }

    const results = [];
    for (const [exerciseId, exSessions] of Object.entries(byExercise)) {
      exSessions.sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
      const exercise = await resolveExercise(exerciseId);
      const analysis = analyzeTrend(exSessions, exercise);
      results.push({ exerciseId, ...analysis });
    }

    res.json({ results });
  } catch (err) {
    console.error('Error computing patient risk analysis for doctor:', err);
    res.status(500).json({ error: 'Failed to compute patient risk analysis' });
  }
});

module.exports = router;
