/**
 * Express router for exercise programs (weekly plans with progression rules).
 * - GET    /api/programs                     — doctor: my programs + clinic-shared programs
 * - POST   /api/programs                     — doctor: create a program
 * - DELETE /api/programs/:id                 — doctor: delete my program
 * - POST   /api/programs/:id/assign          — doctor: apply a program to a patient
 * - GET    /api/programs/patient/:patientId  — doctor: a patient's programs + progress
 * - GET    /api/programs/my                  — patient: my programs + progress
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canDoctorAccessPatient } = require('../services/access');
const {
  getUserProfile,
  createProgram,
  getProgramById,
  getProgramsForDoctor,
  deleteProgram,
  applyProgramToPatient,
  getPatientPrograms,
} = require('../services/firestore');

function cleanItems(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  const out = [];
  for (const it of items) {
    if (!it.exerciseId) return null;
    out.push({
      exerciseId: String(it.exerciseId),
      exerciseName: String(it.exerciseName || it.exerciseId),
      targetSets: Math.min(20, Math.max(1, Number(it.targetSets) || 3)),
      targetReps: Math.min(100, Math.max(1, Number(it.targetReps) || 10)),
      daysOfWeek: Array.isArray(it.daysOfWeek)
        ? [...new Set(it.daysOfWeek.map(Number).filter((d) => d >= 0 && d <= 6))].sort()
        : [],
      notes: String(it.notes || ''),
    });
  }
  return out;
}

function cleanProgression(p = {}) {
  return {
    enabled: p.enabled !== false,
    goodSessionsRequired: Math.max(1, Number(p.goodSessionsRequired) || 3),
    accuracyThreshold: Math.min(100, Math.max(1, Number(p.accuracyThreshold) || 80)),
    repsIncrement: Math.max(0, Number(p.repsIncrement) || 0),
    setsIncrement: Math.max(0, Number(p.setsIncrement) || 0),
    maxReps: Math.max(1, Number(p.maxReps) || 30),
    maxSets: Math.max(1, Number(p.maxSets) || 5),
  };
}

router.get('/my', requireAuth, async (req, res) => {
  try {
    const programs = await getPatientPrograms(req.user.uid);
    res.json({ programs });
  } catch (err) {
    console.error('Error fetching my programs:', err);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

router.get('/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    if (!(await canDoctorAccessPatient(req.user.uid, req.params.patientId))) {
      return res.status(403).json({ error: 'Forbidden: this patient is not in your practice or clinic' });
    }
    const programs = await getPatientPrograms(req.params.patientId);
    res.json({ programs });
  } catch (err) {
    console.error('Error fetching patient programs:', err);
    res.status(500).json({ error: 'Failed to fetch patient programs' });
  }
});

router.get('/', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    const programs = await getProgramsForDoctor(req.user.uid, profile?.clinicId || null);
    res.json({ programs });
  } catch (err) {
    console.error('Error fetching programs:', err);
    res.status(500).json({ error: 'Failed to fetch programs' });
  }
});

router.post('/', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { name, description, items, progression, shareWithClinic } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Program name is required' });
    const cleaned = cleanItems(items);
    if (!cleaned) return res.status(400).json({ error: 'Add at least one exercise to the program' });

    const profile = await getUserProfile(req.user.uid);
    const program = await createProgram({
      name: String(name).trim(),
      description: String(description || ''),
      doctorId: req.user.uid,
      doctorName: req.user.fullName || profile?.fullName || '',
      clinicId: shareWithClinic && profile?.clinicId ? profile.clinicId : null,
      items: cleaned,
      progression: cleanProgression(progression),
    });
    res.status(201).json({ success: true, program });
  } catch (err) {
    console.error('Error creating program:', err);
    res.status(500).json({ error: 'Failed to create program' });
  }
});

router.delete('/:id', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const program = await getProgramById(req.params.id);
    if (!program) return res.status(404).json({ error: 'Program not found' });
    if (program.doctorId !== req.user.uid) return res.status(403).json({ error: 'Only the creator can delete this program' });
    await deleteProgram(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting program:', err);
    res.status(500).json({ error: 'Failed to delete program' });
  }
});

router.post('/:id/assign', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { patientId, startDate } = req.body;
    if (!patientId) return res.status(400).json({ error: 'patientId is required' });

    const program = await getProgramById(req.params.id);
    if (!program) return res.status(404).json({ error: 'Program not found' });

    const doctorProfile = await getUserProfile(req.user.uid);
    const ownsProgram = program.doctorId === req.user.uid;
    const sharedInClinic = program.clinicId && program.clinicId === doctorProfile?.clinicId;
    if (!ownsProgram && !sharedInClinic) return res.status(403).json({ error: 'You cannot use this program' });

    if (!(await canDoctorAccessPatient(req.user.uid, patientId))) {
      return res.status(403).json({ error: 'Forbidden: this patient is not in your practice or clinic' });
    }
    const patient = await getUserProfile(patientId);

    const patientProgram = await applyProgramToPatient(
      program,
      patient,
      { uid: req.user.uid, fullName: req.user.fullName || doctorProfile?.fullName || '' },
      startDate
    );
    res.status(201).json({ success: true, patientProgram });
  } catch (err) {
    console.error('Error assigning program:', err);
    res.status(500).json({ error: 'Failed to assign program' });
  }
});

module.exports = router;
