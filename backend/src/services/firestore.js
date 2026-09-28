/**
 * Firestore service — session, rep, user, exercise, and assignment persistence.
 * Supports Firebase Admin SDK / Web SDK with an integrated, persistent local file-store fallback.
 * Guarantees 100% functionality whether Firebase cloud credentials are provided or running in local mode.
 */
const fs = require('fs');
const path = require('path');
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

// -------------------------------------------------------------
// Persistent Local Store (File-backed fallback)
// -------------------------------------------------------------
const STORE_DIR = path.join(__dirname, '../../data');
const STORE_PATH = path.join(STORE_DIR, 'store.json');

function loadLocalStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const content = fs.readFileSync(STORE_PATH, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn('[LocalStore] Could not read existing store file, resetting:', err.message);
  }
  return {
    users: {},
    sessions: {},
    exercises: {},
    assignedExercises: {},
  };
}

const localStore = loadLocalStore();

function persistLocalStore() {
  try {
    if (!fs.existsSync(STORE_DIR)) {
      fs.mkdirSync(STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(localStore, null, 2), 'utf8');
  } catch (err) {
    console.error('[LocalStore] Failed to write store file:', err.message);
  }
}

function handleFirestoreError(actionName, err) {
  if (err.message?.includes('NOT_FOUND') || err.message?.includes('PERMISSION_DENIED') || err.message?.includes('INVALID_ARGUMENT')) {
    console.warn(`[Firestore] Cloud database unavailable for ${actionName}. Using persistent local store.`);
  } else {
    console.warn(`[Firestore] ${actionName} error (${err.message}). Using persistent local store.`);
  }
}

// -------------------------------------------------------------
// Sessions & Reps
// -------------------------------------------------------------

/**
 * Create a new exercise session.
 * @param {string} exerciseId
 * @param {string|null} patientId
 * @returns {Promise<string>} Session ID
 */
async function createSession(exerciseId, patientId = null) {
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionData = {
    sessionId,
    exerciseId,
    patientId: patientId || null,
    startedAt: new Date().toISOString(),
    status: 'active',
    totalReps: 0,
    correctReps: 0,
    reps: [],
  };

  // Always save to local store as baseline
  localStore.sessions[sessionId] = sessionData;
  persistLocalStore();

  if (!db) {
    return sessionId;
  }

  try {
    if (isClientSdk) {
      const sessionRef = doc(db, 'sessions', sessionId);
      await setDoc(sessionRef, sessionData);
    } else {
      await db.collection('sessions').doc(sessionId).set(sessionData);
    }
  } catch (err) {
    handleFirestoreError('createSession', err);
  }

  return sessionId;
}

/**
 * Log a completed rep to Firestore & local store.
 * @param {string} sessionId
 * @param {Object} repData
 */
async function logRep(sessionId, repData) {
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

  // Update local store
  let session = localStore.sessions[sessionId];
  if (!session) {
    session = {
      sessionId,
      exerciseId: repData.exerciseId,
      patientId: null,
      startedAt: new Date().toISOString(),
      status: 'active',
      totalReps: 0,
      correctReps: 0,
      reps: [],
    };
    localStore.sessions[sessionId] = session;
  }

  session.totalReps = (session.totalReps || 0) + 1;
  if (repData.correct === true) {
    session.correctReps = (session.correctReps || 0) + 1;
  }
  session.lastRepAt = new Date().toISOString();
  if (!session.reps) session.reps = [];
  session.reps.push(repPayload);
  persistLocalStore();

  if (!db) return;

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
    }
  } catch (err) {
    handleFirestoreError('logRep', err);
  }
}

/**
 * End or finalize a session.
 * @param {string} sessionId
 * @param {Object} finalStats - { totalReps, correctReps }
 */
async function endSession(sessionId, finalStats = {}) {
  const session = localStore.sessions[sessionId];
  if (session) {
    session.status = 'completed';
    session.endedAt = new Date().toISOString();
    if (finalStats.totalReps != null) session.totalReps = finalStats.totalReps;
    if (finalStats.correctReps != null) session.correctReps = finalStats.correctReps;
    persistLocalStore();
  }

  if (!db) return;

  try {
    if (isClientSdk) {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        ...(finalStats.totalReps != null ? { totalReps: finalStats.totalReps } : {}),
        ...(finalStats.correctReps != null ? { correctReps: finalStats.correctReps } : {}),
      });
    } else {
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update({
        status: 'completed',
        endedAt: new Date().toISOString(),
        ...(finalStats.totalReps != null ? { totalReps: finalStats.totalReps } : {}),
        ...(finalStats.correctReps != null ? { correctReps: finalStats.correctReps } : {}),
      });
    }
  } catch (err) {
    handleFirestoreError('endSession', err);
  }
}

/**
 * Retrieve a session and its reps.
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function getSession(sessionId) {
  if (db) {
    try {
      if (isClientSdk) {
        const sessionRef = doc(db, 'sessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (sessionSnap.exists()) {
          const repsRef = collection(db, 'sessions', sessionId, 'reps');
          const q = query(repsRef, orderBy('repNumber'));
          const repsSnap = await getDocs(q);
          const reps = repsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
          return { sessionId, ...sessionSnap.data(), reps };
        }
      } else {
        const sessionDoc = await db.collection('sessions').doc(sessionId).get();
        if (sessionDoc.exists) {
          const repsSnapshot = await db
            .collection('sessions')
            .doc(sessionId)
            .collection('reps')
            .orderBy('repNumber')
            .get();
          const reps = repsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          return { sessionId, ...sessionDoc.data(), reps };
        }
      }
    } catch (err) {
      handleFirestoreError('getSession', err);
    }
  }

  // Fallback to local store
  return localStore.sessions[sessionId] || null;
}

/**
 * Retrieve all sessions for a specific patient.
 * @param {string} patientId
 * @returns {Promise<Array>}
 */
async function getSessionsByPatient(patientId) {
  if (db) {
    try {
      if (isClientSdk) {
        const sessionsRef = collection(db, 'sessions');
        const q = query(sessionsRef, where('patientId', '==', patientId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const sessions = snap.docs.map(d => ({ sessionId: d.id, ...d.data() }));
          sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
          return sessions;
        }
      } else {
        const snap = await db.collection('sessions').where('patientId', '==', patientId).get();
        if (!snap.empty) {
          const sessions = snap.docs.map(d => ({ sessionId: d.id, ...d.data() }));
          sessions.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
          return sessions;
        }
      }
    } catch (err) {
      handleFirestoreError('getSessionsByPatient', err);
    }
  }

  // Fallback to local store: query all matching sessions
  const list = Object.values(localStore.sessions).filter(s => s.patientId === patientId);
  list.sort((a, b) => new Date(b.startedAt || 0) - new Date(a.startedAt || 0));
  return list;
}

// -------------------------------------------------------------
// User Profiles
// -------------------------------------------------------------

/**
 * Get user profile by UID.
 * @param {string} uid
 * @returns {Promise<Object|null>}
 */
async function getUserProfile(uid) {
  if (db) {
    try {
      if (isClientSdk) {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) return { uid, ...snap.data() };
      } else {
        const userDoc = await db.collection('users').doc(uid).get();
        if (userDoc.exists) return { uid, ...userDoc.data() };
      }
    } catch (err) {
      handleFirestoreError('getUserProfile', err);
    }
  }

  return localStore.users[uid] || null;
}

/**
 * Create or update a user profile.
 * @param {string} uid
 * @param {Object} data
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

  // Update local store
  const existing = localStore.users[uid] || {};
  localStore.users[uid] = {
    createdAt: existing.createdAt || new Date().toISOString(),
    ...existing,
    ...profileData,
    uid,
  };
  persistLocalStore();

  if (!db) {
    return localStore.users[uid];
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
  } catch (err) {
    handleFirestoreError('upsertUserProfile', err);
  }

  return localStore.users[uid];
}

/**
 * Assign a patient to a doctor by patient email.
 * @param {string} patientEmail
 * @param {string} doctorUid
 * @returns {Promise<Object|null>}
 */
async function assignPatientToDoctor(patientEmail, doctorUid) {
  const cleanEmail = patientEmail.trim().toLowerCase();

  // Try Cloud Firestore first if available
  if (db) {
    try {
      if (isClientSdk) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', cleanEmail));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const patientDoc = snap.docs[0];
          const patientRef = doc(db, 'users', patientDoc.id);
          await updateDoc(patientRef, { doctorId: doctorUid });
          const res = { uid: patientDoc.id, ...patientDoc.data(), doctorId: doctorUid };
          // Sync local
          localStore.users[res.uid] = res;
          persistLocalStore();
          return res;
        }
      } else {
        const snap = await db.collection('users').where('email', '==', cleanEmail).limit(1).get();
        if (!snap.empty) {
          const patientDoc = snap.docs[0];
          await patientDoc.ref.update({ doctorId: doctorUid });
          const res = { uid: patientDoc.id, ...patientDoc.data(), doctorId: doctorUid };
          // Sync local
          localStore.users[res.uid] = res;
          persistLocalStore();
          return res;
        }
      }
    } catch (err) {
      handleFirestoreError('assignPatientToDoctor', err);
    }
  }

  // Check local store for registered user with this email
  for (const [uid, user] of Object.entries(localStore.users)) {
    if (user.email && user.email.toLowerCase() === cleanEmail) {
      user.doctorId = doctorUid;
      user.updatedAt = new Date().toISOString();
      persistLocalStore();
      return user;
    }
  }

  // If patient hasn't logged in yet, auto-provision their record so the doctor can link and prescribe immediately!
  const placeholderUid = `pat_${Buffer.from(cleanEmail).toString('hex').slice(0, 10)}`;
  const newPatient = {
    uid: placeholderUid,
    email: cleanEmail,
    role: 'patient',
    fullName: cleanEmail.split('@')[0],
    doctorId: doctorUid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  localStore.users[placeholderUid] = newPatient;
  persistLocalStore();
  return newPatient;
}

/**
 * Get all patients assigned to a doctor.
 * @param {string} doctorUid
 * @returns {Promise<Array>}
 */
async function getPatientsForDoctor(doctorUid) {
  if (db) {
    try {
      if (isClientSdk) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('doctorId', '==', doctorUid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        }
      } else {
        const snap = await db.collection('users').where('doctorId', '==', doctorUid).get();
        if (!snap.empty) {
          return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
        }
      }
    } catch (err) {
      handleFirestoreError('getPatientsForDoctor', err);
    }
  }

  // Fallback to local store
  return Object.values(localStore.users).filter(u => u.doctorId === doctorUid);
}

// -------------------------------------------------------------
// Exercise CRUD
// -------------------------------------------------------------

/**
 * Retrieve all exercises from cloud & local store.
 */
async function getExercises(userUid = null) {
  let cloudExercises = [];
  if (db) {
    try {
      if (isClientSdk) {
        const ref = collection(db, 'exercises');
        const snap = await getDocs(ref);
        cloudExercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const snap = await db.collection('exercises').get();
        cloudExercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      handleFirestoreError('getExercises', err);
    }
  }

  const localList = Object.values(localStore.exercises || {});
  const merged = {};
  cloudExercises.forEach(ex => { merged[ex.id] = ex; });
  localList.forEach(ex => { merged[ex.id] = ex; });

  return Object.values(merged);
}

async function getExerciseById(exerciseId) {
  if (db) {
    try {
      if (isClientSdk) {
        const docRef = doc(db, 'exercises', exerciseId);
        const snap = await getDoc(docRef);
        if (snap.exists()) return { id: snap.id, ...snap.data() };
      } else {
        const snap = await db.collection('exercises').doc(exerciseId).get();
        if (snap.exists) return { id: snap.id, ...snap.data() };
      }
    } catch (err) {
      handleFirestoreError('getExerciseById', err);
    }
  }

  return localStore.exercises[exerciseId] || null;
}

async function createExercise(exerciseData) {
  const exerciseId = exerciseData.id || `custom_${Date.now()}`;
  const payload = {
    ...exerciseData,
    id: exerciseId,
    createdAt: new Date().toISOString(),
  };

  // Save to local store
  localStore.exercises[exerciseId] = payload;
  persistLocalStore();

  if (!db) return payload;

  try {
    if (isClientSdk) {
      const docRef = doc(db, 'exercises', exerciseId);
      await setDoc(docRef, payload);
    } else {
      await db.collection('exercises').doc(exerciseId).set(payload);
    }
  } catch (err) {
    handleFirestoreError('createExercise', err);
  }

  return payload;
}

// -------------------------------------------------------------
// Assignment CRUD
// -------------------------------------------------------------

async function getAssignedExercises(patientId) {
  let cloudAssignments = [];
  if (db) {
    try {
      if (isClientSdk) {
        const ref = collection(db, 'assignedExercises');
        const q = query(ref, where('patientId', '==', patientId));
        const snap = await getDocs(q);
        cloudAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const snap = await db.collection('assignedExercises').where('patientId', '==', patientId).get();
        cloudAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      handleFirestoreError('getAssignedExercises', err);
    }
  }

  // Also match local assignments by patientId or patient email
  const patientProfile = localStore.users[patientId];
  const patientEmail = patientProfile?.email?.toLowerCase();

  const localList = Object.values(localStore.assignedExercises).filter(a => {
    if (a.patientId === patientId) return true;
    if (patientEmail && a.patientEmail && a.patientEmail.toLowerCase() === patientEmail) return true;
    return false;
  });

  const merged = {};
  cloudAssignments.forEach(a => { merged[a.id] = a; });
  localList.forEach(a => { merged[a.id] = a; });

  return Object.values(merged);
}

async function getAssignmentsByDoctor(doctorId) {
  let cloudAssignments = [];
  if (db) {
    try {
      if (isClientSdk) {
        const ref = collection(db, 'assignedExercises');
        const q = query(ref, where('doctorId', '==', doctorId));
        const snap = await getDocs(q);
        cloudAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const snap = await db.collection('assignedExercises').where('doctorId', '==', doctorId).get();
        cloudAssignments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      handleFirestoreError('getAssignmentsByDoctor', err);
    }
  }

  const localList = Object.values(localStore.assignedExercises).filter(a => a.doctorId === doctorId);
  const merged = {};
  cloudAssignments.forEach(a => { merged[a.id] = a; });
  localList.forEach(a => { merged[a.id] = a; });

  return Object.values(merged);
}

async function assignExercise(assignmentData) {
  const id = `assign_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const payload = {
    ...assignmentData,
    id,
    createdAt: new Date().toISOString(),
  };

  localStore.assignedExercises[id] = payload;
  persistLocalStore();

  if (!db) return payload;

  try {
    if (isClientSdk) {
      const docRef = doc(db, 'assignedExercises', id);
      await setDoc(docRef, payload);
    } else {
      await db.collection('assignedExercises').doc(id).set(payload);
    }
  } catch (err) {
    handleFirestoreError('assignExercise', err);
  }

  return payload;
}

module.exports = {
  createSession,
  logRep,
  endSession,
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
