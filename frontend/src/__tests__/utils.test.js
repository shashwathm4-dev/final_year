import { describe, it, expect, vi } from 'vitest';
import { flagCompensations } from '../utils/compensation';
import { checkFraming } from '../utils/framingCheck';
import { OneEuroFilter } from '../utils/oneEuroFilter';
import { LandmarkSmoother } from '../utils/landmarkSmoother';
import { localCoach } from '../utils/localCoach';
import { getConsent, saveConsentLocal } from '../utils/consent';
import { mirrorIndex, applySide } from '../utils/sideUtils';
import { getLandmark, midpoint, isVisible } from '../utils/landmarkUtils';
import { drawSkeleton } from '../utils/canvasDrawing';

describe('Frontend Utils Unit Tests', () => {
  it('flagCompensations handles empty posture without throwing', () => {
    const res = flagCompensations(null, null, []);
    expect(res).toEqual([]);
  });

  it('checkFraming detects missing landmarks or out of bounds', () => {
    const emptyRes = checkFraming(null);
    expect(emptyRes.ok).toBe(false);

    const goodLandmarks = Array(33).fill(null).map((_, i) => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    goodLandmarks[11] = { x: 0.4, y: 0.3, visibility: 0.9 }; // left shoulder
    goodLandmarks[12] = { x: 0.6, y: 0.3, visibility: 0.9 }; // right shoulder (width = 0.2)
    const goodRes = checkFraming(goodLandmarks, { landmarkIndices: { hip: 23, knee: 25 } });
    expect(goodRes.ok).toBe(true);
  });

  it('OneEuroFilter filters noisy signal smoothly', () => {
    const filter = new OneEuroFilter(60, 1.0, 0.0, 1.0);
    const v1 = filter.filter(10, 0);
    const v2 = filter.filter(100, 0.016);
    expect(v1).toBe(10);
    expect(v2).toBeLessThan(100);
    expect(v2).toBeGreaterThan(10);
  });

  it('LandmarkSmoother smoothes 33 pose landmarks', () => {
    const smoother = new LandmarkSmoother();
    const lms = Array(33).fill({ x: 0.5, y: 0.5, z: 0, visibility: 0.9 });
    const smoothed = smoother.smooth(lms, 0);
    expect(smoothed.length).toBe(33);
    expect(smoothed[0].x).toBeCloseTo(0.5);
  });

  it('localCoach generates rule-based coaching text without network', () => {
    const coach = localCoach([
      { correct: true, qualityScore: 85 },
      { correct: true, qualityScore: 90 },
    ]);
    expect(coach).toHaveProperty('headline');
    expect(coach).toHaveProperty('summary');
    expect(coach.source).toBe('offline');
  });

  it('consent storage get and set works with localStorage', () => {
    saveConsentLocal('u1', { accepted: true, cloudAi: true, version: '1' });
    const c = getConsent('u1');
    expect(c.accepted).toBe(true);
    expect(c.cloudAi).toBe(true);
  });

  it('mirrorIndex mirrors joints left to right', () => {
    expect(mirrorIndex(11)).toBe(12); // left shoulder -> right shoulder
    expect(mirrorIndex(12)).toBe(11); // right shoulder -> left shoulder
  });

  it('landmarkUtils: midpoint and isVisible', () => {
    const p1 = { x: 0, y: 0, z: 0, visibility: 1 };
    const p2 = { x: 10, y: 10, z: 0, visibility: 0.8 };
    const mid = midpoint(p1, p2);
    expect(mid.x).toBe(5);
    expect(mid.y).toBe(5);
    expect(isVisible(p1, 0.5)).toBe(true);
  });

  it('drawSkeleton calls canvas 2d context drawing methods', () => {
    const mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      set strokeStyle(v) {},
      set fillStyle(v) {},
      set lineWidth(v) {},
    };
    const landmarks = Array(33).fill({ x: 0.5, y: 0.5, visibility: 0.9 });
    drawSkeleton(mockCtx, landmarks, 640, 480);
    expect(mockCtx.clearRect).toHaveBeenCalled();
  });
});
