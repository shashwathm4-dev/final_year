/**
 * Access helpers — decides whether a doctor may view/manage a patient.
 * A doctor may access a patient if the patient is theirs, or the patient's
 * doctor belongs to the same clinic as the requesting doctor.
 */
const { getUserProfile } = require('./firestore');

async function canDoctorAccessPatient(doctorUid, patientId) {
  const patient = await getUserProfile(patientId);
  if (!patient) return false;
  return patient.doctorId === doctorUid;
}

/**
 * Access helper for a specific session object.
 * Returns true if the user owns the session (patient) or is the treating / clinic doctor.
 */
async function getSessionAccess(user, session) {
  if (!user || !session) return false;
  if (session.patientId === user.uid) return true;
  if (user.role === 'doctor' && session.patientId) {
    return await canDoctorAccessPatient(user.uid, session.patientId);
  }
  return false;
}

module.exports = { canDoctorAccessPatient, getSessionAccess };
