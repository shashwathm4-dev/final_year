const path = require('path');
const os = require('os');
const fs = require('fs');

// 1. Set environment variables BEFORE any app imports
process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_DEV_AUTH = 'true';
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
Object.keys(process.env).forEach((key) => {
  if (key.startsWith('FIREBASE_')) delete process.env[key];
});

const testStorePath = path.join(os.tmpdir(), `test_store_${process.pid}_${Date.now()}.json`);
process.env.LOCAL_STORE_PATH = testStorePath;

// Import app and services
const request = require('supertest');
const app = require('../../src/server');
const firestore = require('../../src/services/firestore');

function makeToken(uid, role, name, email) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    user_id: uid,
    role,
    name: name || `User ${uid}`,
    email: email || `${uid}@example.com`,
  })).toString('base64url');
  return `${header}.${payload}.sig`;
}

async function seedTestUsers() {
  // Clear any existing local store state
  firestore._resetLocalStore();

  // Create doctorA
  await firestore.upsertUserProfile('docA', {
    role: 'doctor',
    fullName: 'Dr. Alice',
    email: 'dora@example.com',
  });

  // Create doctorB
  await firestore.upsertUserProfile('docB', {
    role: 'doctor',
    fullName: 'Dr. Bob',
    email: 'dorb@example.com',
  });

  // Create patient1 assigned to docA
  await firestore.upsertUserProfile('pat1', {
    role: 'patient',
    fullName: 'Patient One',
    email: 'pat1@example.com',
    doctorId: 'docA',
  });

  // Create patient2 unassigned
  await firestore.upsertUserProfile('pat2', {
    role: 'patient',
    fullName: 'Patient Two',
    email: 'pat2@example.com',
  });

  // Create clinic with docA as admin, docB as member
  await firestore.saveClinic({
    id: 'clinic1',
    name: 'Wellness Clinic',
    inviteCode: 'WELL123',
    ownerId: 'docA',
    adminId: 'docA',
    members: {
      docA: { role: 'admin', joinedAt: new Date().toISOString() },
      docB: { role: 'member', joinedAt: new Date().toISOString() },
    },
    memberIds: ['docA', 'docB'],
  });

  await firestore.setUserFields('docA', { clinicId: 'clinic1', clinicRole: 'admin' });
  await firestore.setUserFields('docB', { clinicId: 'clinic1', clinicRole: 'member' });
}

function resetStore() {
  firestore._resetLocalStore();
  if (fs.existsSync(testStorePath)) {
    try { fs.unlinkSync(testStorePath); } catch (_) {}
  }
}

function as(uid, role) {
  const token = makeToken(uid, role);
  return {
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    put: (url) => request(app).put(url).set('Authorization', `Bearer ${token}`),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
    patch: (url) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
  };
}

module.exports = {
  app,
  request,
  makeToken,
  seedTestUsers,
  resetStore,
  as,
  firestore,
};
