const test = require('node:test');
const assert = require('node:assert/strict');
const {
  verifyRepSchema,
  logRepSchema,
  sessionEndSchema,
  assignmentSchema,
  exerciseSchema,
  addPatientSchema,
} = require('../src/validation/schemas');

const FRAME = 'data:image/jpeg;base64,' + 'A'.repeat(64);

test('verifyRep accepts a jpeg data URL', () => {
  const r = verifyRepSchema.safeParse({ patientFrame: FRAME, exerciseId: 'shoulder_abduction', sessionId: 'sess_1_abc' });
  assert.equal(r.success, true);
});

test('verifyRep rejects missing frame and non-image strings', () => {
  assert.equal(verifyRepSchema.safeParse({ exerciseId: 'x' }).success, false);
  assert.equal(verifyRepSchema.safeParse({ patientFrame: 'hello world not base64!!!!!!' }).success, false);
});

test('verifyRep rejects oversized frames', () => {
  const huge = 'A'.repeat(4_000_001);
  assert.equal(verifyRepSchema.safeParse({ patientFrame: huge }).success, false);
});

test('logRep accepts a normal rep payload', () => {
  const r = logRepSchema.safeParse({
    sessionId: 'sess_1_abc',
    exerciseId: 'shoulder_abduction',
    repNumber: 3,
    timestamp: Date.now(),
    angles: [5, 40, 88, 42, 6],
    verdictSource: 'vlm',
    correct: true,
    issue: null,
    qualityScore: 91,
  });
  assert.equal(r.success, true);
});

test('logRep strips unknown fields such as camera frames', () => {
  const r = logRepSchema.parse({ sessionId: 's1', repNumber: 1, frame: FRAME, patientFrame: FRAME });
  assert.equal('frame' in r, false);
  assert.equal('patientFrame' in r, false);
});

test('logRep rejects bad values', () => {
  assert.equal(logRepSchema.safeParse({ sessionId: 's1', repNumber: -1 }).success, false);
  assert.equal(logRepSchema.safeParse({ sessionId: 's1', repNumber: 1, qualityScore: 400 }).success, false);
  assert.equal(logRepSchema.safeParse({ sessionId: 'bad id with spaces', repNumber: 1 }).success, false);
  assert.equal(logRepSchema.safeParse({ sessionId: 's1', repNumber: 1, verdictSource: 'hacked' }).success, false);
});

test('sessionEnd needs a sessionId', () => {
  assert.equal(sessionEndSchema.safeParse({ totalReps: 3 }).success, false);
  assert.equal(sessionEndSchema.safeParse({ sessionId: 's1', totalReps: 3, correctReps: 2 }).success, true);
});

test('assignment coerces numeric strings and enforces limits', () => {
  const ok = assignmentSchema.parse({ patientId: 'p1', exerciseId: 'neck_tilt', targetReps: '12', targetSets: 3 });
  assert.equal(ok.targetReps, 12);
  assert.equal(assignmentSchema.safeParse({ patientId: 'p1', exerciseId: 'e', targetReps: 500 }).success, false);
});

test('exercise schema needs 5 checkpoints and a 2-value range', () => {
  const base = {
    displayName: 'Test',
    joints: ['a', 'b', 'c'],
    target_angle_range: [70, 110],
    checkpoint_thresholds: [30, 35, 35, 35, 30],
    referenceCheckpoints: [5, 45, 90, 45, 5],
  };
  assert.equal(exerciseSchema.safeParse(base).success, true);
  assert.equal(exerciseSchema.safeParse({ ...base, referenceCheckpoints: [1, 2, 3] }).success, false);
  assert.equal(exerciseSchema.safeParse({ ...base, target_angle_range: [70] }).success, false);
});

test('addPatient lowercases and validates email', () => {
  assert.equal(addPatientSchema.parse({ email: '  Foo@Bar.COM ' }).email, 'foo@bar.com');
  assert.equal(addPatientSchema.safeParse({ email: 'nope' }).success, false);
});
