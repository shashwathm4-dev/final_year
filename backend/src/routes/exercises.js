/**
 * Express router for exercises collection.
 * - GET /api/exercises — list all built-in + doctor's custom exercises
 * - POST /api/exercises — doctor-only: create a custom exercise
 * - GET /api/exercises/:id — retrieve single exercise details
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { getExercises, getExerciseById, createExercise } = require('../services/firestore');

// Read static built-in exercises as guaranteed fallback
const defaultExercises = require('../../../frontend/src/config/exercises.json');

router.get('/', requireAuth, async (req, res) => {
  try {
    const firestoreExercises = await getExercises();
    
    // Merge firestore exercises with static default exercises
    const merged = { ...defaultExercises };
    // Built-in exercises always come from the static file; only custom ones come from Firestore
    firestoreExercises.forEach(ex => { if (ex.isCustom) merged[ex.id] = ex; });

    const list = Object.values(merged).map(({ referenceFrame, ...rest }) => ({
      ...rest,
      hasReferenceFrame: !!referenceFrame,
    }));
    res.json({ exercises: list });
  } catch (err) {
    console.error('Error fetching exercises:', err);
    res.json({ exercises: Object.values(defaultExercises) });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let exercise = await getExerciseById(id);
    if (!exercise && defaultExercises[id]) {
      exercise = defaultExercises[id];
    }
    if (!exercise) {
      return res.status(404).json({ error: 'Exercise not found' });
    }
    res.json(exercise);
  } catch (err) {
    console.error('Error fetching exercise:', err);
    res.status(500).json({ error: 'Failed to fetch exercise' });
  }
});

router.post('/', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const {
      id,
      displayName,
      description,
      icon,
      joints,
      landmarkIndices,
      angleFunction,
      target_angle_range,
      startAngleThreshold,
      peakAngleThreshold,
      returnAngleThreshold,
      checkpoint_thresholds,
      referenceCheckpoints,
      referenceFrame,
      note,
      angleTransform,
      supportsSide,
      baseSide,
      cameraView,
      mode,
      hold,
      compensationChecks,
      use3D,
    } = req.body;

    if (!displayName || !joints || !target_angle_range) {
      return res.status(400).json({ error: 'Missing required exercise fields' });
    }

    if (referenceFrame !== undefined && referenceFrame !== null) {
      const ok =
        typeof referenceFrame === 'string' &&
        referenceFrame.startsWith('data:image/jpeg;base64,') &&
        referenceFrame.length < 400000;           // keeps the Firestore doc far below the 1 MiB limit
      if (!ok) return res.status(400).json({ error: 'Invalid referenceFrame (must be a JPEG data URL under ~300 KB)' });
    }

    const created = await createExercise({
      id: id || `custom_${Date.now()}`,
      displayName,
      description: description || '',
      icon: icon || '🏋️',
      joints,
      landmarkIndices: landmarkIndices || {},
      angleFunction: angleFunction || 'threePoint',
      use3D: !!use3D,
      target_angle_range,
      startAngleThreshold: startAngleThreshold || 15,
      peakAngleThreshold: peakAngleThreshold || 45,
      returnAngleThreshold: returnAngleThreshold || 25,
      checkpoint_thresholds: checkpoint_thresholds || [40, 45, 50, 45, 40],
      referenceCheckpoints: referenceCheckpoints || [5, 45, 90, 45, 5],
      referenceFrame: referenceFrame || null,
      note: note || '',
      angleTransform: angleTransform || null,
      supportsSide: !!supportsSide,
      baseSide: baseSide === 'right' ? 'right' : 'left',
      cameraView: cameraView === 'side' ? 'side' : 'front',
      mode: mode === 'hold' ? 'hold' : 'reps',
      hold: mode === 'hold' && hold ? hold : null,
      compensationChecks: Array.isArray(compensationChecks)
        ? compensationChecks.filter((c) => ['trunkLean', 'hipTilt', 'shoulderHike'].includes(c))
        : [],
      isCustom: true,
      createdBy: req.user.uid,
      createdByName: req.user.fullName || '',
    });

    res.status(201).json({ success: true, exercise: created });
  } catch (err) {
    console.error('Error creating exercise:', err);
    res.status(500).json({ error: 'Failed to create exercise' });
  }
});

module.exports = router;
