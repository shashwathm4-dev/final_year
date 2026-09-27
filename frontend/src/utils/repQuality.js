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
