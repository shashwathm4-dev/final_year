/**
 * Firestore service — session and rep logging.
 * Supports both Firebase Admin SDK and Firebase Web JS SDK seamlessly.
 * Gracefully handles unconfigured/offline/uncreated database states.
 */
const { db, isClientSdk } = require('../config/firebase');

// Web SDK helpers (if using client SDK)
let doc, setDoc, updateDoc, getDoc, getDocs, collection, query, orderBy, increment;
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
 * @returns {Promise<string>} Session ID
 */
async function createSession(exerciseId) {
  if (!db) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Firestore stub] Created local session: ${localId}`);
    return localId;
  }

  const sessionData = {
    exerciseId,
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

module.exports = { createSession, logRep, getSession };
