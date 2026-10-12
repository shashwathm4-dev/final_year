/**
 * repQuality.js — Kinematic rep quality heuristics.
 * Evaluates:
 * 1. Tempo score (0-100): Phase symmetry between ascent and descent.
 * 2. Smoothness score (0-100): Low acceleration jitter / delta variance.
 * 3. Range of Motion (ROM) consistency (0-100): Percentage of target peak angle reached.
 * 4. Overall quality score (0-100): Weighted aggregate.
 */

/**
 * Compute rep quality scores from recorded frame buffer.
 * @param {Array<{ angle: number, timestamp: number }>} frames
 * @param {Object} exerciseConfig
 * @returns {{ tempoScore: number, smoothnessScore: number, romScore: number, qualityScore: number, limitingFactor: string }}
 */
export function computeRepQuality(frames, exerciseConfig) {
  if (!frames || frames.length < 5) {
    return {
      tempoScore: 70,
      smoothnessScore: 70,
      romScore: 70,
      qualityScore: 70,
      limitingFactor: 'Insufficient frame data',
    };
  }

  const angles = frames.map((f) => f.angle);
  const timestamps = frames.map((f) => f.timestamp || 0);

  // 1. Identify Peak Index
  let peakIdx = 0;
  let maxAngle = -Infinity;
  let minAngle = Infinity;

  for (let i = 0; i < angles.length; i++) {
    if (angles[i] > maxAngle) {
      maxAngle = angles[i];
      peakIdx = i;
    }
    if (angles[i] < minAngle) {
      minAngle = angles[i];
    }
  }

  // 2. Tempo Score (Phase Symmetry)
  // Optimal movement has balanced ascent and descent durations (~1:1 ratio)
  const durationTotal = Math.max(1, timestamps[timestamps.length - 1] - timestamps[0]);
  const durationAscent = Math.max(1, (timestamps[peakIdx] || timestamps[0]) - timestamps[0]);
  const durationDescent = Math.max(1, timestamps[timestamps.length - 1] - (timestamps[peakIdx] || timestamps[0]));

  const phaseRatio = durationAscent / durationDescent;
  // Score drops if ratio deviates from 1.0 (ideal symmetry)
  const ratioDeviation = Math.abs(1.0 - phaseRatio);
  const tempoScore = Math.max(20, Math.min(100, Math.round(100 - ratioDeviation * 45)));

  // 3. Smoothness Score (Jitter / Delta Variance)
  const deltas = [];
  for (let i = 1; i < angles.length; i++) {
    deltas.push(Math.abs(angles[i] - angles[i - 1]));
  }

  const meanDelta = deltas.reduce((acc, d) => acc + d, 0) / (deltas.length || 1);
  const variance = deltas.reduce((acc, d) => acc + Math.pow(d - meanDelta, 2), 0) / (deltas.length || 1);
  // High variance indicates jerky / stuttered motion
  const smoothnessScore = Math.max(25, Math.min(100, Math.round(100 - Math.min(60, variance * 1.5))));

  // 4. ROM Consistency Score
  let romScore = 85;
  if (exerciseConfig && exerciseConfig.target_angle_range) {
    const [targetMin, targetMax] = exerciseConfig.target_angle_range;
    if (maxAngle >= targetMin) {
      if (maxAngle <= targetMax + 15) {
        romScore = 100;
      } else {
        // Hyperextension penalty
        const excess = maxAngle - targetMax;
        romScore = Math.max(40, Math.round(100 - excess * 2));
      }
    } else {
      // Incomplete ROM
      const missing = targetMin - maxAngle;
      romScore = Math.max(30, Math.round(100 - missing * 2.5));
    }
  }

  // 5. Overall Weighted Quality Score
  // Weights: 40% ROM, 35% Smoothness, 25% Tempo
  const qualityScore = Math.round(romScore * 0.4 + smoothnessScore * 0.35 + tempoScore * 0.25);

  // 6. Identify Limiting Factor
  let limitingFactor = 'Optimal Form';
  const lowest = Math.min(romScore, smoothnessScore, tempoScore);
  if (lowest < 75) {
    if (lowest === romScore) limitingFactor = 'Range of Motion';
    else if (lowest === smoothnessScore) limitingFactor = 'Movement Smoothness';
    else limitingFactor = 'Movement Tempo / Pacing';
  }

  return {
    tempoScore,
    smoothnessScore,
    romScore,
    qualityScore,
    limitingFactor,
  };
}

/**
 * Quality scores for a completed hold. Mapped onto the same field names used for reps
 * so logging and summaries keep working:
 *   romScore -> accuracy (how close to the target angle)
 *   smoothnessScore -> steadiness (low wobble)
 *   tempoScore -> continuity (few interruptions)
 */
export function computeHoldQuality(frames, exerciseConfig, repData) {
  const h = exerciseConfig && exerciseConfig.hold;
  const angles = (frames || []).map((f) => f.angle);
  if (!h || angles.length < 5) {
    return { tempoScore: 70, smoothnessScore: 70, romScore: 70, qualityScore: 70, limitingFactor: 'Insufficient frame data' };
  }

  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const meanDev = avg(angles.map((a) => Math.abs(a - h.targetAngle)));
  const romScore = clamp(Math.round(100 - (meanDev / h.tolerance) * 40), 20, 100);

  const mean = avg(angles);
  const sd = Math.sqrt(avg(angles.map((a) => (a - mean) ** 2)));
  const smoothnessScore = clamp(Math.round(100 - sd * 6), 25, 100);

  const tempoScore = clamp(100 - (repData && repData.breaks ? repData.breaks * 20 : 0), 20, 100);

  const qualityScore = Math.round(romScore * 0.4 + smoothnessScore * 0.35 + tempoScore * 0.25);

  let limitingFactor = 'Optimal Form';
  const lowest = Math.min(romScore, smoothnessScore, tempoScore);
  if (lowest < 75) {
    if (lowest === romScore) limitingFactor = 'Hold Accuracy';
    else if (lowest === smoothnessScore) limitingFactor = 'Hold Steadiness';
    else limitingFactor = 'Hold Continuity';
  }
  return { tempoScore, smoothnessScore, romScore, qualityScore, limitingFactor };
}

/** Resample a rep's angle sequence to N evenly spaced points (linear interpolation). */
export function resampleCurve(frames, n = 16) {
  if (!frames || frames.length < 2) return null;
  const a = frames.map((f) => f.angle);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * (a.length - 1);
    const lo = Math.floor(pos), hi = Math.min(a.length - 1, lo + 1);
    out.push(Math.round((a[lo] + (a[hi] - a[lo]) * (pos - lo)) * 10) / 10);
  }
  return out;
}

