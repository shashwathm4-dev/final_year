/**
 * Calibration storage + maths.
 * Stored in localStorage (lean, no backend changes). Key: calib:<uid>:<exerciseId>:<side>
 */
const key = (uid, exerciseId, side) => `calib:${uid || 'anon'}:${exerciseId}:${side || 'na'}`;

export function loadCalibration(uid, exerciseId, side) {
  try {
    const raw = localStorage.getItem(key(uid, exerciseId, side));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveCalibration(uid, exerciseId, side, cal) {
  try {
    localStorage.setItem(key(uid, exerciseId, side), JSON.stringify(cal));
  } catch {
    // storage unavailable: calibration just won't persist
  }
}

export function clearCalibration(uid, exerciseId, side) {
  try {
    localStorage.removeItem(key(uid, exerciseId, side));
  } catch {
    // ignore
  }
}

export function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[i];
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

/**
 * Returns a copy of `cfg` whose thresholds / reference checkpoints are scaled to the patient's range.
 * cal = { restAngle, maxAngle }
 */
export function calibrateConfig(cfg, cal) {
  if (!cfg || !cal || cfg.mode === 'hold') return cfg;
  const refs = cfg.referenceCheckpoints;
  if (!Array.isArray(refs) || refs.length !== 5) return cfg;

  const clinicalRest = refs[0];
  const clinicalPeak = Math.max(...refs);
  const clinicalRange = clinicalPeak - clinicalRest;
  if (clinicalRange <= 5) return cfg;

  const scale = clamp((cal.maxAngle - cal.restAngle) / clinicalRange, 0.4, 1.0);
  const map = (x) => round1(cal.restAngle + (x - clinicalRest) * scale);

  const startAngleThreshold = map(cfg.startAngleThreshold);
  const peakAngleThreshold = Math.max(map(cfg.peakAngleThreshold), startAngleThreshold + 5);
  const returnAngleThreshold = clamp(
    map(cfg.returnAngleThreshold),
    startAngleThreshold + 2,
    peakAngleThreshold - 3
  );

  return {
    ...cfg,
    startAngleThreshold,
    peakAngleThreshold,
    returnAngleThreshold,
    target_angle_range: cfg.target_angle_range.map(map),
    referenceCheckpoints: refs.map(map),
    checkpoint_thresholds: cfg.checkpoint_thresholds.map((t) => Math.round(t * Math.max(scale, 0.7))),
    calibration: { scale: Math.round(scale * 100) / 100, restAngle: cal.restAngle, maxAngle: cal.maxAngle },
  };
}
