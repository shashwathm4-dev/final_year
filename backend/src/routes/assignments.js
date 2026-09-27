/**
 * Express router for assignedExercises collection.
 * - GET /api/assignments — patient sees their assignments, doctor sees all assigned by them
 * - POST /api/assignments — doctor-only: assign exercise to patient
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  getAssignedExercises,
  getAssignmentsByDoctor,
  assignExercise,
} = require('../services/firestore');

router.get('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'doctor') {
      const assignments = await getAssignmentsByDoctor(req.user.uid);
      return res.json({ assignments });
    } else {
      const assignments = await getAssignedExercises(req.user.uid);
      return res.json({ assignments });
    }
  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments' });
  }
});

router.post('/', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const {
      patientId,
      patientEmail,
      exerciseId,
      exerciseName,
      targetReps,
      targetSets,
      notes,
    } = req.body;

    if (!patientId || !exerciseId) {
      return res.status(400).json({ error: 'Missing required fields: patientId, exerciseId' });
    }

    const assigned = await assignExercise({
      patientId,
      patientEmail: patientEmail || '',
      exerciseId,
      exerciseName: exerciseName || exerciseId,
      doctorId: req.user.uid,
      doctorName: req.user.fullName || '',
      targetReps: Number(targetReps) || 10,
      targetSets: Number(targetSets) || 3,
      notes: notes || '',
      status: 'active',
    });

    res.status(201).json({ success: true, assignment: assigned });
  } catch (err) {
    console.error('Error assigning exercise:', err);
    res.status(500).json({ error: 'Failed to assign exercise' });
  }
});

module.exports = router;
