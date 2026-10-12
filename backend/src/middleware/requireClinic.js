/**
 * Loads the requesting doctor's clinic into req.clinic.
 * requireClinic()                    -> any clinic member
 * requireClinic({ adminOnly: true }) -> only the clinic admin (clinic.adminId === uid)
 * Must run after requireAuth + requireRole('doctor').
 */
const { getUserProfile, getClinicById } = require('../services/firestore');

function requireClinic({ adminOnly = false } = {}) {
  return async (req, res, next) => {
    try {
      const profile = await getUserProfile(req.user.uid);
      if (!profile || !profile.clinicId) {
        return res.status(403).json({ error: 'You are not part of a clinic' });
      }
      const clinic = await getClinicById(profile.clinicId);
      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' });
      }
      if (adminOnly && clinic.adminId !== req.user.uid) {
        return res.status(403).json({ error: 'Only the clinic admin can do this' });
      }
      req.clinic = clinic;
      next();
    } catch (err) {
      console.error('[requireClinic] error:', err.message);
      res.status(500).json({ error: 'Failed to load clinic' });
    }
  };
}

module.exports = requireClinic;
