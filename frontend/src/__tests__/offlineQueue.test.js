import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  enqueue,
  peekQueue,
  dropFirst,
  queueSize,
  subscribeQueue,
  readSessionMap,
  writeSessionMap,
  isNetworkError,
  clearOfflineData,
} from '../services/offlineQueue';

describe('offlineQueue service', () => {
  beforeEach(() => {
    localStorage.clear();
    clearOfflineData();
  });

  it('enqueue, peek, dropFirst, and queueSize', () => {
    expect(queueSize()).toBe(0);
    enqueue({ type: 'start', localId: 'local_1', exerciseId: 'squat' });
    expect(queueSize()).toBe(1);

    const queue = peekQueue();
    expect(queue[0].type).toBe('start');
    expect(queue[0].localId).toBe('local_1');

    dropFirst();
    expect(queueSize()).toBe(0);
  });

  it('drops oldest item when 500-item cap is exceeded', () => {
    for (let i = 0; i < 505; i++) {
      enqueue({ type: 'rep', id: i });
    }
    expect(queueSize()).toBe(500);
    const queue = peekQueue();
    expect(queue[0].id).toBe(5); // oldest 5 were dropped
  });

  it('notifies subscribeQueue listeners on write', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeQueue(listener);

    enqueue({ type: 'start', localId: 'local_2' });
    expect(listener).toHaveBeenCalledWith(1);

    dropFirst();
    expect(listener).toHaveBeenCalledWith(0);

    unsubscribe();
    enqueue({ type: 'start', localId: 'local_3' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('readSessionMap and writeSessionMap persist session id mappings', () => {
    writeSessionMap({ local_123: 'real_456' });
    expect(readSessionMap()).toEqual({ local_123: 'real_456' });
  });

  it('isNetworkError matrix: no response, ECONNABORTED, 5xx vs 4xx', () => {
    expect(isNetworkError({})).toBe(true); // no response
    expect(isNetworkError({ code: 'ECONNABORTED' })).toBe(true);
    expect(isNetworkError({ response: { status: 500 } })).toBe(true);
    expect(isNetworkError({ response: { status: 503 } })).toBe(true);

    // 4xx errors are client errors, not temporary network outages
    expect(isNetworkError({ response: { status: 400 } })).toBe(false);
    expect(isNetworkError({ response: { status: 403 } })).toBe(false);
    expect(isNetworkError({ response: { status: 404 } })).toBe(false);
  });

  it('clearOfflineData clears queue and map', () => {
    enqueue({ type: 'start' });
    writeSessionMap({ a: 'b' });
    clearOfflineData();
    expect(queueSize()).toBe(0);
    expect(readSessionMap()).toEqual({});
  });
});
