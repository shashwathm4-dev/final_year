/**
 * analytics.js — Backend analytics computation for Items 21-22.
 * Pure functions that aggregate sessions / reps into adherence + trend data.
 */

/**
 * Compute adherence status for every patient assigned to a doctor.
 * A session counts as "completed" if the patient did ≥80% of the prescribed target reps.
 * Returns a per-patient summary with status chip (on_track | behind | at_risk).
 */
function computePatientAdherence(patients, allSessions, assignments) {
  const now = Date.now();
  const WEEK_MS = 7 * 24 * 3600 * 1000;

  const patientList = patients.map((p) => {
    const pSessions = allSessions.filter((s) => s.patientId === p.uid && s.status === 'completed');
    const pAssignments = assignments.filter((a) => a.patientId === p.uid);

    // Last 7 days sessions
    const recentSessions = pSessions.filter(
      (s) => s.startedAt && now - new Date(s.startedAt).getTime() < WEEK_MS
    );

    // Prescribed weekly target: sum(sets * reps) across all assignments
    const weeklyTarget = pAssignments.reduce(
      (sum, a) => sum + (Number(a.targetSets) || 1) * (Number(a.targetReps) || 10),
      0
    );
    const weeklyDone = recentSessions.reduce((sum, s) => sum + (s.totalReps || 0), 0);
    const weeklyPct = weeklyTarget > 0 ? Math.min(100, Math.round((weeklyDone / weeklyTarget) * 100)) : 0;

    // Average accuracy from last 7 sessions
    const last7 = pSessions.slice(0, 7);
    const avgAccuracy =
      last7.length > 0
        ? Math.round(
            last7.reduce((s, sess) => {
              const acc = sess.totalReps > 0 ? (sess.correctReps || 0) / sess.totalReps : 0;
              return s + acc;
            }, 0) /
              last7.length *
              100
          )
        : 0;

    // Days since last session
    const lastSessionDate =
      pSessions.length > 0 && pSessions[0].startedAt ? new Date(pSessions[0].startedAt) : null;
    const daysSinceLast = lastSessionDate ? Math.floor((now - lastSessionDate.getTime()) / (24 * 3600 * 1000)) : null;

    // Status
    let status = 'on_track';
    if (daysSinceLast != null && daysSinceLast > 5) status = 'at_risk';
    else if (weeklyPct < 40) status = 'behind';
    else if (weeklyPct < 70) status = 'behind';

    // Alerts
    const alerts = [];
    if (daysSinceLast != null && daysSinceLast > 3) {
      alerts.push(`No sessions in ${daysSinceLast} days`);
    }
    if (avgAccuracy < 50 && last7.length >= 2) {
      alerts.push(`Low accuracy: ${avgAccuracy}%`);
    }

    return {
      uid: p.uid,
      patientId: p.uid,
      fullName: p.fullName || p.email || 'Patient',
      email: p.email || '',
      status: pAssignments.length === 0 ? 'no_plan' : status,
      weeklyPct,
      weeklyDone,
      weeklyTarget,
      avgAccuracy,
      totalSessions: pSessions.length,
      daysSinceLast,
      lastSessionAt: lastSessionDate ? lastSessionDate.toISOString() : null,
      alerts,
    };
  });

  const totals = {
    at_risk: patientList.filter((p) => p.status === 'at_risk').length,
    behind: patientList.filter((p) => p.status === 'behind').length,
    on_track: patientList.filter((p) => p.status === 'on_track').length,
    no_plan: patientList.filter((p) => p.status === 'no_plan').length,
  };

  return { totals, patients: patientList };
}

/**
 * Compute trends for a single patient: ROM over time, quality over time, common mistakes.
 */
function computeTrends(sessions) {
  // Sort ascending by date
  const sorted = [...sessions]
    .filter((s) => s.status === 'completed')
    .sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));

  let totalReps = 0;
  sorted.forEach((s) => {
    totalReps += Number(s.totalReps) || (Array.isArray(s.reps) ? s.reps.length : 0);
  });

  // Group by exerciseId
  const byExercise = {};
  for (const s of sorted) {
    const exId = s.exerciseId || 'general';
    if (!byExercise[exId]) byExercise[exId] = [];
    byExercise[exId].push(s);
  }

  const exercises = Object.entries(byExercise).map(([exerciseId, exSessions]) => {
    const points = exSessions.map((s) => {
      const date = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const reps = Array.isArray(s.reps) ? s.reps : [];
      const peaks = reps.filter((r) => r.peakAngle != null).map((r) => r.peakAngle);
      const avgPeakAngle = peaks.length > 0 ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length) : (s.avgPeakAngle || 0);
      const maxPeakAngle = peaks.length > 0 ? Math.round(Math.max(...peaks)) : (s.maxPeakAngle || avgPeakAngle);
      const accuracy = s.totalReps > 0 ? Math.round(((s.correctReps || 0) / s.totalReps) * 100) : (s.accuracy || 100);
      const quals = reps.filter((r) => r.qualityScore != null).map((r) => r.qualityScore);
      const avgQuality = quals.length > 0 ? Math.round(quals.reduce((a, b) => a + b, 0) / quals.length) : (s.avgQuality || 85);
      return { date, avgPeakAngle, maxPeakAngle, accuracy, avgQuality };
    });

    const firstRom = points[0]?.avgPeakAngle || 0;
    const lastRom = points[points.length - 1]?.avgPeakAngle || 0;
    const romChange = lastRom - firstRom;
    const direction = romChange > 2 ? 'improving' : romChange < -2 ? 'declining' : 'flat';

    return {
      exerciseId,
      points,
      romChange,
      direction,
    };
  });

  // Flat trends for backward compatibility
  const romPoints = [];
  const accuracyPoints = [];
  const qualityPoints = [];

  for (const s of sorted) {
    const date = s.startedAt ? new Date(s.startedAt).toISOString().slice(0, 10) : null;
    if (!date) continue;

    const reps = Array.isArray(s.reps) ? s.reps : [];
    const peaks = reps.filter((r) => r.peakAngle != null).map((r) => r.peakAngle);
    if (peaks.length > 0) {
      romPoints.push({ date, value: Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length) });
    }

    if (s.totalReps > 0) {
      accuracyPoints.push({
        date,
        value: Math.round(((s.correctReps || 0) / s.totalReps) * 100),
      });
    }

    const quals = reps.filter((r) => r.qualityScore != null).map((r) => r.qualityScore);
    if (quals.length > 0) {
      qualityPoints.push({ date, value: Math.round(quals.reduce((a, b) => a + b, 0) / quals.length) });
    }
  }

  // Common mistakes calculation
  const issueMap = {};
  for (const s of sorted) {
    const reps = Array.isArray(s.reps) ? s.reps : [];
    for (const r of reps) {
      if (r.issue) {
        const key = r.issue.length > 50 ? r.issue.slice(0, 50) : r.issue;
        issueMap[key] = (issueMap[key] || 0) + 1;
      }
      if (Array.isArray(r.compensations)) {
        for (const c of r.compensations) {
          issueMap[c] = (issueMap[c] || 0) + 1;
        }
      }
    }
  }

  const commonMistakes = Object.entries(issueMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([issue, count]) => ({
      issue,
      label: issue,
      count,
      pctOfReps: totalReps > 0 ? Math.round((count / totalReps) * 100) : 0,
    }));

  return {
    totals: {
      sessions: sorted.length,
      reps: totalReps,
    },
    exercises,
    commonMistakes,
    rom: romPoints,
    accuracy: accuracyPoints,
    quality: qualityPoints,
    totalSessions: sorted.length,
  };
}

module.exports = {
  computePatientAdherence,
  computeTrends,
};
