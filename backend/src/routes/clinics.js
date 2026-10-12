/**
 * Express router for clinics (multi-doctor accounts).
 * - GET    /api/clinics/me                 — my clinic, members, admin flag (clinic: null if none)
 * - POST   /api/clinics                    — create a clinic (caller becomes admin)
 * - POST   /api/clinics/join               — join with invite code
 * - POST   /api/clinics/leave              — leave clinic (admin cannot leave while others remain)
 * - POST   /api/clinics/invite-code        — admin: regenerate invite code
 * - DELETE /api/clinics/members/:doctorId  — admin: remove a doctor
 * - GET    /api/clinics/patients           — clinic-level patient list
 * - POST   /api/clinics/reassign           — admin: move a patient to another clinic doctor
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const requireClinic = require('../middleware/requireClinic');
const {
  getUserProfile,
  setUserFields,
  getPatientsForDoctor,
  createClinic,
  getClinicById,
  getClinicByInviteCode,
  saveClinic,
  getClinicMembers,
  getPatientsForClinic,
} = require('../services/firestore');

const doctorOnly = [requireAuth, requireRole('doctor')];

router.get('/me', ...doctorOnly, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    if (!profile || !profile.clinicId) return res.json({ clinic: null });
    const clinic = await getClinicById(profile.clinicId);
    if (!clinic) return res.json({ clinic: null });

    const isAdmin = clinic.adminId === req.user.uid;
    const memberProfiles = await getClinicMembers(clinic);
    const members = [];
    for (const m of memberProfiles) {
      const patients = await getPatientsForDoctor(m.uid);
      members.push({
        uid: m.uid,
        fullName: m.fullName || '',
        email: m.email || '',
        isAdmin: m.uid === clinic.adminId,
        patientCount: patients.length,
      });
    }
    res.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        adminId: clinic.adminId,
        inviteCode: isAdmin ? clinic.inviteCode : null,
        createdAt: clinic.createdAt,
      },
      members,
      isAdmin,
    });
  } catch (err) {
    console.error('Error fetching clinic:', err);
    res.status(500).json({ error: 'Failed to fetch clinic' });
  }
});

router.post('/', ...doctorOnly, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Clinic name is required' });
    const profile = await getUserProfile(req.user.uid);
    if (profile && profile.clinicId) {
      return res.status(400).json({ error: 'You already belong to a clinic' });
    }
    const clinic = await createClinic(name, req.user.uid);
    res.status(201).json({ success: true, clinic });
  } catch (err) {
    console.error('Error creating clinic:', err);
    res.status(500).json({ error: 'Failed to create clinic' });
  }
});

router.post('/join', ...doctorOnly, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    if (profile && profile.clinicId) {
      return res.status(400).json({ error: 'You already belong to a clinic' });
    }
    const clinic = await getClinicByInviteCode(req.body.inviteCode);
    if (!clinic) return res.status(404).json({ error: 'Invalid invite code' });
    if (!clinic.memberIds.includes(req.user.uid)) {
      clinic.memberIds.push(req.user.uid);
      await saveClinic(clinic);
    }
    await setUserFields(req.user.uid, { clinicId: clinic.id });
    res.json({ success: true, clinicId: clinic.id });
  } catch (err) {
    console.error('Error joining clinic:', err);
    res.status(500).json({ error: 'Failed to join clinic' });
  }
});

router.post('/leave', ...doctorOnly, requireClinic(), async (req, res) => {
  try {
    const clinic = req.clinic;
    if (clinic.adminId === req.user.uid && clinic.memberIds.length > 1) {
      return res.status(400).json({ error: 'Admin cannot leave while other doctors remain. Remove them first.' });
    }
    clinic.memberIds = clinic.memberIds.filter((id) => id !== req.user.uid);
    await saveClinic(clinic);
    await setUserFields(req.user.uid, { clinicId: null });
    res.json({ success: true });
  } catch (err) {
    console.error('Error leaving clinic:', err);
    res.status(500).json({ error: 'Failed to leave clinic' });
  }
});

router.post('/invite-code', ...doctorOnly, requireClinic({ adminOnly: true }), async (req, res) => {
  try {
    const clinic = req.clinic;
    clinic.inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
    await saveClinic(clinic);
    res.json({ success: true, inviteCode: clinic.inviteCode });
  } catch (err) {
    console.error('Error regenerating invite code:', err);
    res.status(500).json({ error: 'Failed to regenerate invite code' });
  }
});

router.delete('/members/:doctorId', ...doctorOnly, requireClinic({ adminOnly: true }), async (req, res) => {
  try {
    const clinic = req.clinic;
    const target = req.params.doctorId;
    if (target === clinic.adminId) return res.status(400).json({ error: 'Cannot remove the clinic admin' });
    if (!clinic.memberIds.includes(target)) return res.status(404).json({ error: 'Doctor is not in this clinic' });

    // Hand the removed doctor's patients to the admin so no patient is orphaned
    const patients = await getPatientsForDoctor(target);
    for (const p of patients) {
      await setUserFields(p.uid, { doctorId: clinic.adminId });
    }
    clinic.memberIds = clinic.memberIds.filter((id) => id !== target);
    await saveClinic(clinic);
    await setUserFields(target, { clinicId: null });
    res.json({ success: true, reassignedPatients: patients.length });
  } catch (err) {
    console.error('Error removing member:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

router.get('/patients', ...doctorOnly, requireClinic(), async (req, res) => {
  try {
    const patients = await getPatientsForClinic(req.clinic);
    res.json({ patients });
  } catch (err) {
    console.error('Error fetching clinic patients:', err);
    res.status(500).json({ error: 'Failed to fetch clinic patients' });
  }
});

router.post('/reassign', ...doctorOnly, requireClinic({ adminOnly: true }), async (req, res) => {
  try {
    const { patientId, doctorId } = req.body;
    const clinic = req.clinic;
    if (!patientId || !doctorId) return res.status(400).json({ error: 'patientId and doctorId are required' });
    if (!clinic.memberIds.includes(doctorId)) return res.status(400).json({ error: 'Target doctor is not in this clinic' });

    const patient = await getUserProfile(patientId);
    if (!patient || !patient.doctorId || !clinic.memberIds.includes(patient.doctorId)) {
      return res.status(404).json({ error: 'Patient not found in this clinic' });
    }
    await setUserFields(patientId, { doctorId });
    res.json({ success: true });
  } catch (err) {
    console.error('Error reassigning patient:', err);
    res.status(500).json({ error: 'Failed to reassign patient' });
  }
});

module.exports = router;
