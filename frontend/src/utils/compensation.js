/**
 * Compensation detection — flags body shifts that "cheat" an exercise.
 * Works on the 2D landmarks (640x480 pixel-aspect space) and compares each frame
 * with a baseline captured while the user stands ready before the session starts.
 *
 *  trunk_lean    upper body tilts away from vertical            (> 12°)
 *  hip_tilt      hip line tilts from its resting angle          (> 8°)
 *  shoulder_hike ear-to-shoulder gap shrinks (shoulder shrug)   (> 25 %)
 * Thresholds are constants below, so they are easy to tune.
 */
const VIS = 0.5;
const SIZE = { w: 640, h: 480 };
const THRESHOLDS = { trunk_lean: 12, hip_tilt: 8, shoulder_hike: 0.25 };

export const COMPENSATION_LABELS = {
  trunk_lean: 'Leaning your body',
  hip_tilt: 'Tilting your hips',
  shoulder_hike: 'Shrugging your shoulder',
};

export const COMPENSATION_CUES = {
  trunk_lean: 'Keep your body upright',
  hip_tilt: 'Keep your hips level',
  shoulder_hike: 'Relax your shoulders',
};

const visible = (l) => l && (l.visibility == null || l.visibility >= VIS);

// Fold an angle into [-90, 90] so left/right ordering of landmarks doesn't matter
function fold(deg) {
  let a = deg;
  while (a > 90) a -= 180;
  while (a < -90) a += 180;
  return a;
}

/** Measures posture numbers for one frame. Missing/invisible landmarks simply omit a key. */
export function measurePosture(lm, size = SIZE) {
  const out = {};
  if (!lm) return out;
  const ls = lm[11], rs = lm[12], lh = lm[23], rh = lm[24], le = lm[7], re = lm[8];

  if (visible(ls) && visible(rs) && visible(lh) && visible(rh)) {
    const sx = ((ls.x + rs.x) / 2 - (lh.x + rh.x) / 2) * size.w;
    const sy = ((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2) * size.h;
    out.trunkLean = fold((Math.atan2(sx, -sy) * 180) / Math.PI);          // 0 = upright
    out.hipTilt = fold((Math.atan2((rh.y - lh.y) * size.h, (rh.x - lh.x) * size.w) * 180) / Math.PI);
  }

  if (visible(ls) && visible(rs) && visible(le) && visible(re)) {
    const gap = ((ls.y + rs.y) / 2 - (le.y + re.y) / 2) * size.h;
    const width = Math.hypot((rs.x - ls.x) * size.w, (rs.y - ls.y) * size.h) || 1;
    out.shoulderHike = gap / width;                                         // shrinks when shrugging
  }
  return out;
}

/** Average of several posture samples (needs at least 10). Returns null if not enough. */
export function averagePosture(samples) {
  if (!samples || samples.length < 10) return null;
  const sums = {}, counts = {};
  samples.forEach((s) =>
    Object.entries(s).forEach(([k, v]) => {
      sums[k] = (sums[k] || 0) + v;
      counts[k] = (counts[k] || 0) + 1;
    })
  );
  const out = {};
  Object.keys(sums).forEach((k) => {
    if (counts[k] >= samples.length * 0.6) out[k] = sums[k] / counts[k];
  });
  return out;
}

/** Returns the list of compensation keys active in this frame. */
export function flagCompensations(posture, baseline, checks) {
  if (!posture || !baseline || !checks || checks.length === 0) return [];
  const flags = [];

  if (checks.includes('trunkLean') && posture.trunkLean != null && baseline.trunkLean != null &&
      Math.abs(posture.trunkLean - baseline.trunkLean) > THRESHOLDS.trunk_lean) {
    flags.push('trunk_lean');
  }
  if (checks.includes('hipTilt') && posture.hipTilt != null && baseline.hipTilt != null &&
      Math.abs(posture.hipTilt - baseline.hipTilt) > THRESHOLDS.hip_tilt) {
    flags.push('hip_tilt');
  }
  if (checks.includes('shoulderHike') && posture.shoulderHike != null && baseline.shoulderHike > 0 &&
      (baseline.shoulderHike - posture.shoulderHike) / baseline.shoulderHike > THRESHOLDS.shoulder_hike) {
    flags.push('shoulder_hike');
  }
  return flags;
}

/** Keys flagged in at least `minShare` of a rep's frames. */
export function summarizeCompensations(frames, minShare = 0.25) {
  if (!frames || frames.length === 0) return [];
  const counts = {};
  frames.forEach((f) => (f.flags || []).forEach((k) => { counts[k] = (counts[k] || 0) + 1; }));
  return Object.keys(counts).filter((k) => counts[k] / frames.length >= minShare);
}
