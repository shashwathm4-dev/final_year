/**
 * Express route for POST /api/verify-rep
 * Receives patient frame (base64) + exerciseId and invokes Gemini VLM.
 * Requires login, validated body, per-user rate limit. The frame is never stored.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { verifyLimiter } = require('../middleware/rateLimits');
const { verifyRepSchema } = require('../validation/schemas');
const { verifyExerciseForm } = require('../services/gemini');

// Exercise ID to human display name mapping fallback
const EXERCISE_NAMES = {
  shoulder_abduction: 'Shoulder Abduction',
  neck_tilt: 'Neck Tilt (Lateral Flexion)',
  neck_rotation: 'Neck Rotation',
};

router.post('/verify-rep', requireAuth, verifyLimiter, validate(verifyRepSchema), async (req, res) => {
  // Image responses must never be cached by browsers or proxies
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { patientFrame, referenceFrame, exerciseId } = req.body;

    const exerciseName = EXERCISE_NAMES[exerciseId] || exerciseId || 'Physiotherapy Exercise';

    console.log(`[POST /api/verify-rep] Analyzing form for exercise: ${exerciseName} (user: ${req.user.uid})`);

    // The cooldown inside verifyExerciseForm is keyed by user id, so rotating session ids does not bypass it
    const result = await verifyExerciseForm(patientFrame, referenceFrame, exerciseName, req.user.uid);

    // Drop the frame reference so it can be garbage collected immediately
    req.body.patientFrame = null;
    req.body.referenceFrame = null;

    return res.json(result);
  } catch (err) {
    console.error('Error in /api/verify-rep:', err.message);
    return res.status(500).json({
      correct: null,
      issue: 'Server error during VLM verification',
      severity: 'low',
      source: 'error',
    });
  }
});

module.exports = router;
