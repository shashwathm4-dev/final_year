/**
 * Server-side session metrics and fatigue summarization.
 * Used by coaching, personalized difficulty, and risk analysis.
 * Keep fatigue algorithm in sync with frontend/src/utils/fatigueDetection.js
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

function computeFatigue(reps) {
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

  const tempoDrop = baseDuration > 0 ? (recentDuration - baseDuration) / baseDuration : 0;
  if (tempoDrop >= 0.20) {
    signals.push({
      code: 'tempo',
      label: 'Reps are getting slower',
      value: Math.round(tempoDrop * 100),
    });
  }

  const romDrop = basePeak > 0 ? (basePeak - recentPeak) / basePeak : 0;
  if (romDrop >= 0.08) {
    signals.push({
      code: 'rom',
      label: 'Range of motion is decreasing',
      value: Math.round(romDrop * 100),
    });
  }

  const smoothDrop = baseSmooth - recentSmooth;
  if (smoothDrop >= 10) {
    signals.push({
      code: 'smoothness',
      label: 'Movement steadiness is decreasing',
      value: Math.round(smoothDrop),
    });
  }

  const qualityDrop = baseQuality - recentQuality;
  if (qualityDrop >= 10) {
    signals.push({
      code: 'quality',
      label: 'Form accuracy is dropping',
      value: Math.round(qualityDrop),
    });
  }

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

/**
 * Summarize an entire session's reps server-side.
 * @param {Object} session
 */
function summarizeSession(session) {
  const reps = Array.isArray(session?.reps) ? session.reps : [];
  const repCount = reps.length;
  const correctReps = reps.filter((r) => r.correct === true).length;
  const accuracy = repCount > 0 ? Math.round((correctReps / repCount) * 100) : 0;

  const validPeaks = reps.map((r) => r.peakAngle).filter((n) => typeof n === 'number' && Number.isFinite(n));
  const avgPeakAngle = validPeaks.length > 0 ? Math.round(validPeaks.reduce((a, b) => a + b, 0) / validPeaks.length) : 0;
  const maxPeakAngle = validPeaks.length > 0 ? Math.max(...validPeaks) : 0;

  const validQuality = reps.map((r) => r.qualityScore).filter((n) => typeof n === 'number' && Number.isFinite(n));
  const avgQuality = validQuality.length > 0 ? Math.round(validQuality.reduce((a, b) => a + b, 0) / validQuality.length) : 0;

  const validDurations = reps.map((r) => r.durationMs).filter((n) => typeof n === 'number' && Number.isFinite(n));
  const avgDurationMs = validDurations.length > 0 ? Math.round(validDurations.reduce((a, b) => a + b, 0) / validDurations.length) : 0;

  const fatigue = computeFatigue(reps);

  return {
    repCount,
    correctReps,
    accuracy,
    avgPeakAngle,
    maxPeakAngle,
    avgQuality,
    avgDurationMs,
    fatigue,
  };
}

module.exports = {
  computeFatigue,
  summarizeSession,
};
