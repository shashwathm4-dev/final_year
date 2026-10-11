const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const { verifyExerciseForm } = require('../services/gemini');
const { getExerciseById } = require('../services/firestore');
const defaultExercises = require('../../../frontend/src/config/exercises.json');

router.post('/verify-rep', requireAuth, async (req, res) => {
  try {
    const { patientFrame, referenceFrame, exerciseId } = req.body;
    if (!patientFrame) {
      return res.status(400).json({ error: 'Missing required field: patientFrame' });
    }

    // Built-ins come from the static file, custom exercises from Firestore
    const exercise =
      defaultExercises[exerciseId] || (await getExerciseById(exerciseId).catch(() => null));

    const exerciseName = (exercise && exercise.displayName) || exerciseId || 'Physiotherapy Exercise';
    const refFrame = referenceFrame || (exercise && exercise.referenceFrame) || null;

    console.log(`[POST /api/verify-rep] ${exerciseName} user=${req.user.uid} reference=${refFrame ? 'yes' : 'no'}`);

    const result = await verifyExerciseForm(patientFrame, refFrame, exerciseName, req.user.uid, exercise);
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/verify-rep:', err);
    return res.status(500).json({
      correct: null, issue: 'Server error during VLM verification', severity: 'low', source: 'error',
    });
  }
});

module.exports = router;
