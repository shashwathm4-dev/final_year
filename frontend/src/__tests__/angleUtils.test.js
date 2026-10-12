import { describe, it, expect } from 'vitest';
import { vectorAngle, threePointAngle, lineToLineAngle, computeShoulderAbductionAngle } from '../utils/angleUtils';

describe('vectorAngle', () => {
  it('returns 90 for perpendicular vectors', () => {
    expect(vectorAngle([1, 0], [0, 1])).toBeCloseTo(90, 5);
  });
  it('returns 0 for identical direction and 180 for opposite', () => {
    expect(vectorAngle([2, 0], [5, 0])).toBeCloseTo(0, 5);
    expect(vectorAngle([1, 0], [-1, 0])).toBeCloseTo(180, 5);
  });
  it('returns 0 for a zero-length vector', () => {
    expect(vectorAngle([0, 0], [1, 0])).toBe(0);
  });
});

describe('threePointAngle', () => {
  it('measures the angle at the middle point', () => {
    expect(threePointAngle([1, 0], [0, 0], [0, 1])).toBeCloseTo(90, 5);
    expect(threePointAngle([1, 0], [0, 0], [-1, 0])).toBeCloseTo(180, 5);
  });
  it('returns null when a point is missing', () => {
    expect(threePointAngle(null, [0, 0], [1, 1])).toBeNull();
  });
});

describe('lineToLineAngle', () => {
  it('is 0 for parallel lines and 90 for perpendicular lines', () => {
    expect(lineToLineAngle([0, 0], [1, 0], [0, 1], [1, 1])).toBeCloseTo(0, 5);
    expect(lineToLineAngle([0, 0], [1, 0], [0, 0], [0, 1])).toBeCloseTo(90, 5);
  });
  it('never exceeds 90', () => {
    expect(lineToLineAngle([0, 0], [1, 0], [0, 0], [-1, 0.01])).toBeLessThanOrEqual(90);
  });
});

describe('computeShoulderAbductionAngle', () => {
  const lm = (x, y, visibility = 0.9) => ({ x, y, visibility });
  const base = Array(33).fill(null);

  it('is ~0 when the arm hangs straight down', () => {
    const l = [...base];
    l[11] = lm(0.5, 0.3);
    l[13] = lm(0.5, 0.6);
    const r = computeShoulderAbductionAngle(l);
    expect(r.angle).toBeCloseTo(0, 0);
  });

  it('is ~90 when the arm is horizontal', () => {
    const l = [...base];
    l[11] = lm(0.5, 0.3);
    l[13] = lm(0.8, 0.3);
    const r = computeShoulderAbductionAngle(l);
    expect(r.angle).toBeCloseTo(90, 0);
  });

  it('returns zero confidence with no landmarks', () => {
    expect(computeShoulderAbductionAngle(null)).toEqual({ angle: 0, confidence: 0 });
  });
});
