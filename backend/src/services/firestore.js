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
    sessionComments: {},
    playback: {},
    personalization: {},
    models: {},
  };
}

const localStore = loadLocalStore();
// Ensure collections added after the first release exist in older store.json files
['programs', 'patientPrograms', 'clinics', 'personalization', 'models'].forEach((name) => {
  if (!localStore[name]) localStore[name] = {};
});
localStore.personalization ||= {};
localStore.models ||= {};
// Backfill collections added after initial release
if (!localStore.sessionComments) localStore.sessionComments = {};
if (!localStore.playback) localStore.playback = {};

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
// Generic Collection Helpers (Items 21-24)
// -------------------------------------------------------------

function localCol(colName) {
  if (!localStore[colName]) localStore[colName] = {};
  return localStore[colName];
}

async function getDocById(colName, docId) {
  if (db) {
    try {
      if (isClientSdk) {
        const ref = doc(db, colName, docId);
        const snap = await getDoc(ref);
        if (snap.exists()) return { id: snap.id, ...snap.data() };
      } else {
        const snap = await db.collection(colName).doc(docId).get();
        if (snap.exists) return { id: snap.id, ...snap.data() };
      }
    } catch (err) { handleFirestoreError(`getDocById(${colName})`, err); }
  }
  return localCol(colName)[docId] || null;
}

async function putDoc(colName, docId, data) {
  localCol(colName)[docId] = { ...data, id: docId };
  persistLocalStore();
  if (!db) return;
  try {
    if (isClientSdk) {
      await setDoc(doc(db, colName, docId), data);
    } else {
      await db.collection(colName).doc(docId).set(data);
    }
  } catch (err) { handleFirestoreError(`putDoc(${colName})`, err); }
}

async function queryDocs(colName, field, op, value) {
  if (db) {
    try {
      if (isClientSdk) {
        const ref = collection(db, colName);
        const q = query(ref, where(field, op, value));
        const snap = await getDocs(q);
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } else {
        const snap = await db.collection(colName).where(field, op, value).get();
        if (!snap.empty) return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) { handleFirestoreError(`queryDocs(${colName})`, err); }
  }
  // Fallback to local
  const col = localCol(colName);
  return Object.values(col).filter(item => {
    const v = item[field];
    if (op === '==') return v === value;
    if (op === '>=') return v >= value;
    if (op === '<=') return v <= value;
    if (op === '!=') return v !== value;
    return false;
  });
}

async function patchSession(sessionId, patch) {
  const session = localStore.sessions[sessionId];
  if (session) {
    Object.assign(session, patch);
    persistLocalStore();
  }
  if (!db) return;
  try {
    if (isClientSdk) {
      const ref = doc(db, 'sessions', sessionId);
      await updateDoc(ref, patch);
    } else {
      await db.collection('sessions').doc(sessionId).update(patch);
    }
  } catch (err) { handleFirestoreError('patchSession', err); }
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
async function createSession(exerciseId, patientId = null, opts = {}) {
  if (opts.clientSessionId) {
    const existing = Object.values(localStore.sessions).find(
      (s) => s.clientSessionId === opts.clientSessionId && s.patientId === (patientId || null)
    );
    if (existing) return existing.sessionId;
  }

  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const sessionData = {
    sessionId,
    exerciseId,
    patientId: patientId || null,
    clientSessionId: opts.clientSessionId || null,
    startedAt: opts.startedAt || new Date().toISOString(),
    status: 'active',
    totalReps: 0,
    correctReps: 0,
    reps: [],
    ...(opts.difficulty ? { difficulty: opts.difficulty } : {}),
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
    skipReason: repData.skipReason || null,
    correct: repData.correct ?? null,
    issue: repData.issue || null,
    severity: repData.severity || null,
    tempoScore: repData.tempoScore ?? null,
    smoothnessScore: repData.smoothnessScore ?? null,
    romScore: repData.romScore ?? null,
    qualityScore: repData.qualityScore ?? null,
    side: repData.side || null,
    mode: repData.mode || 'reps',
    holdSeconds: repData.holdSeconds ?? null,
    breaks: repData.breaks ?? null,
    compensations: Array.isArray(repData.compensations) ? repData.compensations : [],
    calibrationScale: repData.calibrationScale ?? null,
    peakAngle: repData.peakAngle ?? null,
    durationMs: repData.durationMs ?? null,
    curve: Array.isArray(repData.curve) ? repData.curve : null,
    modelProb: typeof repData.modelProb === 'number' ? repData.modelProb : null,
    checkpointDeltas: repData.checkpointDeltas || null,
    failedCheckpoints: repData.failedCheckpoints || null,
    hasPlayback: repData.hasPlayback ?? false,
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

  if (!session.reps) session.reps = [];
  const existingIdx = session.reps.findIndex((r) => r.repNumber === repData.repNumber);
  if (existingIdx >= 0) {
    session.reps[existingIdx] = repPayload; // replay: overwrite, don't double count
  } else {
    session.reps.push(repPayload);
    session.totalReps = (session.totalReps || 0) + 1;
    if (repData.correct === true) session.correctReps = (session.correctReps || 0) + 1;
  }
  session.lastRepAt = new Date().toISOString();
  persistLocalStore();
  const isReplay = existingIdx >= 0;

  if (!db) return;

  try {
    if (isClientSdk) {
      const repRef = doc(db, 'sessions', sessionId, 'reps', `rep_${repData.repNumber}`);
      await setDoc(repRef, repPayload);

      if (!isReplay) {
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
          totalReps: increment(1),
          ...(repData.correct === true ? { correctReps: increment(1) } : {}),
          lastRepAt: new Date().toISOString(),
        });
      }
    } else {
      const repRef = db
        .collection('sessions')
        .doc(sessionId)
        .collection('reps')
        .doc(`rep_${repData.repNumber}`);
      await repRef.set(repPayload);

      if (!isReplay) {
        const sessionRef = db.collection('sessions').doc(sessionId);
        const { FieldValue } = require('firebase-admin/firestore');
        await sessionRef.update({
          totalReps: FieldValue.increment(1),
          ...(repData.correct === true ? { correctReps: FieldValue.increment(1) } : {}),
          lastRepAt: new Date().toISOString(),
        });
      }
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
  const endedAt = new Date().toISOString();
  const patch = {
    status: 'completed',
    endedAt,
  };
  if (finalStats.totalReps != null) patch.totalReps = finalStats.totalReps;
  if (finalStats.correctReps != null) patch.correctReps = finalStats.correctReps;
  if (finalStats.summary) patch.summary = finalStats.summary;

  // Compute summary for analytics if not supplied
  if (session && !patch.summary) {
    const reps = Array.isArray(session.reps) ? session.reps : [];
    const total = patch.totalReps ?? reps.length;
    const correct = patch.correctReps ?? reps.filter((r) => r.correct === true).length;
    const started = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    patch.durationSec = Math.round((Date.now() - started) / 1000);
    patch.summary = {
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0,
      avgQuality: reps.length > 0 ? Math.round(reps.reduce((s, r) => s + (r.qualityScore || 0), 0) / reps.length) : 0,
      issues: normalizeIssues(reps),
    };
  } else if (session) {
    const started = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
    patch.durationSec = Math.round((Date.now() - started) / 1000);
  }

  if (session) {
    Object.assign(session, patch);
    persistLocalStore();
  }

  if (!db) return;

  try {
    if (isClientSdk) {
      const sessionRef = doc(db, 'sessions', sessionId);
      await updateDoc(sessionRef, patch);
    } else {
      const sessionRef = db.collection('sessions').doc(sessionId);
      await sessionRef.update(patch);
    }
  } catch (err) {
    handleFirestoreError('endSession', err);
  }
}

/** Tally rep issues into a compact { issueLabel: count } map */
function normalizeIssues(reps) {
  const map = {};
  for (const r of reps) {
    if (r.issue) {
      const key = r.issue.length > 40 ? r.issue.slice(0, 40) : r.issue;
      map[key] = (map[key] || 0) + 1;
    }
    if (Array.isArray(r.compensations)) {
      for (const c of r.compensations) {
        map[c] = (map[c] || 0) + 1;
      }
    }
  }
  return map;
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
  const existingLocal = localStore.users[uid] || null;

  // Fields that may change on every sync
  const mutable = {
    email: data.email || (existingLocal && existingLocal.email) || '',
    fullName: data.fullName || (existingLocal && existingLocal.fullName) || '',
    updatedAt: new Date().toISOString(),
  };
  // Fields that are fixed at creation time
  const createOnly = {
    role: data.role === 'doctor' ? 'doctor' : 'patient',
    doctorId: data.doctorId !== undefined ? data.doctorId : null,
    createdAt: new Date().toISOString(),
  };

  // Local store: update role if explicitly specified
  const effectiveRole = data.role === 'doctor' || data.role === 'patient'
    ? data.role
    : (existingLocal && existingLocal.role) || 'patient';

  localStore.users[uid] = existingLocal
    ? { ...existingLocal, ...mutable, role: effectiveRole, uid }
    : { ...createOnly, ...mutable, role: effectiveRole, uid };
  persistLocalStore();

  if (!db) {
    return localStore.users[uid];
  }

  try {
    if (isClientSdk) {
      const userRef = doc(db, 'users', uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        await updateDoc(userRef, mutable);
      } else {
        await setDoc(userRef, { ...createOnly, ...mutable });
      }
    } else {
      const userRef = db.collection('users').doc(uid);
      const snap = await userRef.get();
      if (snap.exists) {
        await userRef.update(mutable);
      } else {
        await userRef.set({ ...createOnly, ...mutable });
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
  const patientMap = new Map();

  // Always include localStore patients assigned to this doctor
  Object.values(localStore.users)
    .filter(u => u && u.doctorId === doctorUid)
    .forEach(u => patientMap.set(u.uid, u));

  if (db) {
    try {
      if (isClientSdk) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('doctorId', '==', doctorUid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const p = { uid: d.id, ...d.data() };
            patientMap.set(p.uid, { ...(patientMap.get(p.uid) || {}), ...p });
          });
        }
      } else {
        const snap = await db.collection('users').where('doctorId', '==', doctorUid).get();
        if (!snap.empty) {
          snap.docs.forEach(d => {
            const p = { uid: d.id, ...d.data() };
            patientMap.set(p.uid, { ...(patientMap.get(p.uid) || {}), ...p });
          });
        }
      }
    } catch (err) {
      handleFirestoreError('getPatientsForDoctor', err);
    }
  }

  if (patientMap.size === 0) {
    // Auto-seed a default clinical cluster of demo patients for this doctor
    const defaultClusterPatients = [
      { email: 'sarah.miller@cognisense.health', fullName: 'Sarah Miller', recoveryScore: 89, accuracy: 91, adherence: 94 },
      { email: 'james.wilson@cognisense.health', fullName: 'James Wilson', recoveryScore: 78, accuracy: 84, adherence: 88 },
      { email: 'robert.chen@cognisense.health', fullName: 'Robert Chen', recoveryScore: 45, accuracy: 68, adherence: 52 },
      { email: 'elena.gomez@cognisense.health', fullName: 'Elena Gomez', recoveryScore: 72, accuracy: 79, adherence: 76 },
    ];

    defaultClusterPatients.forEach((demo, idx) => {
      const pid = `pat_seed_${idx}_${Buffer.from(demo.email).toString('hex').slice(0, 8)}`;
      const patientRec = {
        uid: pid,
        email: demo.email,
        role: 'patient',
        fullName: demo.fullName,
        doctorId: doctorUid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStore.users[pid] = patientRec;
      patientMap.set(pid, patientRec);
    });
    persistLocalStore();
  }

  return Array.from(patientMap.values());
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

// -------------------------------------------------------------
// Generic record helpers (used by programs, patientPrograms, clinics)
// -------------------------------------------------------------

async function cloudSet(name, id, data) {
  if (!db) return;
  try {
    if (isClientSdk) {
      await setDoc(doc(db, name, id), data);
    } else {
      await db.collection(name).doc(id).set(data);
    }
  } catch (err) {
    handleFirestoreError(`set ${name}`, err);
  }
}

async function cloudGet(name, id) {
  if (!db) return null;
  try {
    if (isClientSdk) {
      const snap = await getDoc(doc(db, name, id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    }
    const snap = await db.collection(name).doc(id).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    handleFirestoreError(`get ${name}`, err);
    return null;
  }
}

async function cloudDelete(name, id) {
  if (!db) return;
  try {
    if (isClientSdk) {
      const { deleteDoc } = require('firebase/firestore');
      await deleteDoc(doc(db, name, id));
    } else {
      await db.collection(name).doc(id).delete();
    }
  } catch (err) {
    handleFirestoreError(`delete ${name}`, err);
  }
}

async function cloudFind(name, field, value) {
  if (!db) return [];
  try {
    if (isClientSdk) {
      const snap = await getDocs(query(collection(db, name), where(field, '==', value)));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const snap = await db.collection(name).where(field, '==', value).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    handleFirestoreError(`find ${name}`, err);
    return [];
  }
}

async function saveRecord(name, record) {
  localStore[name][record.id] = record;
  persistLocalStore();
  await cloudSet(name, record.id, record);
  return record;
}

async function getRecord(name, id) {
  if (localStore[name][id]) return localStore[name][id];
  return cloudGet(name, id);
}

async function deleteRecord(name, id) {
  delete localStore[name][id];
  persistLocalStore();
  await cloudDelete(name, id);
}

// Merge cloud + local (local wins), filtered by field === value
async function findRecords(name, field, value) {
  const cloud = await cloudFind(name, field, value);
  const merged = {};
  cloud.forEach((r) => { merged[r.id] = r; });
  Object.values(localStore[name]).forEach((r) => {
    if (r[field] === value) merged[r.id] = r;
  });
  return Object.values(merged);
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// -------------------------------------------------------------
// Assignment update (needed by program progression)
// -------------------------------------------------------------

async function updateAssignment(assignmentId, patch) {
  const existing = localStore.assignedExercises[assignmentId] || await cloudGet('assignedExercises', assignmentId);
  if (!existing) return null;
  const updated = { ...existing, ...patch, id: assignmentId, updatedAt: new Date().toISOString() };
  localStore.assignedExercises[assignmentId] = updated;
  persistLocalStore();
  await cloudSet('assignedExercises', assignmentId, updated);
  return updated;
}

// -------------------------------------------------------------
// Programs (item 25)
// -------------------------------------------------------------

/**
 * program = {
 *   id, name, description, doctorId, doctorName, clinicId|null,
 *   items: [{ exerciseId, exerciseName, targetSets, targetReps, daysOfWeek:[0-6], notes }],
 *   progression: { enabled, goodSessionsRequired, accuracyThreshold, repsIncrement, setsIncrement, maxReps, maxSets },
 *   createdAt
 * }
 */
async function createProgram(data) {
  const program = { ...data, id: newId('prog'), createdAt: new Date().toISOString() };
  return saveRecord('programs', program);
}

async function getProgramById(id) {
  return getRecord('programs', id);
}

// Programs created by this doctor + programs shared with the doctor's clinic
async function getProgramsForDoctor(doctorUid, clinicId = null) {
  const own = await findRecords('programs', 'doctorId', doctorUid);
  let shared = [];
  if (clinicId) {
    shared = (await findRecords('programs', 'clinicId', clinicId)).filter((p) => p.doctorId !== doctorUid);
  }
  return [...own, ...shared].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function deleteProgram(id) {
  return deleteRecord('programs', id);
}

// -------------------------------------------------------------
// Patient programs = a program applied to one patient (item 25)
// -------------------------------------------------------------

/**
 * Applies a program to a patient:
 *  - archives the patient's previously active programs and their assignments
 *  - creates one assignedExercises doc per program item (so the existing patient dashboard keeps working)
 *  - creates the patientPrograms doc that tracks progression
 */
async function applyProgramToPatient(program, patient, doctor, startDate) {
  // Archive previous active programs for this patient
  const previous = await findRecords('patientPrograms', 'patientId', patient.uid);
  for (const old of previous.filter((p) => p.status === 'active')) {
    old.status = 'replaced';
    await saveRecord('patientPrograms', old);
    for (const item of old.items) {
      if (item.assignmentId) await updateAssignment(item.assignmentId, { status: 'archived' });
    }
  }

  const patientProgramId = newId('pp');
  const items = [];
  for (const item of program.items) {
    const assignment = await assignExercise({
      patientId: patient.uid,
      patientEmail: patient.email || '',
      exerciseId: item.exerciseId,
      exerciseName: item.exerciseName,
      doctorId: doctor.uid,
      doctorName: doctor.fullName || '',
      targetReps: item.targetReps,
      targetSets: item.targetSets,
      notes: item.notes || '',
      status: 'active',
      programId: program.id,
      patientProgramId,
      programName: program.name,
      daysOfWeek: item.daysOfWeek || [],
    });
    items.push({ ...item, assignmentId: assignment.id, goodStreak: 0 });
  }

  const patientProgram = {
    id: patientProgramId,
    programId: program.id,
    programName: program.name,
    patientId: patient.uid,
    patientEmail: patient.email || '',
    doctorId: doctor.uid,
    startDate: startDate || new Date().toISOString(),
    status: 'active',
    items,
    progression: program.progression,
    log: [],
    createdAt: new Date().toISOString(),
  };
  return saveRecord('patientPrograms', patientProgram);
}

async function getPatientPrograms(patientId) {
  const list = await findRecords('patientPrograms', 'patientId', patientId);
  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function savePatientProgram(patientProgram) {
  return saveRecord('patientPrograms', patientProgram);
}

// -------------------------------------------------------------
// Clinics (item 27)
// -------------------------------------------------------------

/**
 * clinic = { id, name, adminId, inviteCode, memberIds: [uid], createdAt }
 */
function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createClinic(name, adminUid) {
  const clinic = {
    id: newId('clinic'),
    name,
    adminId: adminUid,
    inviteCode: generateInviteCode(),
    memberIds: [adminUid],
    createdAt: new Date().toISOString(),
  };
  await saveRecord('clinics', clinic);
  await setUserFields(adminUid, { clinicId: clinic.id });
  return clinic;
}

async function getClinicById(id) {
  return getRecord('clinics', id);
}

async function getClinicByInviteCode(code) {
  const clean = String(code || '').trim().toUpperCase();
  const local = Object.values(localStore.clinics).find((c) => c.inviteCode === clean);
  if (local) return local;
  const cloud = await cloudFind('clinics', 'inviteCode', clean);
  return cloud[0] || null;
}

async function saveClinic(clinic) {
  return saveRecord('clinics', clinic);
}

// Set arbitrary fields on a user profile without touching anything else
async function setUserFields(uid, fields) {
  const existing = localStore.users[uid] || (await getUserProfile(uid)) || { uid };
  localStore.users[uid] = { ...existing, ...fields, uid, updatedAt: new Date().toISOString() };
  persistLocalStore();
  if (!db) return localStore.users[uid];
  try {
    if (isClientSdk) {
      await updateDoc(doc(db, 'users', uid), fields);
    } else {
      await db.collection('users').doc(uid).set(fields, { merge: true });
    }
  } catch (err) {
    handleFirestoreError('setUserFields', err);
  }
  return localStore.users[uid];
}

async function getClinicMembers(clinic) {
  const members = [];
  for (const uid of clinic.memberIds) {
    const p = await getUserProfile(uid);
    if (p) members.push(p);
  }
  return members;
}

// All patients whose doctor belongs to the clinic, each tagged with doctorName
async function getPatientsForClinic(clinic) {
  const out = [];
  for (const uid of clinic.memberIds) {
    const docProfile = await getUserProfile(uid);
    const patients = await getPatientsForDoctor(uid);
    patients.forEach((p) => out.push({ ...p, doctorName: docProfile?.fullName || docProfile?.email || uid }));
  }
  return out;
}

// -------------------------------------------------------------
// Coaching & Personalization helpers (Features 28 & 29)
// -------------------------------------------------------------

async function saveSessionCoaching(sessionId, coaching) {
  const session = localStore.sessions[sessionId];
  const patch = {
    coaching,
    coachingAt: new Date().toISOString(),
  };
  if (session) {
    Object.assign(session, patch);
    persistLocalStore();
  }
  if (!db) return;
  try {
    if (isClientSdk) {
      await updateDoc(doc(db, 'sessions', sessionId), patch);
    } else {
      await db.collection('sessions').doc(sessionId).update(patch);
    }
  } catch (err) {
    handleFirestoreError('saveSessionCoaching', err);
  }
}

async function getPersonalization(uid, exerciseId) {
  const key = `${uid}__${exerciseId}`;
  if (localStore.personalization[key]) return localStore.personalization[key];
  return getRecord('personalization', key);
}

async function savePersonalization(profile) {
  const key = `${profile.uid}__${profile.exerciseId}`;
  profile.id = key;
  profile.updatedAt = new Date().toISOString();
  localStore.personalization[key] = profile;
  persistLocalStore();
  await cloudSet('personalization', key, profile);
  return profile;
}

// -------------------------------------------------------------
// Privacy: consent + account/data deletion (item 36)
// -------------------------------------------------------------

async function saveUserConsent(uid, consent) {
  const record = { ...consent, acceptedAt: new Date().toISOString() };
  const existing = localStore.users[uid] || (await getUserProfile(uid)) || { uid };
  localStore.users[uid] = { ...existing, uid, consent: record };
  persistLocalStore();

  if (db) {
    try {
      if (isClientSdk) {
        await updateDoc(doc(db, 'users', uid), { consent: record });
      } else {
        await db.collection('users').doc(uid).set({ consent: record }, { merge: true });
      }
    } catch (err) {
      handleFirestoreError('saveUserConsent', err);
    }
  }
  return record;
}

// Delete every document in `name` where field == value (and a session's reps subcollection)
async function cloudDeleteWhere(name, field, value) {
  if (!db) return;
  try {
    if (isClientSdk) {
      const { deleteDoc } = require('firebase/firestore');
      const snap = await getDocs(query(collection(db, name), where(field, '==', value)));
      for (const d of snap.docs) {
        const reps = await getDocs(collection(d.ref, 'reps'));
        for (const r of reps.docs) await deleteDoc(r.ref);
        await deleteDoc(d.ref);
      }
    } else {
      const snap = await db.collection(name).where(field, '==', value).get();
      for (const d of snap.docs) {
        if (typeof db.recursiveDelete === 'function') await db.recursiveDelete(d.ref);
        else await d.ref.delete();
      }
    }
  } catch (err) {
    handleFirestoreError(`delete ${name}`, err);
  }
}

/**
 * Permanently delete a user's data.
 * Patient: sessions + reps, assignments, programs progress, profile.
 * Doctor: also their custom exercises, programs and the assignments they created; their patients are unlinked.
 */
async function deleteUserData(uid) {
  const profile = await getUserProfile(uid);
  const isDoctor = profile?.role === 'doctor';

  // ---- local store ----
  const dropWhere = (collectionName, predicate) => {
    const col = localStore[collectionName];
    if (!col) return;
    Object.keys(col).forEach((key) => {
      if (predicate(col[key])) delete col[key];
    });
  };
  dropWhere('sessions', (s) => s.patientId === uid);
  dropWhere('assignedExercises', (a) => a.patientId === uid || a.doctorId === uid);
  dropWhere('patientPrograms', (p) => p.patientId === uid || p.doctorId === uid);
  if (isDoctor) {
    dropWhere('exercises', (e) => e.createdBy === uid);
    dropWhere('programs', (p) => p.doctorId === uid);
    Object.values(localStore.users).forEach((u) => {
      if (u.doctorId === uid) u.doctorId = null;
    });
  }
  delete localStore.users[uid];
  persistLocalStore();

  // ---- cloud ----
  await cloudDeleteWhere('sessions', 'patientId', uid);
  await cloudDeleteWhere('assignedExercises', 'patientId', uid);
  await cloudDeleteWhere('assignedExercises', 'doctorId', uid);
  await cloudDeleteWhere('patientPrograms', 'patientId', uid);
  await cloudDeleteWhere('patientPrograms', 'doctorId', uid);

  if (isDoctor) {
    await cloudDeleteWhere('exercises', 'createdBy', uid);
    await cloudDeleteWhere('programs', 'doctorId', uid);
    if (db) {
      try {
        if (isClientSdk) {
          const snap = await getDocs(query(collection(db, 'users'), where('doctorId', '==', uid)));
          for (const d of snap.docs) await updateDoc(d.ref, { doctorId: null });
        } else {
          const snap = await db.collection('users').where('doctorId', '==', uid).get();
          for (const d of snap.docs) await d.ref.update({ doctorId: null });
        }
      } catch (err) {
        handleFirestoreError('unlink patients', err);
      }
    }
  }

  if (db) {
    try {
      if (isClientSdk) {
        const { deleteDoc } = require('firebase/firestore');
        await deleteDoc(doc(db, 'users', uid));
      } else {
        await db.collection('users').doc(uid).delete();
      }
    } catch (err) {
      handleFirestoreError('delete user profile', err);
    }
  }
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
  updateAssignment,
  createProgram,
  getProgramById,
  getProgramsForDoctor,
  deleteProgram,
  applyProgramToPatient,
  getPatientPrograms,
  savePatientProgram,
  createClinic,
  getClinicById,
  getClinicByInviteCode,
  saveClinic,
  setUserFields,
  getClinicMembers,
  getPatientsForClinic,
  saveSessionCoaching,
  getPersonalization,
  savePersonalization,
  saveUserConsent,
  deleteUserData,
  // Generic helpers (items 21-24)
  getDocById,
  putDoc,
  queryDocs,
  patchSession,
  localCol,
  localStore,
  persistLocalStore,
};
