/**
 * Express route for POST /api/verify-rep
 * Receives patient frame (base64) + reference frame / exerciseId and invokes Gemini VLM.
 */
const express = require('express');
const router = express.Router();
const { verifyExerciseForm } = require('../services/gemini');

// Exercise ID to human display name mapping fallback
const EXERCISE_NAMES = {
  shoulder_abduction: 'Shoulder Abduction',
  neck_tilt: 'Neck Tilt (Lateral Flexion)',
  neck_rotation: 'Neck Rotation',
};

router.post('/verify-rep', async (req, res) => {
  try {
    const { patientFrame, referenceFrame, exerciseId, sessionId } = req.body;

    if (!patientFrame) {
      return res.status(400).json({
        error: 'Missing required field: patientFrame',
      });
    }

    const exerciseName = EXERCISE_NAMES[exerciseId] || exerciseId || 'Physiotherapy Exercise';

    console.log(`[POST /api/verify-rep] Analyzing form for exercise: ${exerciseName} (session: ${sessionId || 'anonymous'})`);

    const result = await verifyExerciseForm(patientFrame, referenceFrame, exerciseName, sessionId);

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/verify-rep:', err);
    return res.status(500).json({
      correct: null,
      issue: 'Server error during VLM verification',
      severity: 'low',
      source: 'error',
    });
  }
});

module.exports = router;
