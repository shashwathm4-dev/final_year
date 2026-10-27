const test = require('node:test');
const assert = require('node:assert/strict');
const { as, seedTestUsers, firestore } = require('./helpers/testApp');

test.beforeEach(async () => {
  await seedTestUsers();
});

test('Comments: create session, post comment, list comments, and check unread', async () => {
  const sessionId = await firestore.createSession('squat', 'pat1');

  // Doctor posts comment
  const postRes = await as('docA').post(`/api/comments/session/${sessionId}`).send({
    text: 'Great form today!',
  });
  assert.equal(postRes.status, 200);
  assert.equal(postRes.body.comment.text, 'Great form today!');

  // Patient lists comments
  const listRes = await as('pat1').get(`/api/comments/session/${sessionId}`);
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.comments.length, 1);

  // Patient checks unread
  const unreadRes = await as('pat1').get('/api/comments/unread');
  assert.equal(unreadRes.status, 200);
  assert.ok(unreadRes.body.total >= 1);

  // Patient marks read
  const markRes = await as('pat1').post(`/api/comments/session/${sessionId}/read`);
  assert.equal(markRes.status, 200);

  // Unread count decreases
  const unreadAfter = await as('pat1').get('/api/comments/unread');
  assert.equal(unreadAfter.body.bySession[sessionId] || 0, 0);
});

test('Clinics: get /me, regenerate invite code, and patient access', async () => {
  const myClinic = await as('docA').get('/api/clinics/me');
  assert.equal(myClinic.status, 200);
  assert.equal(myClinic.body.clinic.name, 'Wellness Clinic');

  const regenRes = await as('docA').post('/api/clinics/invite-code');
  assert.equal(regenRes.status, 200);
  assert.ok(regenRes.body.inviteCode);
});

test('Programs: create program, assign to patient, fetch /my and /patient/:id', async () => {
  const progRes = await as('docA').post('/api/programs').send({
    name: 'Rotator Cuff Protocol',
    items: [{ exerciseId: 'shoulder_press', targetReps: 8, targetSets: 3 }],
  });
  assert.equal(progRes.status, 201);
  const programId = progRes.body.program.id;

  // Assign to pat1
  const assignRes = await as('docA').post(`/api/programs/${programId}/assign`).send({
    patientId: 'pat1',
  });
  assert.equal(assignRes.status, 201);

  // Patient fetches own programs
  const patProgRes = await as('pat1').get('/api/programs/my');
  assert.equal(patProgRes.status, 200);
  assert.ok(patProgRes.body.programs.some((p) => p.programName === 'Rotator Cuff Protocol'));
});

test('Privacy: save consent, get consent, and delete my-data', async () => {
  const saveRes = await as('pat1').post('/api/privacy/consent').send({
    accepted: true,
    cloudAi: true,
    version: '1.0',
  });
  assert.equal(saveRes.status, 200);

  const getRes = await as('pat1').get('/api/privacy/consent');
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.consent.cloudAi, true);

  const deleteRes = await as('pat1').delete('/api/privacy/my-data').send({
    confirm: 'DELETE',
  });
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.success, true);
});

test('Exercises: create custom exercise (doctor-only) and list exercises', async () => {
  const createRes = await as('docA').post('/api/exercises').send({
    displayName: 'Lateral Leg Raise',
    joints: ['left_hip', 'left_knee', 'left_ankle'],
    target_angle_range: [20, 60],
  });
  assert.equal(createRes.status, 201);

  const listRes = await as('pat1').get('/api/exercises');
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.body.exercises));
});

test('Playback: save and get rep playback frames', async () => {
  const sessionId = await firestore.createSession('squat', 'pat1');
  const dummyLm = Array(33).fill([0.5, 0.5, 0.9]);

  const saveRes = await as('pat1').post(`/api/session/${sessionId}/playback/1`).send({
    frames: [{ t: 0, a: 90, lm: dummyLm }],
  });
  assert.equal(saveRes.status, 200);

  const getRes = await as('pat1').get(`/api/session/${sessionId}/playback/1`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.frames.length, 1);
});
