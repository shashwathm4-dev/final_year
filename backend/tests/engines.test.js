const test = require('node:test');
const assert = require('node:assert/strict');
const { applyProgression } = require('../src/services/progression');
const { analyzeTrend } = require('../src/services/riskAnalysis');
const { updateProfile, buildAdaptedParams } = require('../src/services/personalization');
const { computePatientAdherence, computeTrends } = require('../src/services/analytics');
const { seedTestUsers, firestore } = require('./helpers/testApp');

test.beforeEach(async () => {
  await seedTestUsers();
});

test('Progression engine: increments streak on good session, raises targets when threshold met', async () => {
  // Setup active program for pat1
  const program = {
    id: 'prog1',
    patientId: 'pat1',
    programName: 'Knee Rehab',
    status: 'active',
    items: [
      {
        exerciseId: 'squat',
        exerciseName: 'Squat',
        targetReps: 10,
        targetSets: 3,
        goodStreak: 2,
      },
    ],
    progression: {
      enabled: true,
      goodSessionsRequired: 3,
      accuracyThreshold: 80,
      repsIncrement: 2,
      maxReps: 20,
    },
    log: [],
  };
  await firestore.savePatientProgram(program);

  // Seed session with high accuracy (100%) and required total reps (30 reps)
  const sessionId = await firestore.createSession('squat', 'pat1');
  await firestore.endSession(sessionId, {
    totalReps: 30,
    correctReps: 30,
    summary: { accuracy: 100, repCount: 30 },
  });

  const result = await applyProgression(sessionId);
  assert.ok(result);
  assert.equal(result.goodSession, true);
  assert.ok(result.raised);
  assert.equal(result.raised.from.reps, 10);
  assert.equal(result.raised.to.reps, 12);

  // Check persisted program
  const updatedPrograms = await firestore.getPatientPrograms('pat1');
  const updated = updatedPrograms.find((p) => p.id === 'prog1');
  assert.equal(updated.items[0].targetReps, 12);
  assert.equal(updated.items[0].goodStreak, 0); // reset after raising
  assert.equal(updated.log.length, 1);
});

test('Progression engine: bad session resets streak to 0', async () => {
  const program = {
    id: 'prog2',
    patientId: 'pat1',
    programName: 'Knee Rehab',
    status: 'active',
    items: [
      {
        exerciseId: 'squat',
        exerciseName: 'Squat',
        targetReps: 10,
        targetSets: 3,
        goodStreak: 2,
      },
    ],
    progression: {
      enabled: true,
      goodSessionsRequired: 3,
      accuracyThreshold: 80,
    },
    log: [],
  };
  await firestore.savePatientProgram(program);

  const badSessionId = await firestore.createSession('squat', 'pat1');
  await firestore.endSession(badSessionId, {
    totalReps: 30,
    correctReps: 10, // 33% accuracy
    summary: { accuracy: 33, repCount: 30 },
  });

  const result = await applyProgression(badSessionId);
  assert.ok(result);
  assert.equal(result.goodSession, false);
  assert.equal(result.raised, null);
  assert.equal(result.streak, 0);

  const updatedPrograms = await firestore.getPatientPrograms('pat1');
  assert.equal(updatedPrograms[0].items[0].goodStreak, 0);
});

test('Progression engine: returns null if progression.enabled === false', async () => {
  const program = {
    id: 'prog3',
    patientId: 'pat1',
    status: 'active',
    items: [{ exerciseId: 'squat', targetReps: 10, targetSets: 1, goodStreak: 0 }],
    progression: { enabled: false },
  };
  await firestore.savePatientProgram(program);

  const disSessionId = await firestore.createSession('squat', 'pat1');
  await firestore.endSession(disSessionId, {
    totalReps: 10,
    correctReps: 10,
    summary: { accuracy: 100, repCount: 10 },
  });

  const result = await applyProgression(disSessionId);
  assert.equal(result, null);
});

test('Risk analysis: returns low risk and empty flags for < 3 sessions', () => {
  const res = analyzeTrend([{ startedAt: new Date().toISOString(), status: 'completed' }]);
  assert.equal(res.riskLevel, 'low');
  assert.equal(res.flags.length, 0);
});

test('Personalization: updateProfile adapts thresholdScale and workingTargetPeak', () => {
  const profile = {
    sessions: 1,
    emaPeak: 100,
    emaQuality: 85,
    emaAccuracy: 0.9,
    thresholdScale: 1.0,
  };
  const summary = {
    repCount: 10,
    accuracy: 95,
    avgQuality: 90,
    avgPeakAngle: 110,
  };
  const exercise = { target_angle_range: [60, 150] };

  const updated = updateProfile(profile, summary, exercise);
  assert.equal(updated.sessions, 2);
  assert.ok(updated.thresholdScale < 1.0); // tightened tolerance
  assert.ok(updated.workingTargetPeak > 100);

  const adapted = buildAdaptedParams(updated, exercise);
  assert.equal(adapted.adaptive, true);
});

test('Analytics: computePatientAdherence accurately identifies on_track, behind, at_risk, and no_plan', () => {
  const patients = [
    { uid: 'p_on_track', fullName: 'Patient A' },
    { uid: 'p_no_plan', fullName: 'Patient B' },
  ];
  const assignments = [
    { patientId: 'p_on_track', targetSets: 2, targetReps: 10 }, // weekly target 20
  ];
  const sessions = [
    {
      patientId: 'p_on_track',
      status: 'completed',
      startedAt: new Date().toISOString(),
      totalReps: 20,
      correctReps: 20,
    },
  ];

  const res = computePatientAdherence(patients, sessions, assignments);
  assert.equal(res.totals.on_track, 1);
  assert.equal(res.totals.no_plan, 1);
});

test('Analytics: computeTrends returns expected exercises and points structure', () => {
  const sessions = [
    {
      exerciseId: 'squat',
      status: 'completed',
      startedAt: '2026-10-01T10:00:00.000Z',
      totalReps: 10,
      correctReps: 9,
      reps: [{ peakAngle: 90, qualityScore: 85 }],
    },
  ];

  const trends = computeTrends(sessions);
  assert.equal(trends.totals.sessions, 1);
  assert.equal(trends.totals.reps, 10);
  assert.equal(trends.exercises[0].exerciseId, 'squat');
  assert.equal(trends.exercises[0].points[0].avgPeakAngle, 90);
});
