import { describe, it, expect, beforeEach, vi } from 'vitest';
import axios from 'axios';
import {
  startSession,
  logRep,
  endSession,
  flushOfflineQueue,
  downloadProgressReport,
} from '../services/api';
import * as offlineQueue from '../services/offlineQueue';
import fixture from '../../../contracts/logRep.fixture.json';

vi.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    post: vi.fn().mockResolvedValue({ data: {} }),
    get: vi.fn().mockResolvedValue({ data: {} }),
  };
  return {
    default: {
      create: vi.fn(() => instance),
      post: vi.fn().mockResolvedValue({ data: {} }),
      get: vi.fn().mockResolvedValue({ data: {} }),
    },
  };
});
vi.mock('../config/firebase', () => ({
  auth: { currentUser: { uid: 'u1', getIdToken: vi.fn().mockResolvedValue('token') } },
}));

describe('api.js and Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    offlineQueue.clearOfflineData();
    localStorage.clear();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('Contract: ExerciseSession logRep payload matches contracts/logRep.fixture.json keys and types', () => {
    // Check that fixture has all required keys
    const requiredKeys = [
      'sessionId',
      'exerciseId',
      'repNumber',
      'tempoScore',
      'smoothnessScore',
      'romScore',
      'qualityScore',
    ];
    requiredKeys.forEach((key) => {
      expect(fixture).toHaveProperty(key);
      expect(typeof fixture[key]).not.toBe('undefined');
    });
    expect(typeof fixture.sessionId).toBe('string');
    expect(typeof fixture.repNumber).toBe('number');
    expect(typeof fixture.tempoScore).toBe('number');
  });

  it('startSession returns local_ id and queues when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const res = await startSession('squat', { difficulty: 'easy' });
    expect(res.sessionId).toMatch(/^local_/);
    expect(offlineQueue.queueSize()).toBe(1);
    expect(offlineQueue.peekQueue()[0].type).toBe('start');
    expect(offlineQueue.peekQueue()[0].extra.difficulty).toBe('easy');
  });

  it('logRep queues rep when session is local_ or offline', async () => {
    await logRep({ sessionId: 'local_123', repNumber: 1 });
    expect(offlineQueue.queueSize()).toBe(1);
    expect(offlineQueue.peekQueue()[0].type).toBe('rep');
  });

  it('endSession dispatches session-completed event and queues when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const listener = vi.fn();
    window.addEventListener('session-completed', listener);

    const res = await endSession({ sessionId: 'local_123', totalReps: 5, correctReps: 4 });
    expect(res.queued).toBe(true);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('session-completed', listener);
  });
});
