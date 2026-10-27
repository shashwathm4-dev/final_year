/**
 * agent.contract.test.js
 * Contract test asserting the /live payload produced matches backend Zod schema.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { agentLiveSchema } = require('../src/validation/schemas');

describe('Agent /live Contract', () => {
  test('validates full frontend-constructed /live telemetry payload', () => {
    const fixture = {
      sessionId: 'local_session_1729000000',
      exerciseId: 'squat',
      snapshot: {
        t: Date.now(),
        angle: 88.5,
        state: 'PEAK',
        repCount: 4,
        liveFlags: ['trunk_lean'],
        trackingLost: false,
        fatigueLevel: 'none',
      },
      events: [
        {
          type: 'rep',
          rep: 4,
          correct: false,
          issue: 'Trunk lean detected',
          compensations: ['trunk_lean'],
          peakAngle: 88.5,
          qualityScore: 78,
          romScore: 82,
          durationMs: 2150,
          at: Date.now(),
        },
      ],
    };

    const parsed = agentLiveSchema.safeParse(fixture);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.sessionId, fixture.sessionId);
    assert.equal(parsed.data.snapshot.angle, 88.5);
    assert.equal(parsed.data.events.length, 1);
  });
});
