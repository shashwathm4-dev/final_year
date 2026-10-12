/**
 * Risk analysis engine for injury-risk and plateau detection (Feature 30).
 * Analyzes multi-session performance trends for an exercise.
 */

function linearRegressionSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = (n * sumXX - sumX * sumX);
  return denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
}

function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

/**
 * @param {Array<Object>} sessions - completed sessions for ONE exercise with summary or reps, sorted by startedAt ascending
 * @param {Object} exercise - exercise config with target_angle_range
 */
function analyzeTrend(sessions, exercise = {}) {
  const completed = (sessions || [])
    .filter((s) => s.status === 'completed' || (s.reps && s.reps.length > 0))
    .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));

  const flags = [];
  const targetMin = exercise.target_angle_range ? exercise.target_angle_range[0] : 80;

  if (completed.length < 3) {
    return {
      riskLevel: 'low',
      flags: [],
      metrics: { n: completed.length },
      disclaimer: 'Screening aid only — not a diagnosis. Discuss changes with your physiotherapist.',
    };
  }

  // Extract metrics per session
  const peakAngles = completed.map((s) => s.summary?.avgPeakAngle || 0);
  const qualities = completed.map((s) => s.summary?.avgQuality || 0);
  const accuracies = completed.map((s) => s.summary?.accuracy || 0);
  const fatigues = completed.map((s) => s.summary?.fatigue?.level || 'none');

  const n = completed.length;
  const slope = linearRegressionSlope(peakAngles);
  const lastAvgPeak = peakAngles[n - 1];

  // 1. Plateau check: >= 4 sessions within 28 days, slope < 0.5 deg/session, last-4 range < 3 deg, and latest avg peak < targetMin
  if (n >= 4) {
    const last4 = peakAngles.slice(n - 4);
    const last4Range = Math.max(...last4) - Math.min(...last4);
    const oldestInLast4 = new Date(completed[n - 4].startedAt || 0).getTime();
    const newestInLast4 = new Date(completed[n - 1].startedAt || 0).getTime();
    const daysSpan = (newestInLast4 - oldestInLast4) / (1000 * 60 * 60 * 24);

    if (daysSpan <= 28 && Math.abs(slope) < 0.5 && last4Range < 3 && lastAvgPeak < targetMin) {
      flags.push({
        code: 'PLATEAU',
        severity: 'watch',
        message: 'Range of motion has leveled off below the target range over recent sessions.',
        evidence: `Slope: ${slope.toFixed(2)}°/session, Range: ${last4Range.toFixed(1)}° across last 4 sessions`,
      });
    }
  }

  // 2. ROM Decline check: mean of last 3 avgPeakAngle >= 8% (or >= 8 deg) below the previous 3
  if (n >= 6) {
    const last3Mean = mean(peakAngles.slice(n - 3));
    const prev3Mean = mean(peakAngles.slice(n - 6, n - 3));
    if (prev3Mean > 0) {
      const dropPct = (prev3Mean - last3Mean) / prev3Mean;
      const dropDeg = prev3Mean - last3Mean;
      if (dropPct >= 0.12) {
        flags.push({
          code: 'ROM_DECLINE',
          severity: 'high',
          message: 'Significant decline in range of motion detected across recent sessions.',
          evidence: `Average peak decreased by ${(dropPct * 100).toFixed(1)}% (${dropDeg.toFixed(1)}°)`,
        });
      } else if (dropPct >= 0.08 || dropDeg >= 8) {
        flags.push({
          code: 'ROM_DECLINE',
          severity: 'watch',
          message: 'Moderate decrease in range of motion noticed across recent sessions.',
          evidence: `Average peak decreased by ${(dropPct * 100).toFixed(1)}% (${dropDeg.toFixed(1)}°)`,
        });
      }
    }
  }

  // 3. Quality Decline: mean quality of last 3 down >= 10 points vs previous 3
  if (n >= 6) {
    const last3Quality = mean(qualities.slice(n - 3));
    const prev3Quality = mean(qualities.slice(n - 6, n - 3));
    if (prev3Quality - last3Quality >= 10) {
      flags.push({
        code: 'QUALITY_DECLINE',
        severity: 'watch',
        message: 'Form quality score has noticeably dropped compared to earlier sessions.',
        evidence: `Quality dropped by ${(prev3Quality - last3Quality).toFixed(1)} points`,
      });
    }
  }

  // 4. Low Accuracy: accuracy < 40% in each of last 3 sessions
  const last3Acc = accuracies.slice(n - 3);
  if (last3Acc.every((acc) => acc < 40)) {
    flags.push({
      code: 'LOW_ACCURACY',
      severity: 'watch',
      message: 'Consistency has remained below 40% in your last three sessions.',
      evidence: `Last 3 session accuracies: ${last3Acc.join('%, ')}%`,
    });
  }

  // 5. Recurring Fatigue: fatigue in {moderate, high} in >= 2 of last 3
  const last3Fatigue = fatigues.slice(n - 3);
  const fatigueHits = last3Fatigue.filter((f) => f === 'moderate' || f === 'high').length;
  if (fatigueHits >= 2) {
    flags.push({
      code: 'RECURRING_FATIGUE',
      severity: 'watch',
      message: 'Fatigue was detected repeatedly during recent sessions.',
      evidence: `Moderate/high fatigue in ${fatigueHits} of the last 3 sessions`,
    });
  }

  // 6. Adherence Gap: last session > 7 days ago
  const lastTs = new Date(completed[n - 1].startedAt || 0).getTime();
  const daysSince = (Date.now() - lastTs) / (1000 * 60 * 60 * 24);
  if (daysSince > 7) {
    flags.push({
      code: 'ADHERENCE_GAP',
      severity: 'info',
      message: 'It has been more than a week since your last practice session.',
      evidence: `${Math.floor(daysSince)} days since last session`,
    });
  }

  // Determine overall risk level
  let riskLevel = 'low';
  if (flags.some((f) => f.severity === 'high')) riskLevel = 'high';
  else if (flags.some((f) => f.severity === 'watch')) riskLevel = 'watch';

  return {
    riskLevel,
    flags,
    metrics: {
      n,
      slope: Math.round(slope * 100) / 100,
      lastAvgPeak: Math.round(lastAvgPeak),
    },
    disclaimer: 'Screening aid only — not a diagnosis. Discuss changes with your physiotherapist.',
  };
}

module.exports = {
  analyzeTrend,
};
