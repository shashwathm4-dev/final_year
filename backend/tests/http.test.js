const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const validate = require('../src/middleware/validate');
const requireRole = require('../src/middleware/requireRole');
const { createLimiter } = require('../src/middleware/rateLimits');
const { logRepSchema } = require('../src/validation/schemas');

function fakeAuth(uid, role = 'patient') {
  return (req, res, next) => {
    req.user = { uid, role };
    next();
  };
}

test('validate middleware returns 400 with details', async () => {
  const app = express();
  app.use(express.json());
  app.post('/x', validate(logRepSchema), (req, res) => res.json({ ok: true }));
  const bad = await request(app).post('/x').set('Content-Type', 'application/json').send({ repNumber: 'abc' });
  assert.equal(bad.status, 400);
  assert.ok(Array.isArray(bad.body.details));
  const good = await request(app).post('/x').set('Content-Type', 'application/json').send({ sessionId: 's1', repNumber: 1 });
  assert.equal(good.status, 200);
});

test('rate limit is per user, not per session id', async () => {
  const limiter = createLimiter({ windowMs: 60000, limit: 2 });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => fakeAuth(req.get('x-test-user'))(req, res, next));
  app.post('/v', limiter, (req, res) => res.json({ ok: true }));

  // User A rotates session ids but is still limited
  for (let i = 0; i < 2; i++) {
    const r = await request(app).post('/v').set('x-test-user', 'A').set('Content-Type', 'application/json').send({ sessionId: `s${i}` });
    assert.equal(r.status, 200);
  }
  const blocked = await request(app).post('/v').set('x-test-user', 'A').set('Content-Type', 'application/json').send({ sessionId: 'brand_new' });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.source, 'rate_limited');

  // User B is unaffected
  const other = await request(app).post('/v').set('x-test-user', 'B').set('Content-Type', 'application/json').send({});
  assert.equal(other.status, 200);
});

test('requireRole blocks the wrong role', async () => {
  const app = express();
  app.get('/doc', fakeAuth('u1', 'patient'), requireRole('doctor'), (req, res) => res.json({ ok: true }));
  const r = await request(app).get('/doc');
  assert.equal(r.status, 403);
});
