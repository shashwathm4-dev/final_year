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

router.get('/', async (req, res) => {
  try {
    const firestoreExercises = await getExercises();
    
    // Merge firestore exercises with static default exercises
    const merged = { ...defaultExercises };
    firestoreExercises.forEach(ex => {
      merged[ex.id] = ex;
    });

    res.json({ exercises: Object.values(merged) });
  } catch (err) {
    console.error('Error fetching exercises:', err);
    res.json({ exercises: Object.values(defaultExercises) });
  }
});

router.get('/:id', async (req, res) => {
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
      note,
    } = req.body;

    if (!displayName || !joints || !target_angle_range) {
      return res.status(400).json({ error: 'Missing required exercise fields' });
    }

    const created = await createExercise({
      id: id || `custom_${Date.now()}`,
      displayName,
      description: description || '',
      icon: icon || '🏋️',
      joints,
      landmarkIndices: landmarkIndices || {},
      angleFunction: angleFunction || 'threePoint',
      target_angle_range,
      startAngleThreshold: startAngleThreshold || 15,
      peakAngleThreshold: peakAngleThreshold || 45,
      returnAngleThreshold: returnAngleThreshold || 25,
      checkpoint_thresholds: checkpoint_thresholds || [40, 45, 50, 45, 40],
      referenceCheckpoints: referenceCheckpoints || [5, 45, 90, 45, 5],
      note: note || '',
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
