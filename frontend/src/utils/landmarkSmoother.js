import { OneEuroFilter } from './oneEuroFilter';

/**
 * Smooths a whole pose (33 landmarks, x/y/z each) frame by frame.
 * If the pose is lost for longer than maxGapMs the filters are cleared, so we never
 * smooth between two unrelated positions.
 */
export class LandmarkSmoother {
  constructor(options = {}, maxGapMs = 500) {
    this.options = options;
    this.maxGapMs = maxGapMs;
    this.filters = [];
    this.lastT = null;
  }

  reset() {
    this.filters = [];
    this.lastT = null;
  }

  smooth(landmarks, tMs) {
    if (!landmarks) return landmarks;
    if (this.lastT !== null && tMs - this.lastT > this.maxGapMs) this.filters = [];
    this.lastT = tMs;

    return landmarks.map((lm, i) => {
      if (!this.filters[i]) {
        this.filters[i] = {
          x: new OneEuroFilter(this.options),
          y: new OneEuroFilter(this.options),
          z: new OneEuroFilter(this.options),
        };
      }
      const f = this.filters[i];
      return {
        ...lm,                                   // keeps visibility / presence untouched
        x: f.x.filter(lm.x, tMs),
        y: f.y.filter(lm.y, tMs),
        z: lm.z != null ? f.z.filter(lm.z, tMs) : lm.z,
      };
    });
  }
}
