const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleBasedSummary, _resetThrottle } = require('../src/services/coaching');

test('ruleBasedSummary produces high accuracy wins and headline', () => {
  const digest = {
    exerciseName: 'Bicep Curl',
    reps: 12,
    accuracy: 92,
    avgQuality: 85,
    fatigue: { level: 'none' },
    topIssues: [],
    previousDeltas: { accuracy: 5 },
  };

  const res = ruleBasedSummary(digest);
  assert.equal(res.source, 'rule-based');
  assert.equal(res.headline, 'Excellent form on Bicep Curl!');
  assert.ok(res.wins.length <= 3);
  assert.ok(res.wins.some((w) => w.includes('High accuracy')));
  assert.ok(res.summary.includes('12 reps with 92% accuracy'));
  assert.ok(res.summary.includes('+5%'));
});

test('ruleBasedSummary handles low accuracy (<50%) and fatigue focus areas', () => {
  const digest = {
    exerciseName: 'Squat',
    reps: 10,
    accuracy: 40,
    avgQuality: 55,
    fatigue: { level: 'high' },
    topIssues: [{ label: 'Knees caves inward', count: 6 }],
  };

  const res = ruleBasedSummary(digest);
  assert.equal(res.headline, 'Session completed: focus on movement alignment next time');
  assert.ok(res.focusAreas.some((f) => f.includes('Knees caves inward')));
  assert.ok(res.focusAreas.some((f) => f.includes('Fatigue (high)')));
  assert.ok(res.nextStep.includes('Take an extended rest'));
});

test('ruleBasedSummary caps summary <= 500 chars and wins <= 3', () => {
  const digest = {
    exerciseName: 'Long Exercise Name',
    reps: 20,
    accuracy: 88,
    avgQuality: 80,
    fatigue: { level: 'none' },
    topIssues: [],
  };

  const res = ruleBasedSummary(digest);
  assert.ok(res.summary.length <= 500);
  assert.ok(res.wins.length <= 3);
  assert.ok(res.focusAreas.length <= 3);
});

test('_resetThrottle clears user throttling', () => {
  assert.doesNotThrow(() => {
    _resetThrottle();
  });
});
