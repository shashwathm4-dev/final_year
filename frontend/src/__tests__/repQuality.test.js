import { describe, it, expect } from 'vitest';
import { computeRepQuality } from '../utils/repQuality';

const cfg = { target_angle_range: [70, 110] };
// smooth up-and-down rep, 1:1 tempo, peaks at 90
const smoothRep = () => {
  const up = [0, 15, 30, 45, 60, 75, 90];
  const down = [75, 60, 45, 30, 15, 0];
  return [...up, ...down].map((angle, i) => ({ angle, timestamp: i * 100 }));
};

describe('computeRepQuality', () => {
  it('returns neutral scores when there are too few frames', () => {
    const q = computeRepQuality([{ angle: 1, timestamp: 0 }], cfg);
    expect(q.qualityScore).toBe(70);
    expect(q.limitingFactor).toBe('Insufficient frame data');
  });

  it('scores a smooth, in-range, symmetric rep highly', () => {
    const q = computeRepQuality(smoothRep(), cfg);
    expect(q.romScore).toBe(100);
    expect(q.tempoScore).toBeGreaterThanOrEqual(95);
    expect(q.qualityScore).toBeGreaterThanOrEqual(90);
    expect(q.limitingFactor).toBe('Optimal Form');
  });

  it('penalises a rep that does not reach the target range', () => {
    const shallow = smoothRep().map((f) => ({ ...f, angle: f.angle * 0.5 })); // peak 45
    const q = computeRepQuality(shallow, cfg);
    expect(q.romScore).toBeLessThan(80);
    expect(q.limitingFactor).toBe('Range of Motion');
  });

  it('penalises a very uneven tempo', () => {
    const frames = smoothRep().map((f, i) => ({ ...f, timestamp: i < 7 ? i * 100 : 700 + (i - 6) * 1500 }));
    const q = computeRepQuality(frames, cfg);
    expect(q.tempoScore).toBeLessThan(60);
  });

  it('keeps every score between 0 and 100', () => {
    const q = computeRepQuality(smoothRep(), cfg);
    [q.tempoScore, q.smoothnessScore, q.romScore, q.qualityScore].forEach((s) => {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    });
  });
});
