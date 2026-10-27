/**
 * agent.mcp.test.js
 * In-process MCP server integration tests.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createMcpSession } = require('../src/services/agent/mcpServer');
const { recordLivePush, resetAllStores } = require('../src/services/agent/liveStore');
const { seedTestUsers, resetStore } = require('./helpers/testApp');

describe('Agent In-Process MCP Server', () => {
  beforeEach(async () => {
    resetAllStores();
    resetStore();
    await seedTestUsers();
  });

  test('lists all 7 read-only clinical tools', async () => {
    const { client } = await createMcpSession({ user: { uid: 'pat1', role: 'patient' } });
    const res = await client.listTools();
    const toolNames = res.tools.map((t) => t.name);

    assert.equal(toolNames.length, 7);
    assert.ok(toolNames.includes('get_live_state'));
    assert.ok(toolNames.includes('get_recent_reps'));
    assert.ok(toolNames.includes('get_exercise_config'));
    assert.ok(toolNames.includes('get_session_summary'));
    assert.ok(toolNames.includes('get_patient_progress'));
    assert.ok(toolNames.includes('get_risk_flags'));
    assert.ok(toolNames.includes('get_previous_session_comparison'));
  });

  test('get_live_state and get_recent_reps return seeded data', async () => {
    recordLivePush('pat1', {
      sessionId: 'sess_live_1',
      exerciseId: 'squat',
      snapshot: { t: 1000, angle: 92, state: 'PEAK', repCount: 3, liveFlags: ['trunk_lean'] },
      events: [
        { type: 'rep', rep: 1, correct: true, peakAngle: 90, qualityScore: 88 },
        { type: 'rep', rep: 2, correct: false, issue: 'Knee valgus', peakAngle: 75, qualityScore: 65 },
      ],
    });

    const { client } = await createMcpSession({ user: { uid: 'pat1', role: 'patient' } });

    // 1. get_live_state
    const liveRes = await client.callTool({ name: 'get_live_state', arguments: {} });
    const live = JSON.parse(liveRes.content[0].text);
    assert.equal(live.active, true);
    assert.equal(live.exerciseId, 'squat');
    assert.equal(live.currentAngle, 92);
    assert.equal(live.repCount, 3);
    assert.deepEqual(live.liveFlags, ['trunk_lean']);

    // 2. get_recent_reps
    const repsRes = await client.callTool({ name: 'get_recent_reps', arguments: { limit: 5 } });
    const repsData = JSON.parse(repsRes.content[0].text);
    assert.equal(repsData.count, 2);
    assert.equal(repsData.reps[0].rep, 1);
    assert.equal(repsData.reps[1].correct, false);
    assert.equal(repsData.reps[1].issue, 'Knee valgus');
  });

  test('patient role cannot access another patient data via args', async () => {
    recordLivePush('pat2', {
      sessionId: 'sess_pat2',
      exerciseId: 'arm_raise',
      snapshot: { angle: 110, state: 'PEAK', repCount: 5 },
    });

    // Patient 1 tries to query patient 2 data
    const { client } = await createMcpSession({ user: { uid: 'pat1', role: 'patient' } });
    const res = await client.callTool({ name: 'get_live_state', arguments: { patientId: 'pat2' } });
    const live = JSON.parse(res.content[0].text);

    // Should return patient 1 data (which is empty), ignoring patientId argument
    assert.equal(live.active, false);
  });

  test('doctor role can access own patient data but not unlinked patient', async () => {
    recordLivePush('pat1', {
      sessionId: 'sess_pat1',
      exerciseId: 'squat',
      snapshot: { angle: 90, state: 'PEAK', repCount: 4 },
    });
    recordLivePush('pat2', {
      sessionId: 'sess_pat2',
      exerciseId: 'squat',
      snapshot: { angle: 80, state: 'PEAK', repCount: 1 },
    });

    // docA is assigned to pat1, but NOT pat2
    const { client } = await createMcpSession({ user: { uid: 'docA', role: 'doctor' } });

    // Query pat1 (allowed)
    const pat1Res = await client.callTool({ name: 'get_live_state', arguments: { patientId: 'pat1' } });
    const live1 = JSON.parse(pat1Res.content[0].text);
    assert.equal(live1.active, true);
    assert.equal(live1.currentAngle, 90);

    // Query pat2 (forbidden)
    await assert.rejects(
      async () => {
        await client.callTool({ name: 'get_live_state', arguments: { patientId: 'pat2' } });
      },
      /Forbidden/
    );
  });
});
