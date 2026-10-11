/**
 * One Euro Filter (Casiez et al., 2012): low-pass filter whose cutoff rises with speed.
 *  minCutoff  smaller = smoother at rest (Hz)
 *  beta       larger  = less lag during fast motion
 *  dCutoff    cutoff for the speed estimate (Hz)
 */
function smoothingFactor(dtSec, cutoffHz) {
  const r = 2 * Math.PI * cutoffHz * dtSec;
  return r / (r + 1);
}

export class OneEuroFilter {
  constructor({ minCutoff = 1.5, beta = 8, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  /** @param {number} x value  @param {number} tMs timestamp in milliseconds */
  filter(x, tMs) {
    if (this.tPrev === null) {
      this.xPrev = x;
      this.dxPrev = 0;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    const dx = (x - this.xPrev) / dt;
    const aD = smoothingFactor(dt, this.dCutoff);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = smoothingFactor(dt, cutoff);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}
