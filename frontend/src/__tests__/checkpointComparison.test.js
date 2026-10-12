import { describe, it, expect } from 'vitest';
import { computeCheckpoints, compareToReference, describeMismatch } from '../utils/checkpointComparison';

const frames = (angles) => angles.map((angle, i) => ({ angle, timestamp: i * 33 }));

describe('computeCheckpoints', () => {
  it('returns null with fewer than 5 frames', () => {
    expect(computeCheckpoints(frames([1, 2, 3, 4]))).toBeNull();
    expect(computeCheckpoints(null)).toBeNull();
  });
  it('samples 0/25/50/75/100 percent of the rep', () => {
    const cps = computeCheckpoints(frames([0, 10, 20, 30, 40, 50, 60, 70, 80]));
    expect(cps).toEqual([0, 20, 40, 60, 80]);
  });
});

describe('compareToReference', () => {
  const ref = [5, 45, 90, 45, 5];
  const thr = [10, 10, 10, 10, 10];

  it('passes when every delta is within its threshold', () => {
    const r = compareToReference([6, 47, 85, 44, 8], ref, thr);
    expect(r.passed).toBe(true);
    expect(r.failedCheckpoints).toEqual([]);
  });
  it('fails and lists the checkpoints that are too far off', () => {
    const r = compareToReference([5, 45, 60, 45, 5], ref, thr);
    expect(r.passed).toBe(false);
    expect(r.failedCheckpoints).toEqual([2]);
    expect(r.maxDelta).toBe(30);
  });
  it('fails safely on missing input', () => {
    expect(compareToReference(null, ref, thr).passed).toBe(false);
  });
});

describe('describeMismatch', () => {
  it('describes failed checkpoints', () => {
    const text = describeMismatch([2], [0, 0, 30, 0, 0]);
    expect(text).toContain('Peak (50%)');
    expect(text).toContain('30');
  });
  it('reports all-clear when nothing failed', () => {
    expect(describeMismatch([], [])).toBe('All checkpoints within range.');
  });
});
