const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { summarizeSession, computeFatigue } = require('../src/services/sessionMetrics');

test('computeFatigue returns none with <4 reps', () => {
  const result = computeFatigue([{ repNumber: 1, durationMs: 2000 }]);
  assert.equal(result.level, 'none');
  assert.equal(result.enoughData, false);
});

test('computeFatigue detects tempo slowdown and ROM drop', () => {
  const reps = [
    { repNumber: 1, durationMs: 1500, peakAngle: 90, smoothnessScore: 90, qualityScore: 90 },
    { repNumber: 2, durationMs: 1500, peakAngle: 90, smoothnessScore: 90, qualityScore: 90 },
    { repNumber: 3, durationMs: 2500, peakAngle: 75, smoothnessScore: 60, qualityScore: 60 },
    { repNumber: 4, durationMs: 2600, peakAngle: 70, smoothnessScore: 55, qualityScore: 55 },
  ];

  const result = computeFatigue(reps);
  assert.notEqual(result.level, 'none');
  assert.ok(result.index > 0);
  assert.ok(result.signals.length > 0);
});

test('summarizeSession aggregates rep counts, accuracy, and fatigue', () => {
  const session = {
    exerciseId: 'squat',
    reps: [
      { repNumber: 1, correct: true, qualityScore: 80, romScore: 90, peakAngle: 95 },
      { repNumber: 2, correct: false, issue: 'Knee valgus', qualityScore: 60, romScore: 70, peakAngle: 85 },
    ],
  };

  const summary = summarizeSession(session);
  assert.equal(summary.repCount, 2);
  assert.equal(summary.accuracy, 50);
  assert.equal(summary.avgQuality, 70);
  assert.equal(summary.avgPeakAngle, 90);
});

test('Parity check: backend computeFatigue matches frontend fatigueDetection', async () => {
  const feFatiguePath = path.resolve(__dirname, '../../frontend/src/utils/fatigueDetection.js');
  const { computeFatigue: feComputeFatigue } = await import('file://' + feFatiguePath.replace(/\\/g, '/'));

  const testCases = [
    [],
    [{ repNumber: 1, durationMs: 1000 }],
    [
      { repNumber: 1, durationMs: 1200, peakAngle: 100, smoothnessScore: 90, qualityScore: 90 },
      { repNumber: 2, durationMs: 1250, peakAngle: 98, smoothnessScore: 88, qualityScore: 89 },
      { repNumber: 3, durationMs: 1300, peakAngle: 95, smoothnessScore: 85, qualityScore: 85 },
      { repNumber: 4, durationMs: 1400, peakAngle: 90, smoothnessScore: 80, qualityScore: 82 },
      { repNumber: 5, durationMs: 1800, peakAngle: 80, smoothnessScore: 65, qualityScore: 65 },
      { repNumber: 6, durationMs: 2000, peakAngle: 75, smoothnessScore: 60, qualityScore: 60 },
    ],
  ];

  for (const tc of testCases) {
    const beRes = computeFatigue(tc);
    const feRes = feComputeFatigue(tc);
    assert.equal(beRes.level, feRes.level, `Mismatch for level on input length ${tc.length}`);
    assert.equal(beRes.index, feRes.index, `Mismatch for index on input length ${tc.length}`);
    assert.equal(beRes.signals.length, feRes.signals.length, `Mismatch for signals count`);
  }
});
