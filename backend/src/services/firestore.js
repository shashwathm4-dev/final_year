/**
 * Firestore service — session and rep logging.
 * Supports both Firebase Admin SDK and Firebase Web JS SDK seamlessly.
 * Gracefully handles unconfigured/offline/uncreated database states.
 */
const { db, isClientSdk } = require('../config/firebase');

// Web SDK helpers (if using client SDK)
let doc, setDoc, updateDoc, getDoc, getDocs, collection, query, orderBy, where, increment;
if (isClientSdk && db) {
  const firestoreWeb = require('firebase/firestore');
  doc = firestoreWeb.doc;
  setDoc = firestoreWeb.setDoc;
  updateDoc = firestoreWeb.updateDoc;
  getDoc = firestoreWeb.getDoc;
  getDocs = firestoreWeb.getDocs;
  collection = firestoreWeb.collection;
  query = firestoreWeb.query;
  orderBy = firestoreWeb.orderBy;
  where = firestoreWeb.where;
  increment = firestoreWeb.increment;
}

function handleFirestoreError(actionName, err) {
  if (err.message?.includes('NOT_FOUND') || err.message?.includes('PERMISSION_DENIED')) {
    console.warn(
      `⚠ Firestore database container not initialized in Firebase Console yet.\n` +
      `  Visit https://console.firebase.google.com/project/final-year-project-1a22b/firestore and click "Create database" (Start in test mode).`
    );
  } else {
    console.error(`Error during Firestore ${actionName}:`, err.message);
  }
}

/**
 * Create a new exercise session.
 * @param {string} exerciseId
 * @param {string|null} patientId
 * @returns {Promise<string>} Session ID
 */
async function createSession(exerciseId, patientId = null) {
  if (!db) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Firestore stub] Created local session: ${localId} (patientId: ${patientId})`);
    return localId;
  }

  const sessionData = {
    exerciseId,
    patientId: patientId || null,
    startedAt: new Date().toISOString(),
    status: 'active',
    totalReps: 0,
    correctReps: 0,
  };

  try {
    if (isClientSdk) {
      const sessionRef = doc(collection(db, 'sessions'));
      await setDoc(sessionRef, sessionData);
      console.log(`[Firestore Web SDK] Created session: ${sessionRef.id}`);
      return sessionRef.id;
    } else {
      const sessionRef = db.collection('sessions').doc();
      await sessionRef.set(sessionData);
      console.log(`[Firestore Admin SDK] Created session: ${sessionRef.id}`);
      return sessionRef.id;
    }
  } catch (err) {
    handleFirestoreError('createSession', err);
    return `local_${Date.now()}`;
  }
}

/**
 * Log a completed rep to Firestore.
 * @param {string} sessionId
 * @param {Object} repData - { exerciseId, repNumber, timestamp, angles, verdictSource, correct, issue, severity }
 */
async function logRep(sessionId, repData) {
  if (!db) {
    console.log(`[Firestore stub] Log rep #${repData.repNumber} for session ${sessionId}:`, {
      correct: repData.correct,
      verdictSource: repData.verdictSource,
      issue: repData.issue,
    });
    return;
  }

  const repPayload = {
    exerciseId: repData.exerciseId,
    repNumber: repData.repNumber,
    timestamp: repData.timestamp || Date.now(),
    angles: repData.angles || null,
    verdictSource: repData.verdictSource || 'local',
    correct: repData.correct ?? null,
    issue: repData.issue || null,
    severity: repData.severity || null,
    tempoScore: repData.tempoScore ?? null,
    smoothnessScore: repData.smoothnessScore ?? null,
    romScore: repData.romScore ?? null,
    qualityScore: repData.qualityScore ?? null,
  };

  try {
    if (isClientSdk) {
      const repRef = doc(db, 'sessions', sessionId, 'reps', `rep_${repData.repNumber}`);
      await setDoc(repRef, repPayload);

      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        totalReps: increment(1),
        ...(repData.correct === true ? { correctReps: increment(1) } : {}),
        lastRepAt: new Date().toISOString(),
      });
      console.log(`[Firestore Web SDK] Logged rep #${repData.repNumber}`);
    } else {
      const repRef = db
        .collection('sessions')
        .doc(sessionId)
        .collection('reps')
        .doc(`rep_${repData.repNumber}`);
      await repRef.set(repPayload);

      const sessionRef = db.collection('sessions').doc(sessionId);
      const { FieldValue } = require('firebase-admin/firestore');
      await sessionRef.update({
        totalReps: FieldValue.increment(1),
        ...(repData.correct === true ? { correctReps: FieldValue.increment(1) } : {}),
        lastRepAt: new Date().toISOString(),
      });
      console.log(`[Firestore Admin SDK] Logged rep #${repData.repNumber}`);
    }
  } catch (err) {
    handleFirestoreError('logRep', err);
  }
}

/**
 * Retrieve a session and its reps.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function getSession(sessionId) {
  if (!db) {
    return { sessionId, message: 'Firestore not configured — no data available' };
  }

  try {
    if (isClientSdk) {
      const sessionRef = doc(db, 'sessions', sessionId);
      const sessionSnap = await getDoc(sessionRef);
      if (!sessionSnap.exists()) return null;

      const repsRef = collection(db, 'sessions', sessionId, 'reps');
      const q = query(repsRef, orderBy('repNumber'));
      const repsSnap = await getDocs(q);

      const reps = repsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      return {
        sessionId,
        ...sessionSnap.data(),
        reps,
      };
    } else {
      const sessionDoc = await db.collection('sessions').doc(sessionId).get();
      if (!sessionDoc.exists) return null;

      const repsSnapshot = await db
        .collection('sessions')
        .doc(sessionId)
        .collection('reps')
        .orderBy('repNumber')
        .get();

      const reps = repsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return {
        sessionId,
        ...sessionDoc.data(),
        reps,
      };
    }
  } catch (err) {
    handleFirestoreError('getSession', err);
    return null;
  }
}

/**
 * Get user profile by UID.
 * @param {string} uid
 * @returns {Promise<Object|null>}
 */
async function getUserProfile(uid) {
  if (!db) return null;

  try {
    if (isClientSdk) {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      return snap.exists() ? { uid, ...snap.data() } : null;
    } else {
      const userDoc = await db.collection('users').doc(uid).get();
      return userDoc.exists ? { uid, ...userDoc.data() } : null;
    }
  } catch (err) {
    handleFirestoreError('getUserProfile', err);
    return null;
  }
}

/**
 * Create or update a user profile.
 * @param {string} uid
 * @param {Object} data - { email, role, fullName }
 * @returns {Promise<Object>}
 */
async function upsertUserProfile(uid, data) {
  const profileData = {
    email: data.email || '',
    role: data.role || 'patient',
    fullName: data.fullName || '',
    doctorId: data.doctorId || null,
    updatedAt: new Date().toISOString(),
  };

  if (!db) {
    console.log(`[Firestore stub] Upsert user profile: ${uid}`, profileData);
    return { uid, ...profileData };
  }

  try {
    if (isClientSdk) {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, profileData);
      } else {
        await setDoc(userRef, { ...profileData, createdAt: new Date().toISOString() });
      }
    } else {
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (snap.exists) {
        await userRef.update(profileData);
      } else {
        await userRef.set({ ...profileData, createdAt: new Date().toISOString() });
      }
    }
    console.log(`[Firestore] Upserted user profile: ${uid}`);
    return { uid, ...profileData };
  } catch (err) {
    handleFirestoreError('upsertUserProfile', err);
    return { uid, ...profileData };
  }
}

/**
 * Assign a patient to a doctor by patient email.
 * @param {string} patientEmail
 * @param {string} doctorUid
 * @returns {Promise<Object|null>}
 */
async function assignPatientToDoctor(patientEmail, doctorUid) {
  if (!db) {
    console.log(`[Firestore stub] Assign patient ${patientEmail} to doctor ${doctorUid}`);
    return null;
  }

  try {
    if (isClientSdk) {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', patientEmail), where('role', '==', 'patient'));
      const snap = await getDocs(q);
      if (snap.empty) return null;

      const patientDoc = snap.docs[0];
      const patientRef = doc(db, 'users', patientDoc.id);
      await updateDoc(patientRef, { doctorId: doctorUid });
      return { uid: patientDoc.id, ...patientDoc.data(), doctorId: doctorUid };
    } else {
      const snap = await db.collection('users')
        .where('email', '==', patientEmail)
        .where('role', '==', 'patient')
        .limit(1)
        .get();

      if (snap.empty) return null;

      const patientDoc = snap.docs[0];
      await patientDoc.ref.update({ doctorId: doctorUid });
      return { uid: patientDoc.id, ...patientDoc.data(), doctorId: doctorUid };
    }
  } catch (err) {
    handleFirestoreError('assignPatientToDoctor', err);
    return null;
  }
}

/**
 * Get all patients assigned to a doctor.
 * @param {string} doctorUid
 * @returns {Promise<Array>}
 */
async function getPatientsForDoctor(doctorUid) {
  if (!db) return [];

  try {
    if (isClientSdk) {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('doctorId', '==', doctorUid));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    } else {
      const snap = await db.collection('users')
        .where('doctorId', '==', doctorUid)
        .get();
      return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    }
  } catch (err) {
    handleFirestoreError('getPatientsForDoctor', err);
    return [];
  }
}

/**
 * Retrieve all sessions for a specific patient.
 * @param {string} patientId
 * @returns {Promise<Array>}
 */
async function getSessionsByPatient(patientId) {
  if (!db) return [];

  try {
    if (isClientSdk) {
      const sessionsRef = collection(db, 'sessions');
      const q = query(sessionsRef, where('patientId', '==', patientId));
      const snap = await getDocs(q);
      const sessions = snap.docs.map(d => ({ sessionId: d.id, ...d.data() }));
      sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
      return sessions;
    } else {
      const snap = await db.collection('sessions')
        .where('patientId', '==', patientId)
        .get();
      const sessions = snap.docs.map(d => ({ sessionId: d.id, ...d.data() }));
      sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
      return sessions;
    }
  } catch (err) {
    handleFirestoreError('getSessionsByPatient', err);
    return [];
  }
}

/**
 * Exercise CRUD functions
 */
async function getExercises(userUid = null) {
  if (!db) return [];

  try {
    if (isClientSdk) {
      const exercisesRef = collection(db, 'exercises');
      const snap = await getDocs(exercisesRef);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const snap = await db.collection('exercises').get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    handleFirestoreError('getExercises', err);
    return [];
  }
}

async function getExerciseById(exerciseId) {
  if (!db) return null;

  try {
    if (isClientSdk) {
      const docRef = doc(db, 'exercises', exerciseId);
      const snap = await getDoc(docRef);
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    } else {
      const snap = await db.collection('exercises').doc(exerciseId).get();
      return snap.exists ? { id: snap.id, ...snap.data() } : null;
    }
  } catch (err) {
    handleFirestoreError('getExerciseById', err);
    return null;
  }
}

async function createExercise(exerciseData) {
  if (!db) return exerciseData;

  try {
    const exerciseId = exerciseData.id || `custom_${Date.now()}`;
    const payload = {
      ...exerciseData,
      id: exerciseId,
      createdAt: new Date().toISOString(),
    };

    if (isClientSdk) {
      const docRef = doc(db, 'exercises', exerciseId);
      await setDoc(docRef, payload);
      return payload;
    } else {
      await db.collection('exercises').doc(exerciseId).set(payload);
      return payload;
    }
  } catch (err) {
    handleFirestoreError('createExercise', err);
    return null;
  }
}

/**
 * Assignment CRUD functions
 */
async function getAssignedExercises(patientId) {
  if (!db) return [];

  try {
    if (isClientSdk) {
      const ref = collection(db, 'assignedExercises');
      const q = query(ref, where('patientId', '==', patientId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const snap = await db.collection('assignedExercises')
        .where('patientId', '==', patientId)
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    handleFirestoreError('getAssignedExercises', err);
    return [];
  }
}

async function getAssignmentsByDoctor(doctorId) {
  if (!db) return [];

  try {
    if (isClientSdk) {
      const ref = collection(db, 'assignedExercises');
      const q = query(ref, where('doctorId', '==', doctorId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const snap = await db.collection('assignedExercises')
        .where('doctorId', '==', doctorId)
        .get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    handleFirestoreError('getAssignmentsByDoctor', err);
    return [];
  }
}

async function assignExercise(assignmentData) {
  if (!db) return assignmentData;

  try {
    const id = `assign_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      ...assignmentData,
      createdAt: new Date().toISOString(),
    };

    if (isClientSdk) {
      const docRef = doc(db, 'assignedExercises', id);
      await setDoc(docRef, payload);
      return { id, ...payload };
    } else {
      await db.collection('assignedExercises').doc(id).set(payload);
      return { id, ...payload };
    }
  } catch (err) {
    handleFirestoreError('assignExercise', err);
    return null;
  }
}

module.exports = {
  createSession,
  logRep,
  getSession,
  getSessionsByPatient,
  getUserProfile,
  upsertUserProfile,
  assignPatientToDoctor,
  getPatientsForDoctor,
  getExercises,
  getExerciseById,
  createExercise,
  getAssignedExercises,
  getAssignmentsByDoctor,
  assignExercise,
};

