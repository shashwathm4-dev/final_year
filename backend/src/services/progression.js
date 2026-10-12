/**
 * Program progression engine.
 * Called when a session ends. If the session belongs to a patient with an active program
 * that contains the session's exercise, it decides whether the session was "good":
 *   good = accuracy >= progression.accuracyThreshold  AND  totalReps >= targetReps * targetSets
 * A good session increments the item's goodStreak; a not-good session resets it to 0.
 * When goodStreak reaches progression.goodSessionsRequired, targets are raised
 * (capped by maxReps / maxSets), the linked assignedExercises doc is updated, the streak resets,
 * and the change is appended to patientProgram.log.
 */
const {
  getSession,
  getPatientPrograms,
  savePatientProgram,
  updateAssignment,
} = require('./firestore');

async function applyProgression(sessionId) {
  const session = await getSession(sessionId);
  if (!session || !session.patientId) return null;

  const programs = await getPatientPrograms(session.patientId);
  const active = programs.find(
    (p) => p.status === 'active' && p.items.some((i) => i.exerciseId === session.exerciseId)
  );
  if (!active) return null;

  const rules = active.progression || {};
  if (rules.enabled === false) return null;

  const item = active.items.find((i) => i.exerciseId === session.exerciseId);
  const total = session.totalReps || 0;
  const correct = session.correctReps || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const requiredReps = (item.targetReps || 0) * (item.targetSets || 1);
  const good = accuracy >= (rules.accuracyThreshold ?? 80) && total >= requiredReps;

  item.goodStreak = good ? (item.goodStreak || 0) + 1 : 0;

  const required = rules.goodSessionsRequired ?? 3;
  let raised = null;

  if (good && item.goodStreak >= required) {
    const fromReps = item.targetReps;
    const fromSets = item.targetSets;
    item.targetReps = Math.min(rules.maxReps ?? 30, fromReps + (rules.repsIncrement ?? 2));
    item.targetSets = Math.min(rules.maxSets ?? 5, fromSets + (rules.setsIncrement ?? 0));
    item.goodStreak = 0;

    if (item.targetReps !== fromReps || item.targetSets !== fromSets) {
      raised = {
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        from: { sets: fromSets, reps: fromReps },
        to: { sets: item.targetSets, reps: item.targetReps },
      };
      active.log.push({ at: new Date().toISOString(), ...raised });
      if (item.assignmentId) {
        await updateAssignment(item.assignmentId, {
          targetReps: item.targetReps,
          targetSets: item.targetSets,
        });
      }
    }
  }

  await savePatientProgram(active);

  return {
    programName: active.programName,
    exerciseName: item.exerciseName,
    goodSession: good,
    accuracy,
    streak: item.goodStreak,
    required,
    raised,
  };
}

module.exports = { applyProgression };
