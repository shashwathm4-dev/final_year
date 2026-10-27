const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, as, seedTestUsers, makeToken } = require('./helpers/testApp');

test.beforeEach(async () => {
  await seedTestUsers();
});

test('HTTP Server & Global middleware: unknown route returns 404', async () => {
  const res = await as('pat1').get('/api/unknown-endpoint-xyz');
  assert.equal(res.status, 404);
});

test('HTTP Server: malformed JSON body returns 400 with "Malformed JSON body"', async () => {
  const res = await request(app)
    .post('/api/session/start')
    .set('Authorization', `Bearer ${makeToken('pat1', 'patient')}`)
    .set('Content-Type', 'application/json')
    .send('{"invalidJson:');
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Malformed JSON body');
});

test('HTTP Server: body > 100kb rejected with 413 on normal routes', async () => {
  const largeString = 'x'.repeat(105 * 1024);
  const res = await request(app)
    .post('/api/session/start')
    .set('Authorization', `Bearer ${makeToken('pat1', 'patient')}`)
    .set('Content-Type', 'application/json')
    .send({ exerciseId: 'squat', padding: largeString });
  assert.equal(res.status, 413);
  assert.equal(res.body.error, 'Request body too large');
});

test('HTTP Server: /api/verify-rep accepts payloads up to 5MB', async () => {
  // A payload larger than 100kb but well under 5mb
  const largeImage = 'data:image/jpeg;base64,' + 'A'.repeat(250 * 1024);
  const res = await request(app)
    .post('/api/verify-rep')
    .set('Authorization', `Bearer ${makeToken('pat1', 'patient')}`)
    .set('Content-Type', 'application/json')
    .send({
      patientFrame: largeImage,
      referenceFrame: largeImage,
      exerciseId: 'squat',
    });
  // Since Gemini key is deleted in tests, it will fall back or error gracefully, but NOT 413
  assert.notEqual(res.status, 413);
});

test('HTTP Server: /api/health returns valid shape and timestamp', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.ok(res.body.service);
  assert.ok(res.body.timestamp);
});

test('Routes Matrix: unauthenticated requests return 401', async () => {
  const protectedUrls = [
    { method: 'get', url: '/api/sessions/my' },
    { method: 'post', url: '/api/session/start' },
    { method: 'get', url: '/api/users/me' },
    { method: 'get', url: '/api/exercises' },
    { method: 'get', url: '/api/assignments' },
    { method: 'get', url: '/api/privacy/consent' },
    { method: 'get', url: '/api/analytics/adherence' },
    { method: 'get', url: '/api/comments/unread' },
    { method: 'get', url: '/api/clinics/me' },
    { method: 'get', url: '/api/programs/my' },
    { method: 'get', url: '/api/reports/me' },
    { method: 'get', url: '/api/models/rep-classifier/squat' },
  ];

  for (const route of protectedUrls) {
    const res = await request(app)[route.method](route.url);
    assert.equal(res.status, 401, `Expected 401 for ${route.method.toUpperCase()} ${route.url}`);
  }
});

test('Routes Matrix: malformed tokens return 401', async () => {
  const res = await request(app)
    .get('/api/sessions/my')
    .set('Authorization', 'Bearer invalid.token.payload');
  assert.equal(res.status, 401);
});

test('Routes Matrix: role authorization (doctor-only routes reject patient with 403)', async () => {
  // GET /api/users/patients is doctor-only
  const patRes = await as('pat1').get('/api/users/patients');
  assert.equal(patRes.status, 403);

  // POST /api/assignments is doctor-only
  const assignRes = await as('pat1').post('/api/assignments').send({
    patientId: 'pat1',
    exerciseId: 'squat',
  });
  assert.equal(assignRes.status, 403);

  // POST /api/exercises is doctor-only
  const exRes = await as('pat1').post('/api/exercises').send({
    displayName: 'Custom Stretch',
    joints: ['left_shoulder'],
    target_angle_range: [0, 90],
  });
  assert.equal(exRes.status, 403);
});

test('Routes Matrix: doctor-only routes succeed for authorized doctor', async () => {
  const patList = await as('docA').get('/api/users/patients');
  assert.equal(patList.status, 200);
  assert.ok(Array.isArray(patList.body.patients));
});

test('Routes Matrix: /sessions/my route is NOT swallowed by /session/:id', async () => {
  const res = await as('pat1').get('/api/sessions/my');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.sessions));
});
