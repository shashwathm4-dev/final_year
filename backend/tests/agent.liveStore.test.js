/**
 * agent.liveStore.test.js
 * Unit tests for in-memory live store ring buffers, TTL, and per-user isolation.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  recordLivePush,
  getUserLiveStore,
  clearUserStore,
  resetAllStores,
  MAX_SNAPSHOTS,
  MAX_EVENTS,
} = require('../src/services/agent/liveStore');

describe('Agent liveStore', () => {
  beforeEach(() => {
    resetAllStores();
  });

  test('records snapshots and maintains ring buffer limit of 120', () => {
    const uid = 'user1';
    for (let i = 1; i <= 130; i++) {
      recordLivePush(uid, {
        sessionId: 'sess_1',
        exerciseId: 'squat',
        snapshot: { t: i * 1000, angle: i, state: 'ASCENDING', repCount: Math.floor(i / 10) },
      });
    }

    const store = getUserLiveStore(uid);
    assert.ok(store);
    assert.equal(store.snapshots.length, MAX_SNAPSHOTS);
    // Oldest snapshot should have been dropped: first element angle should be 11
    assert.equal(store.snapshots[0].angle, 11);
    assert.equal(store.snapshots[store.snapshots.length - 1].angle, 130);
    assert.equal(store.meta.sessionId, 'sess_1');
    assert.equal(store.meta.exerciseId, 'squat');
  });

  test('records events and maintains ring buffer limit of 50', () => {
    const uid = 'user1';
    for (let i = 1; i <= 60; i++) {
      recordLivePush(uid, {
        sessionId: 'sess_1',
        exerciseId: 'squat',
        events: [{ type: 'rep', rep: i, correct: i % 2 === 0, peakAngle: 90 }],
      });
    }

    const store = getUserLiveStore(uid);
    assert.ok(store);
    assert.equal(store.events.length, MAX_EVENTS);
    assert.equal(store.events[0].rep, 11);
    assert.equal(store.events[store.events.length - 1].rep, 60);
  });

  test('ensures strict per-user isolation', () => {
    recordLivePush('userA', {
      sessionId: 'sessA',
      exerciseId: 'squat',
      snapshot: { angle: 85, state: 'PEAK' },
    });

    recordLivePush('userB', {
      sessionId: 'sessB',
      exerciseId: 'arm_raise',
      snapshot: { angle: 120, state: 'ASCENDING' },
    });

    const storeA = getUserLiveStore('userA');
    const storeB = getUserLiveStore('userB');

    assert.equal(storeA.meta.exerciseId, 'squat');
    assert.equal(storeA.snapshots[0].angle, 85);

    assert.equal(storeB.meta.exerciseId, 'arm_raise');
    assert.equal(storeB.snapshots[0].angle, 120);
  });

  test('clears user store on session end', () => {
    recordLivePush('userA', {
      sessionId: 'sessA',
      snapshot: { angle: 90 },
    });
    assert.ok(getUserLiveStore('userA'));

    clearUserStore('userA');
    assert.equal(getUserLiveStore('userA'), null);
  });
});
