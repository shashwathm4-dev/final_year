const test = require('node:test');
const assert = require('node:assert/strict');
const { as, seedTestUsers, firestore } = require('./helpers/testApp');

test.beforeEach(async () => {
  await seedTestUsers();
});

test('Session flow: start -> log-reps -> end -> get session -> sessions/my', async () => {
  // 1. POST /api/session/start
  const startRes = await as('pat1').post('/api/session/start').send({
    exerciseId: 'squat',
    difficulty: 'intermediate',
  });
  assert.equal(startRes.status, 200);
  assert.ok(startRes.body.sessionId);
  const sessionId = startRes.body.sessionId;

  // 2. POST /api/session/log-rep (multiple reps)
  // Rep 1: correct
  const rep1Res = await as('pat1').post('/api/session/log-rep').send({
    sessionId,
    repNumber: 1,
    exerciseId: 'squat',
    correct: true,
    tempoScore: 85,
    smoothnessScore: 90,
    romScore: 95,
    qualityScore: 88,
    verdictSource: 'local',
  });
  assert.equal(rep1Res.status, 200);

  // Rep 2: incorrect with issue
  const rep2Res = await as('pat1').post('/api/session/log-rep').send({
    sessionId,
    repNumber: 2,
    exerciseId: 'squat',
    correct: false,
    issue: 'Knees caves inward',
    severity: 'medium',
    tempoScore: 70,
    smoothnessScore: 65,
    romScore: 80,
    qualityScore: 68,
    verdictSource: 'local',
  });
  assert.equal(rep2Res.status, 200);

  // 3. POST /api/session/end
  const endRes = await as('pat1').post('/api/session/end').send({
    sessionId,
    totalReps: 2,
    correctReps: 1,
  });
  assert.equal(endRes.status, 200);
  assert.equal(endRes.body.success, true);
  assert.ok(endRes.body.summary);
  assert.equal(endRes.body.summary.repCount, 2);
  assert.equal(endRes.body.summary.accuracy, 50);
  assert.ok(endRes.body.coaching);

  // 4. GET /api/session/:id
  const getRes = await as('pat1').get(`/api/session/${sessionId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.status, 'completed');
  assert.equal(getRes.body.reps.length, 2);
  assert.equal(getRes.body.totalReps, 2);
  assert.equal(getRes.body.correctReps, 1);

  // 5. GET /api/sessions/my
  const myRes = await as('pat1').get('/api/sessions/my');
  assert.equal(myRes.status, 200);
  assert.ok(myRes.body.sessions.some((s) => s.sessionId === sessionId));
});

test('Session flow: server validates and drops unknown fields from log-rep', async () => {
  const startRes = await as('pat1').post('/api/session/start').send({ exerciseId: 'squat' });
  const sessionId = startRes.body.sessionId;

  // Send forbidden camera frame in log-rep
  const repRes = await as('pat1').post('/api/session/log-rep').send({
    sessionId,
    repNumber: 1,
    exerciseId: 'squat',
    correct: true,
    cameraFrame: 'base64_junk_data_should_be_stripped',
    tempoScore: 80,
    smoothnessScore: 80,
    romScore: 80,
    qualityScore: 80,
  });
  assert.equal(repRes.status, 200);

  const getRes = await as('pat1').get(`/api/session/${sessionId}`);
  assert.equal(getRes.body.reps[0].cameraFrame, undefined);
});

test('Session flow: access control (another patient gets 403, treating doctor gets 200, other doctor gets 403)', async () => {
  const startRes = await as('pat1').post('/api/session/start').send({ exerciseId: 'squat' });
  const sessionId = startRes.body.sessionId;

  // Another patient cannot read it
  const pat2Res = await as('pat2').get(`/api/session/${sessionId}`);
  assert.equal(pat2Res.status, 403);

  // Treating doctor (docA) can read it
  const docARes = await as('docA').get(`/api/session/${sessionId}`);
  assert.equal(docARes.status, 200);

  // Another doctor (docB) cannot read it
  const docBRes = await as('docB').get(`/api/session/${sessionId}`);
  assert.equal(docBRes.status, 403);
});

test('Session flow: 404 on unknown session', async () => {
  const res = await as('pat1').get('/api/session/non_existent_session_id');
  assert.equal(res.status, 404);
});

test('Session flow: 400 on invalid log-rep schema (e.g. repNumber as string)', async () => {
  const res = await as('pat1').post('/api/session/log-rep').send({
    sessionId: 'sess123',
    repNumber: 'invalid_number',
  });
  assert.equal(res.status, 400);
});
