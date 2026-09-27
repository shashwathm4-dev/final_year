/**
 * Express router for user management and role assignment.
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
  getUserProfile,
  upsertUserProfile,
  assignPatientToDoctor,
  getPatientsForDoctor,
} = require('../services/firestore');

/**
 * GET /api/users/me
 * Returns current authenticated user's profile.
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    if (!profile) {
      return res.json({
        uid: req.user.uid,
        email: req.user.email,
        role: req.user.role || 'patient',
        fullName: req.user.fullName || '',
        doctorId: null,
      });
    }
    return res.json(profile);
  } catch (err) {
    console.error('Error fetching /api/users/me:', err);
    return res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

/**
 * POST /api/users/profile
 * Create or sync user profile on signup or first login.
 */
router.post('/profile', requireAuth, async (req, res) => {
  try {
    const { role, fullName } = req.body;
    const cleanRole = role === 'doctor' ? 'doctor' : 'patient';
    const profile = await upsertUserProfile(req.user.uid, {
      email: req.user.email,
      role: cleanRole,
      fullName: fullName || req.user.fullName || '',
    });
    return res.json(profile);
  } catch (err) {
    console.error('Error saving /api/users/profile:', err);
    return res.status(500).json({ error: 'Failed to save user profile' });
  }
});

/**
 * POST /api/users/add-patient
 * Doctor-only endpoint to link a patient by email.
 */
router.post('/add-patient', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Missing required field: email' });
    }

    const patient = await assignPatientToDoctor(email.trim().toLowerCase(), req.user.uid);
    if (!patient) {
      return res.status(404).json({ error: 'Patient with this email not found' });
    }

    return res.json({ success: true, patient });
  } catch (err) {
    console.error('Error in /api/users/add-patient:', err);
    return res.status(500).json({ error: 'Failed to assign patient' });
  }
});

/**
 * GET /api/users/patients
 * Doctor-only endpoint to list all assigned patients.
 */
router.get('/patients', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    const patients = await getPatientsForDoctor(req.user.uid);
    return res.json({ patients });
  } catch (err) {
    console.error('Error fetching /api/users/patients:', err);
    return res.status(500).json({ error: 'Failed to fetch patients list' });
  }
});

module.exports = router;
