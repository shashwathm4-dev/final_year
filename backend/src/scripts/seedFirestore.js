/**
 * Push demo data to the LIVE Firestore, attached to your REAL accounts.
 * Put in backend/src/scripts/seedFirestore.js
 *
 * Run locally from backend/ with the SAME Firebase credentials as the deployment
 * (backend/.env must point at the production project):
 *
 *   DOCTOR_EMAIL=your.doctor@gmail.com PATIENT_EMAIL=shashwathm4@gmail.com \
 *   npm run seed:firestore
 *
 * Both accounts must already exist in Firebase Auth (sign up once on the deployed site).
 * Safe to re-run: fixed doc IDs, so it overwrites instead of duplicating.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');

async function seedFirestore(options = {}) {
  // 1. Build the seed in a throwaway local store (never touches backend/data)
  const tmp = path.join(os.tmpdir(), `seed_${Date.now()}_${Math.random().toString(36).substring(7)}.json`);
  process.env.LOCAL_STORE_PATH = tmp;

  // Clear require cache for seed.js so STORE_PATH picks up the current process.env.LOCAL_STORE_PATH
  delete require.cache[require.resolve('./seed.js')];

  try {
    require('./seed.js').seedData();
  } catch (err) {
    console.error('Failed to generate base seed data:', err);
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    throw err;
  }

  let seed;
  try {
    seed = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  } finally {
    if (fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }

  const admin = options.admin || require('../config/firebase').admin;
  const db = options.db || require('../config/firebase').db;
  const isClientSdk = options.isClientSdk !== undefined ? options.isClientSdk : require('../config/firebase').isClientSdk;

  if (!db || isClientSdk) {
    throw new Error('Needs Firebase Admin credentials (service account) in backend/.env. Aborting.');
  }

  const SEED_DOCTOR = 'doc_rahul_verma';
  const SEED_PATIENT = 'pat_shashwath_m';
  const doctorEmail = (options.doctorEmail || process.env.DOCTOR_EMAIL || '').toLowerCase().trim();
  const patientEmail = (options.patientEmail || process.env.PATIENT_EMAIL || 'shashwathm4@gmail.com').toLowerCase().trim();

  if (!doctorEmail) {
    throw new Error('Set DOCTOR_EMAIL environment variable');
  }

  const realDocUser = await admin.auth().getUserByEmail(doctorEmail);
  const realPatUser = await admin.auth().getUserByEmail(patientEmail);
  const realDoc = realDocUser.uid;
  const realPat = realPatUser.uid;

  if (realDoc === realPat) {
    throw new Error('Doctor and patient must be different accounts.');
  }

  const mapId = (id) => (id === SEED_DOCTOR ? realDoc : id === SEED_PATIENT ? realPat : id);
  const remap = (o) => {
    const c = { ...o };
    for (const k of ['doctorId', 'patientId', 'adminId']) {
      if (c[k]) c[k] = mapId(c[k]);
    }
    if (c.patientId === realPat) c.patientEmail = patientEmail;
    if (Array.isArray(c.memberIds)) c.memberIds = [...new Set(c.memberIds.map(mapId))];
    return c;
  };

  const batches = [];
  let currentBatch = db.batch();
  let currentCount = 0;
  let totalWrites = 0;

  const setOp = (ref, data) => {
    currentBatch.set(ref, data, { merge: true });
    currentCount++;
    totalWrites++;
    if (currentCount >= 400) {
      batches.push(currentBatch);
      currentBatch = db.batch();
      currentCount = 0;
    }
  };

  // 1. Users
  for (const [uid, u] of Object.entries(seed.users || {})) {
    const id = mapId(uid);
    if (id === realDoc) {
      setOp(db.collection('users').doc(id), {
        ...remap(u),
        uid: id,
        email: doctorEmail,
        role: 'doctor',
        clinicId: 'clinic_asaara_ortho',
      });
    } else if (id === realPat) {
      setOp(db.collection('users').doc(id), {
        ...remap(u),
        uid: id,
        email: patientEmail,
        role: 'patient',
        doctorId: realDoc,
      });
    } else {
      setOp(db.collection('users').doc(id), { ...remap(u), uid: id });
    }
  }

  // 2. Clinics
  for (const [id, c] of Object.entries(seed.clinics || {})) {
    setOp(db.collection('clinics').doc(id), remap(c));
  }

  // 3. Assigned Exercises
  for (const [id, a] of Object.entries(seed.assignedExercises || {})) {
    setOp(db.collection('assignedExercises').doc(id), remap(a));
  }

  // 4. Sessions & Reps subcollection
  for (const [id, s] of Object.entries(seed.sessions || {})) {
    const { reps = [], ...session } = remap(s);
    setOp(db.collection('sessions').doc(id), session);
    for (const r of reps) {
      setOp(db.collection('sessions').doc(id).collection('reps').doc(`rep_${r.repNumber}`), r);
    }
  }

  if (currentCount > 0) {
    batches.push(currentBatch);
  }

  for (const b of batches) {
    await b.commit();
  }

  console.log(`Wrote ${totalWrites} docs across ${batches.length} batch(es). Doctor=${realDoc} Patient=${realPat}`);
  return { totalWrites, realDoc, realPat };
}

if (require.main === module) {
  seedFirestore()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = { seedFirestore };
