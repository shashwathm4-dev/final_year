const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateReportSummary,
  buildRuleBasedSummary,
  buildDigest,
  sanitizePdfText,
} = require('../src/services/reportSummary');

test('sanitizePdfText removes curly quotes, dashes, and non-latin1 characters', () => {
  const input = '“Hello” ‘world’ — testing… 🚀 emoji & accents: résumé';
  const sanitized = sanitizePdfText(input);
  assert.ok(!sanitized.includes('“'));
  assert.ok(!sanitized.includes('”'));
  assert.ok(!sanitized.includes('🚀'));
  assert.ok(sanitized.includes('"Hello"'));
  assert.ok(sanitized.includes("'world'"));
  assert.ok(sanitized.includes('résumé'));
});

test('buildDigest computes correct aggregates from sessions', () => {
  const sessions = [
    {
      startedAt: '2026-10-01T10:00:00.000Z',
      exerciseId: 'bicep_curl',
      totalReps: 10,
      correctReps: 8,
      reps: [
        { qualityScore: 80, romScore: 90, correct: true },
        { qualityScore: 70, romScore: 80, correct: false, issue: 'Elbow flare' },
      ],
      summary: { fatigue: { level: 'moderate' } },
    },
    {
      startedAt: '2026-10-05T10:00:00.000Z',
      exerciseId: 'bicep_curl',
      totalReps: 10,
      correctReps: 10,
      reps: [
        { qualityScore: 90, romScore: 95, correct: true },
      ],
      summary: { fatigue: { level: 'none' } },
    },
  ];

  const digest = buildDigest({ days: 30, sessions, programs: [], risk: null });
  assert.equal(digest.sessionCount, 2);
  assert.equal(digest.totalReps, 20);
  assert.equal(digest.correctReps, 18);
  assert.equal(digest.accuracy, 90);
  assert.equal(digest.avgQuality, 80);
  assert.equal(digest.avgRom, 88);
  assert.equal(digest.fatigueSessions, 1);
  assert.deepEqual(digest.topIssues, ['Elbow flare (1x)']);
});

test('generateReportSummary with zero sessions returns rule-based without calling Gemini', async () => {
  const res = await generateReportSummary({
    patient: { consent: { cloudAi: true } },
    days: 30,
    sessions: [],
  });
  assert.equal(res.source, 'rule-based');
  assert.equal(res.headline, 'No Exercise Sessions Recorded');
  assert.ok(res.overview.includes('No exercise sessions were completed'));
  assert.ok(res.highlights.length > 0);
  assert.ok(res.concerns.length > 0);
  assert.ok(res.recommendations.length > 0);
});

test('generateReportSummary without cloudAi consent returns rule-based', async () => {
  const sessions = [
    {
      startedAt: '2026-10-01T10:00:00.000Z',
      exerciseId: 'squat',
      totalReps: 10,
      correctReps: 9,
      reps: [{ qualityScore: 85, romScore: 85, correct: true }],
    },
  ];
  const res = await generateReportSummary({
    patient: { consent: { cloudAi: false } },
    days: 30,
    sessions,
  });
  assert.equal(res.source, 'rule-based');
  assert.equal(res.headline, 'Positive Rehabilitation Progress');
  assert.ok(res.overview.includes('The patient completed 1 sessions'));
  assert.ok(res.highlights.length <= 3);
  assert.ok(res.concerns.length <= 3);
  assert.ok(res.recommendations.length <= 3);
});

test('generateReportSummary without GEMINI_API_KEY falls back to rule-based', async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  const sessions = [
    {
      startedAt: '2026-10-01T10:00:00.000Z',
      exerciseId: 'squat',
      totalReps: 10,
      correctReps: 5,
      reps: [{ qualityScore: 50, romScore: 50, correct: false, issue: 'Knee valgus' }],
    },
  ];
  const res = await generateReportSummary({
    patient: { consent: { cloudAi: true } },
    days: 14,
    sessions,
  });
  assert.equal(res.source, 'rule-based');
  assert.ok(res.overview.includes('50%'));

  if (oldKey) process.env.GEMINI_API_KEY = oldKey;
});
