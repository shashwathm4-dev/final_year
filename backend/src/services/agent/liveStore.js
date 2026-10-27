/**
 * liveStore.js
 * In-memory per-user live session store.
 * - Ring buffer of last 120 snapshots (~2 minutes at 1 Hz).
 * - Ring buffer of last 50 events.
 * - Current session metadata: { sessionId, exerciseId, startedAt, lastActivity }.
 * - Idle TTL: 10 minutes. Cleared on session end.
 * - Privacy: numbers and labels only, NO camera frames.
 */

const MAX_SNAPSHOTS = 120;
const MAX_EVENTS = 50;
const IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Map<uid, UserStore>
const userStores = new Map();

function cleanOldStores() {
  const now = Date.now();
  for (const [uid, store] of userStores.entries()) {
    if (now - (store.meta.lastActivity || 0) > IDLE_TTL_MS) {
      userStores.delete(uid);
    }
  }
}

// Prune idle stores periodically
const pruneTimer = setInterval(cleanOldStores, 60 * 1000);
if (pruneTimer.unref) pruneTimer.unref();

function getOrCreateUserStore(uid) {
  let store = userStores.get(uid);
  if (!store) {
    store = {
      meta: {
        sessionId: null,
        exerciseId: null,
        startedAt: null,
        lastActivity: Date.now(),
      },
      snapshots: [],
      events: [],
    };
    userStores.set(uid, store);
  }
  return store;
}

/**
 * Record a live snapshot and optional rep/form events.
 */
function recordLivePush(uid, { sessionId, exerciseId, snapshot, events }) {
  if (!uid) return;
  const store = getOrCreateUserStore(uid);
  const now = Date.now();

  store.meta.lastActivity = now;
  if (sessionId) store.meta.sessionId = sessionId;
  if (exerciseId) store.meta.exerciseId = exerciseId;
  if (!store.meta.startedAt && snapshot?.t) {
    store.meta.startedAt = snapshot.t;
  }

  if (snapshot) {
    const cleanSnapshot = {
      t: snapshot.t || now,
      angle: typeof snapshot.angle === 'number' ? Math.round(snapshot.angle * 10) / 10 : 0,
      state: String(snapshot.state || 'IDLE'),
      repCount: typeof snapshot.repCount === 'number' ? snapshot.repCount : 0,
      liveFlags: Array.isArray(snapshot.liveFlags) ? snapshot.liveFlags.slice(0, 5) : [],
      trackingLost: Boolean(snapshot.trackingLost),
      fatigueLevel: String(snapshot.fatigueLevel || 'none'),
    };
    store.snapshots.push(cleanSnapshot);
    if (store.snapshots.length > MAX_SNAPSHOTS) {
      store.snapshots.shift();
    }
  }

  if (Array.isArray(events)) {
    for (const ev of events) {
      const cleanEvent = {
        type: String(ev.type || 'rep'),
        rep: typeof ev.rep === 'number' ? ev.rep : undefined,
        correct: typeof ev.correct === 'boolean' ? ev.correct : undefined,
        issue: ev.issue ? String(ev.issue).slice(0, 200) : null,
        compensations: Array.isArray(ev.compensations) ? ev.compensations.slice(0, 5) : [],
        peakAngle: typeof ev.peakAngle === 'number' ? Math.round(ev.peakAngle) : undefined,
        qualityScore: typeof ev.qualityScore === 'number' ? Math.round(ev.qualityScore) : undefined,
        romScore: typeof ev.romScore === 'number' ? Math.round(ev.romScore) : undefined,
        durationMs: typeof ev.durationMs === 'number' ? ev.durationMs : undefined,
        at: ev.at || now,
      };
      store.events.push(cleanEvent);
      if (store.events.length > MAX_EVENTS) {
        store.events.shift();
      }
    }
  }
}

/**
 * Get the live store for a user.
 */
function getUserLiveStore(uid) {
  if (!uid) return null;
  const store = userStores.get(uid);
  if (!store) return null;
  // If idle > 10m, drop it
  if (Date.now() - (store.meta.lastActivity || 0) > IDLE_TTL_MS) {
    userStores.delete(uid);
    return null;
  }
  return store;
}

/**
 * Clear user store when session ends or resets.
 */
function clearUserStore(uid) {
  if (!uid) return;
  userStores.delete(uid);
}

/**
 * Reset all stores (useful for tests).
 */
function resetAllStores() {
  userStores.clear();
}

module.exports = {
  recordLivePush,
  getUserLiveStore,
  clearUserStore,
  resetAllStores,
  MAX_SNAPSHOTS,
  MAX_EVENTS,
  IDLE_TTL_MS,
};
