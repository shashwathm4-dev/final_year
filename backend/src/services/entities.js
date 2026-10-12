/**
 * entities.js — Comments and playback data helpers (Items 23-24).
 * Dual-mode: local store + Firestore.
 */
const { getDocById, putDoc, queryDocs, localCol } = require('./firestore');

// ------- Comments (Item 24) -------

async function addComment(sessionId, authorUid, authorRole, text) {
  const id = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const data = {
    id,
    sessionId,
    authorUid,
    authorRole,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    read: false,
  };
  await putDoc('sessionComments', id, data);
  return data;
}

async function getCommentsForSession(sessionId) {
  const docs = await queryDocs('sessionComments', 'sessionId', '==', sessionId);
  docs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return docs;
}

async function markSessionCommentsRead(sessionId, readerUid) {
  const docs = await queryDocs('sessionComments', 'sessionId', '==', sessionId);
  let count = 0;
  for (const d of docs) {
    if (!d.read && d.authorUid !== readerUid) {
      await putDoc('sessionComments', d.id, { ...d, read: true });
      count++;
    }
  }
  return count;
}

async function getUnreadCounts(uid) {
  // Return { [sessionId]: count } for messages NOT authored by uid and not read
  const all = Object.values(localCol('sessionComments'));
  const map = {};
  for (const c of all) {
    if (c.authorUid !== uid && !c.read) {
      map[c.sessionId] = (map[c.sessionId] || 0) + 1;
    }
  }
  return map;
}

// ------- Playback (Item 23) -------

/**
 * Validate + compact a playback payload.
 * landmarks is an array of 33 elements each [x,y,vis], i.e. 99 numbers per frame.
 * We store at most 60 frames (~10fps for 6 seconds).
 */
function validPlayback(payload) {
  if (!payload || !Array.isArray(payload.frames)) return null;
  const frames = payload.frames.slice(0, 60).map((f) => {
    if (!Array.isArray(f.lm) || f.lm.length < 33) return null;
    return {
      t: typeof f.t === 'number' ? f.t : 0,
      a: typeof f.a === 'number' ? Math.round(f.a * 10) / 10 : 0,
      lm: f.lm.slice(0, 33).map((p) => [
        Math.round((p[0] ?? p.x ?? 0) * 10000) / 10000,
        Math.round((p[1] ?? p.y ?? 0) * 10000) / 10000,
        Math.round((p[2] ?? p.visibility ?? 0) * 100) / 100,
      ]),
    };
  }).filter(Boolean);
  if (frames.length === 0) return null;
  return { frames };
}

async function savePlayback(sessionId, repNumber, payload) {
  const docId = `${sessionId}__rep${repNumber}`;
  const compact = validPlayback(payload);
  if (!compact) throw new Error('Invalid playback payload');
  await putDoc('playback', docId, {
    sessionId,
    repNumber,
    ...compact,
    savedAt: new Date().toISOString(),
  });
  return docId;
}

async function getPlayback(sessionId, repNumber) {
  const docId = `${sessionId}__rep${repNumber}`;
  return getDocById('playback', docId);
}

module.exports = {
  addComment,
  getCommentsForSession,
  markSessionCommentsRead,
  getUnreadCounts,
  validPlayback,
  savePlayback,
  getPlayback,
};
