const test = require('node:test');
const assert = require('node:assert/strict');
const { seedFirestore } = require('../src/scripts/seedFirestore');

function createMockFirestore() {
  const store = {};

  function getDocRef(pathParts) {
    const fullPath = pathParts.join('/');
    return {
      _path: fullPath,
      collection: (subCol) => ({
        doc: (subId) => getDocRef([...pathParts, subCol, subId]),
      }),
    };
  }

  const db = {
    _store: store,
    collection: (colName) => ({
      doc: (docId) => getDocRef([colName, docId]),
    }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, data, options) => {
          ops.push({ ref, data, options });
        },
        commit: async () => {
          for (const op of ops) {
            const path = op.ref._path;
            store[path] = { ...(store[path] || {}), ...op.data };
          }
        },
      };
    },
  };

  return db;
}

function createMockAdmin(userMap) {
  return {
    auth: () => ({
      getUserByEmail: async (email) => {
        const lower = email.toLowerCase();
        if (userMap[lower]) {
          return { uid: userMap[lower], email: lower };
        }
        const err = new Error(`User not found for email: ${email}`);
        err.code = 'auth/user-not-found';
        throw err;
      },
    }),
  };
}

test('seedFirestore: verifies demo data remapping, subcollections, idempotence, and guardrails', async (t) => {
  const mockUsers = {
    'doc.test@example.com': 'real_doctor_uid_123',
    'shashwathm4@gmail.com': 'real_patient_uid_456',
  };
  const mockAdmin = createMockAdmin(mockUsers);
  const mockDb = createMockFirestore();

  const result = await seedFirestore({
    admin: mockAdmin,
    db: mockDb,
    isClientSdk: false,
    doctorEmail: 'doc.test@example.com',
    patientEmail: 'shashwathm4@gmail.com',
  });

  assert.ok(result.totalWrites > 0, 'Wrote items to Firestore');
  assert.equal(result.realDoc, 'real_doctor_uid_123');
  assert.equal(result.realPat, 'real_patient_uid_456');

  // a) the real doctor UID owns >=4 patients via users.doctorId
  let doctorOwnedPatients = 0;
  for (const [key, doc] of Object.entries(mockDb._store)) {
    if (key.startsWith('users/') && doc.role === 'patient' && doc.doctorId === 'real_doctor_uid_123') {
      doctorOwnedPatients++;
    }
  }
  assert.ok(
    doctorOwnedPatients >= 4,
    `Expected doctor to own >= 4 patients, found ${doctorOwnedPatients}`
  );

  // b) the real patient UID has >=4 sessions with reps in the subcollection and >=2 assignments
  let patientSessions = 0;
  let repDocsCount = 0;
  for (const [key, doc] of Object.entries(mockDb._store)) {
    if (key.startsWith('sessions/') && !key.includes('/reps/') && doc.patientId === 'real_patient_uid_456') {
      patientSessions++;
      assert.equal(doc.reps, undefined, 'reps must not be stored as an array on the session document');
    }
    if (key.startsWith('sessions/') && key.includes('/reps/rep_')) {
      repDocsCount++;
    }
  }
  assert.ok(
    patientSessions >= 4,
    `Expected real patient to have >= 4 sessions, found ${patientSessions}`
  );
  assert.ok(
    repDocsCount >= 4,
    `Expected session reps in subcollection, found ${repDocsCount}`
  );

  let patientAssignments = 0;
  for (const [key, doc] of Object.entries(mockDb._store)) {
    if (key.startsWith('assignedExercises/') && doc.patientId === 'real_patient_uid_456') {
      patientAssignments++;
    }
  }
  assert.ok(
    patientAssignments >= 2,
    `Expected real patient to have >= 2 assignments, found ${patientAssignments}`
  );

  // c) clinic_asaara_ortho.adminId and memberIds contain the real doctor UID and no "doc_rahul_verma"
  const clinicDoc = mockDb._store['clinics/clinic_asaara_ortho'];
  assert.ok(clinicDoc, 'clinic_asaara_ortho exists');
  assert.equal(clinicDoc.adminId, 'real_doctor_uid_123');
  assert.ok(clinicDoc.memberIds.includes('real_doctor_uid_123'));
  assert.ok(!clinicDoc.memberIds.includes('doc_rahul_verma'), 'doc_rahul_verma must be purged from memberIds');

  // d) re-running produces the same doc IDs (idempotent)
  const keysBefore = Object.keys(mockDb._store).sort();
  await seedFirestore({
    admin: mockAdmin,
    db: mockDb,
    isClientSdk: false,
    doctorEmail: 'doc.test@example.com',
    patientEmail: 'shashwathm4@gmail.com',
  });
  const keysAfter = Object.keys(mockDb._store).sort();
  assert.deepEqual(keysBefore, keysAfter, 'Re-running produces identical document keys (idempotent)');

  // e) aborts when both emails resolve to the same UID
  await assert.rejects(
    async () => {
      await seedFirestore({
        admin: createMockAdmin({ 'same@example.com': 'same_uid' }),
        db: mockDb,
        isClientSdk: false,
        doctorEmail: 'same@example.com',
        patientEmail: 'same@example.com',
      });
    },
    /Doctor and patient must be different accounts/,
    'Aborts when doctor and patient resolve to same UID'
  );
});

