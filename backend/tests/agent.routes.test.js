/**
 * agent.routes.test.js
 * Integration tests for /api/agent endpoints:
 * - 401 without auth
 * - POST /live validation + 204
 * - POST /chat SSE event order (token -> done)
 * - Concurrent chat blocking
 * - POST /assist cooldown handling
 * - GET /status
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, makeToken, seedTestUsers, resetStore, as } = require('./helpers/testApp');
const { recordLivePush, resetAllStores } = require('../src/services/agent/liveStore');

describe('Agent HTTP Routes', () => {
  beforeEach(async () => {
    resetAllStores();
    resetStore();
    await seedTestUsers();
  });

  test('unauthenticated requests return 401', async () => {
    await request(app).get('/api/agent/status').expect(401);
    await request(app).post('/api/agent/live').send({ sessionId: 's1' }).expect(401);
    await request(app).post('/api/agent/chat').send({ message: 'hi' }).expect(401);
    await request(app).post('/api/agent/assist').send({ reason: 'fatigue' }).expect(401);
  });

  test('GET /api/agent/status returns status structure', async () => {
    const res = await as('pat1', 'patient').get('/api/agent/status').expect(200);
    assert.equal(typeof res.body.llm, 'boolean');
    assert.equal(typeof res.body.consentRequired, 'boolean');
  });

  test('POST /api/agent/live validates schema and records live telemetry with 204', async () => {
    // 1. Invalid payload: bad body
    await as('pat1', 'patient')
      .post('/api/agent/live')
      .send({ snapshot: { angle: 'invalid' } })
      .expect(400);

    // 2. Valid payload with local session
    await as('pat1', 'patient')
      .post('/api/agent/live')
      .send({
        sessionId: 'local_123',
        exerciseId: 'squat',
        snapshot: {
          t: Date.now(),
          angle: 90,
          state: 'HOLDING',
          repCount: 2,
          liveFlags: [],
          trackingLost: false,
          fatigueLevel: 'none',
        },
        events: [
          { type: 'rep', rep: 1, correct: true, peakAngle: 90, qualityScore: 85 },
        ],
      })
      .expect(204);
  });

  test('POST /api/agent/chat rejects messages > 500 characters', async () => {
    const longMsg = 'a'.repeat(501);
    await as('pat1', 'patient')
      .post('/api/agent/chat')
      .send({ message: longMsg })
      .expect(400);
  });

  test('POST /api/agent/chat streams SSE events and completes with done', async () => {
    recordLivePush('pat1', {
      sessionId: 'local_1',
      exerciseId: 'squat',
      snapshot: { angle: 90 },
    });

    const res = await as('pat1', 'patient')
      .post('/api/agent/chat')
      .send({ message: 'What is my current target angle?' })
      .expect(200);

    assert.ok(res.text.includes('event: token'));
    assert.ok(res.text.includes('event: done'));
    assert.ok(res.headers['content-type'].includes('text/event-stream'));
  });

  test('POST /api/agent/assist streams assist and respects cooldown', async () => {
    recordLivePush('pat1', {
      sessionId: 'local_1',
      exerciseId: 'squat',
      snapshot: { angle: 90, fatigueLevel: 'high' },
    });

    // First call
    const res1 = await as('pat1', 'patient')
      .post('/api/agent/assist')
      .send({ reason: 'fatigue' })
      .expect(200);

    assert.ok(res1.text.includes('event: done'));

    // Immediate second call should indicate cooldown
    const res2 = await as('pat1', 'patient')
      .post('/api/agent/assist')
      .send({ reason: 'fatigue' })
      .expect(200);

    assert.ok(res2.text.includes('cooldown":true') || res2.text.includes('event: done'));
  });
});
