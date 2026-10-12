/**
 * On-Device Models Route (Feature 31)
 * Serves trained rep-classifier models to clients and provides training endpoint for doctors.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { getStoredModel, trainForExercise } = require('../services/repClassifier');

// GET /api/models/rep-classifier/:exerciseId
router.get('/rep-classifier/:exerciseId', requireAuth, async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const model = getStoredModel(exerciseId);
    if (!model) {
      return res.status(404).json({ error: 'Model not found for this exercise' });
    }
    res.json(model);
  } catch (err) {
    console.error('Error fetching rep-classifier model:', err);
    res.status(500).json({ error: 'Failed to fetch model' });
  }
});

// POST /api/models/rep-classifier/:exerciseId/train (Doctor only)
router.post('/rep-classifier/:exerciseId/train', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const result = await trainForExercise(exerciseId);
    res.json(result);
  } catch (err) {
    console.error('Error training rep-classifier model:', err);
    res.status(500).json({ error: err.message || 'Failed to train model' });
  }
});

module.exports = router;
