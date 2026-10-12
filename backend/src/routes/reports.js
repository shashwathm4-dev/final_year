/**
 * Express router for PDF progress reports.
 * - GET /api/reports/patient/:patientId?days=30 — doctor: report for a patient (own or clinic patient)
 * - GET /api/reports/me?days=30                 — patient: own report
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { canDoctorAccessPatient } = require('../services/access');
const { buildReport } = require('../services/pdfReport');
const {
  getUserProfile,
  getSession,
  getSessionsByPatient,
  getPatientPrograms,
  getClinicById,
} = require('../services/firestore');

const MAX_SESSIONS = 60;

async function sendReport(res, patientId, days) {
  const patient = await getUserProfile(patientId);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const list = (await getSessionsByPatient(patientId))
    .filter((s) => new Date(s.startedAt || 0).getTime() >= since)
    .slice(0, MAX_SESSIONS);

  // Load reps (quality/ROM scores) for each session
  const sessions = [];
  for (const s of list) {
    const full = await getSession(s.sessionId);
    sessions.push(full || s);
  }
  sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));

  const doctor = patient.doctorId ? await getUserProfile(patient.doctorId) : null;
  let clinicName = '';
  if (doctor && doctor.clinicId) {
    const clinic = await getClinicById(doctor.clinicId);
    clinicName = clinic ? clinic.name : '';
  }
  const programs = await getPatientPrograms(patientId);

  const doc = buildReport({
    patient,
    doctorName: doctor ? (doctor.fullName || doctor.email) : '',
    clinicName,
    days,
    sessions,
    programs,
  });

  const safeName = String(patient.fullName || patient.email || 'patient').replace(/[^a-z0-9]+/gi, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="progress_report_${safeName}.pdf"`);
  doc.pipe(res);
  doc.end();
}

function parseDays(q) {
  const d = Number(q);
  return Number.isFinite(d) ? Math.min(365, Math.max(1, d)) : 30;
}

router.get('/me', requireAuth, async (req, res) => {
  try {
    await sendReport(res, req.user.uid, parseDays(req.query.days));
  } catch (err) {
    console.error('Error generating report:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report' });
  }
});

router.get('/patient/:patientId', requireAuth, requireRole('doctor'), async (req, res) => {
  try {
    if (!(await canDoctorAccessPatient(req.user.uid, req.params.patientId))) {
      return res.status(403).json({ error: 'Forbidden: this patient is not in your practice or clinic' });
    }
    await sendReport(res, req.params.patientId, parseDays(req.query.days));
  } catch (err) {
    console.error('Error generating report:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
