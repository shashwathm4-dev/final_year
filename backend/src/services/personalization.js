/**
 * Personalized difficulty service (Feature 29).
 * Dynamically adapts working peak target and checkpoint tolerances within doctor-specified bounds.
 */
const { getPersonalization, savePersonalization, getExerciseById } = require('./firestore');
let defaultExercisesJson = {};
try {
  defaultExercisesJson = require('../config/exercises.json');
} catch (e1) {
  try {
    defaultExercisesJson = require('../../../frontend/src/config/exercises.json');
  } catch (e2) {
    // fallback if executed from different root
  }
}

function clamp(min, max, val) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Update user's exercise profile via Exponential Moving Average (EMA).
 * @param {Object} profile
 * @param {Object} summary - from summarizeSession
 * @param {Object} exercise - exercise definition
 */
function updateProfile(profile, summary, exercise) {
  if (!summary || summary.repCount < 3) return profile;

  const alpha = 0.4;
  const prevSessions = profile.sessions || 0;

  const curPeak = summary.avgPeakAngle || 0;
  const curQuality = summary.avgQuality || 0;
  const curAccuracy = (summary.accuracy || 0) / 100;

  const emaPeak = prevSessions === 0 ? curPeak : alpha * curPeak + (1 - alpha) * (profile.emaPeak || curPeak);
  const emaQuality = prevSessions === 0 ? curQuality : alpha * curQuality + (1 - alpha) * (profile.emaQuality || curQuality);
  const emaAccuracy = prevSessions === 0 ? curAccuracy : alpha * curAccuracy + (1 - alpha) * (profile.emaAccuracy || curAccuracy);

  const sessions = prevSessions + 1;

  // thresholdScale rule clamped 0.8 - 1.4
  let thresholdScale = profile.thresholdScale || 1.0;
  if (emaAccuracy >= 0.85 && emaQuality >= 80) {
    thresholdScale *= 0.92; // tighten tolerance (harder)
  } else if (emaAccuracy < 0.5) {
    thresholdScale *= 1.12; // loosen tolerance (easier)
  } else {
    thresholdScale += 0.1 * (1.0 - thresholdScale); // drift 10% toward 1.0
  }
  thresholdScale = clamp(0.8, 1.4, Math.round(thresholdScale * 100) / 100);

  // workingTargetPeak: clamp(round(emaPeak + 5), range[0]*0.7, range[1])
  const range = exercise?.target_angle_range || [60, 150];
  const workingTargetPeak = clamp(
    Math.round(range[0] * 0.7),
    range[1],
    Math.round(emaPeak + 5)
  );

  return {
    ...profile,
    sessions,
    emaPeak: Math.round(emaPeak * 10) / 10,
    emaQuality: Math.round(emaQuality * 10) / 10,
    emaAccuracy: Math.round(emaAccuracy * 100) / 100,
    thresholdScale,
    workingTargetPeak,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Build parameters adapted from profile for client consumption.
 */
function buildAdaptedParams(profile, exercise) {
  const adaptive = (profile?.sessions || 0) >= 2;
  const thresholdScale = adaptive ? profile.thresholdScale || 1.0 : 1.0;
  const range = exercise?.target_angle_range || [60, 150];
  const workingTargetPeak = adaptive && profile?.workingTargetPeak
    ? profile.workingTargetPeak
    : range[1];

  const defaultThresholds = exercise?.checkpoint_thresholds || [20, 20, 20];
  const checkpoint_thresholds = defaultThresholds.map((t) => Math.round(t * thresholdScale));

  const startThreshold = exercise?.startAngleThreshold || 30;
  const originalPeakThreshold = exercise?.peakAngleThreshold || 80;
  const peakAngleThreshold = Math.max(
    startThreshold + 10,
    Math.min(originalPeakThreshold, Math.round(workingTargetPeak * 0.6))
  );

  return {
    thresholdScale,
    workingTargetPeak,
    checkpoint_thresholds,
    peakAngleThreshold,
    adaptive,
  };
}

/**
 * Called after session end to update and save the patient's personalization profile.
 */
async function updateProfileFromSession(uid, session, summary) {
  if (!uid || !session?.exerciseId) return null;
  const exerciseId = session.exerciseId;

  let exercise = await getExerciseById(exerciseId);
  if (!exercise && defaultExercisesJson[exerciseId]) {
    exercise = defaultExercisesJson[exerciseId];
  }
  if (!exercise) return null;

  const existing = (await getPersonalization(uid, exerciseId)) || {
    uid,
    exerciseId,
    sessions: 0,
    emaPeak: 0,
    emaQuality: 0,
    emaAccuracy: 0,
    thresholdScale: 1.0,
    workingTargetPeak: exercise.target_angle_range ? exercise.target_angle_range[1] : 100,
  };

  const updated = updateProfile(existing, summary, exercise);
  await savePersonalization(updated);
  return updated;
}

module.exports = {
  updateProfile,
  buildAdaptedParams,
  updateProfileFromSession,
};
