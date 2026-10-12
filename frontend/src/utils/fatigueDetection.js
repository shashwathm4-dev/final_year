/**
 * Fatigue detection utility — pure function, dependency free.
 * Computes fatigue indicators from a sequence of completed reps.
 * Keep in sync with backend/src/services/sessionMetrics.js
 */

function median(arr) {
  if (!arr || arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

/**
 * @param {Array<{ repNumber: number, durationMs?: number, peakAngle?: number, smoothnessScore?: number, qualityScore?: number }>} reps
 * @returns {{ level: 'none'|'mild'|'moderate'|'high', index: number, signals: Array<{code: string, label: string, value: number}>, enoughData: boolean }}
 */
export function computeFatigue(reps) {
  if (!Array.isArray(reps) || reps.length < 4) {
    return { level: 'none', index: 0, signals: [], enoughData: false };
  }

  const n = reps.length;
  const windowSize = Math.max(2, Math.floor(n / 3));
  const baseReps = reps.slice(0, windowSize);
  const recentReps = reps.slice(n - windowSize);

  const baseDuration = median(baseReps.map((r) => r.durationMs || 2000));
  const recentDuration = median(recentReps.map((r) => r.durationMs || 2000));

  const basePeak = median(baseReps.map((r) => r.peakAngle || 0));
  const recentPeak = median(recentReps.map((r) => r.peakAngle || 0));

  const baseSmooth = median(baseReps.map((r) => r.smoothnessScore ?? 80));
  const recentSmooth = median(recentReps.map((r) => r.smoothnessScore ?? 80));

  const baseQuality = median(baseReps.map((r) => r.qualityScore ?? 80));
  const recentQuality = median(recentReps.map((r) => r.qualityScore ?? 80));

  const signals = [];

  // 1. Tempo slowdown
  const tempoDrop = baseDuration > 0 ? (recentDuration - baseDuration) / baseDuration : 0;
  if (tempoDrop >= 0.20) {
    signals.push({
      code: 'tempo',
      label: 'Reps are getting slower',
      value: Math.round(tempoDrop * 100),
    });
  }

  // 2. ROM reduction
  const romDrop = basePeak > 0 ? (basePeak - recentPeak) / basePeak : 0;
  if (romDrop >= 0.08) {
    signals.push({
      code: 'rom',
      label: 'Range of motion is decreasing',
      value: Math.round(romDrop * 100),
    });
  }

  // 3. Smoothness decline
  const smoothDrop = baseSmooth - recentSmooth;
  if (smoothDrop >= 10) {
    signals.push({
      code: 'smoothness',
      label: 'Movement steadiness is decreasing',
      value: Math.round(smoothDrop),
    });
  }

  // 4. Quality decline
  const qualityDrop = baseQuality - recentQuality;
  if (qualityDrop >= 10) {
    signals.push({
      code: 'quality',
      label: 'Form accuracy is dropping',
      value: Math.round(qualityDrop),
    });
  }

  // Weighted index 0-100
  const tempoTerm = 0.30 * clamp01(tempoDrop / 0.5);
  const romTerm = 0.30 * clamp01(romDrop / 0.25);
  const smoothTerm = 0.20 * clamp01(smoothDrop / 30);
  const qualityTerm = 0.20 * clamp01(qualityDrop / 30);

  const index = clamp(0, 100, 100 * (tempoTerm + romTerm + smoothTerm + qualityTerm));
  const roundedIndex = Math.round(index);

  let level = 'none';
  if (roundedIndex >= 70) level = 'high';
  else if (roundedIndex >= 45) level = 'moderate';
  else if (roundedIndex >= 20) level = 'mild';

  return {
    level,
    index: roundedIndex,
    signals,
    enoughData: true,
  };
}
