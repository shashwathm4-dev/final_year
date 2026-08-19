/**
 * Checkpoint comparison utility.
 * Splits a rep's frame sequence into 5 equal checkpoints (0/25/50/75/100%)
 * and compares each checkpoint's angle to the reference exercise angles.
 */

/**
 * Extract 5 checkpoint angles from a rep's angle sequence.
 * @param {Array<{ timestamp: number, angle: number }>} repFrames - Frames collected during one rep
 * @returns {number[]} Array of 5 angle values at 0%, 25%, 50%, 75%, 100%
 */
export function computeCheckpoints(repFrames) {
  if (!repFrames || repFrames.length < 5) {
    return null;
  }

  const total = repFrames.length - 1;
  const indices = [0, 0.25, 0.5, 0.75, 1.0].map(pct => Math.round(pct * total));

  return indices.map(idx => repFrames[idx].angle);
}

/**
 * Compare patient checkpoints to reference checkpoints.
 * @param {number[]} patientCheckpoints - 5 angle values from the patient's rep
 * @param {number[]} referenceCheckpoints - 5 reference angle values
 * @param {number[]} thresholds - 5 max-allowed deltas
 * @returns {{ passed: boolean, deltas: number[], failedCheckpoints: number[], maxDelta: number }}
 */
export function compareToReference(patientCheckpoints, referenceCheckpoints, thresholds) {
  if (!patientCheckpoints || !referenceCheckpoints || !thresholds) {
    return { passed: false, deltas: [], failedCheckpoints: [], maxDelta: 0 };
  }

  const deltas = patientCheckpoints.map((angle, i) =>
    Math.abs(angle - referenceCheckpoints[i])
  );

  const failedCheckpoints = deltas
    .map((delta, i) => (delta > thresholds[i] ? i : -1))
    .filter(i => i >= 0);

  const maxDelta = Math.max(...deltas);

  return {
    passed: failedCheckpoints.length === 0,
    deltas,
    failedCheckpoints,
    maxDelta,
  };
}

/**
 * Generate a human-readable mismatch description.
 * @param {number[]} failedCheckpoints - Indices of failed checkpoints
 * @param {number[]} deltas - Delta values
 * @returns {string}
 */
export function describeMismatch(failedCheckpoints, deltas) {
  if (failedCheckpoints.length === 0) return 'All checkpoints within range.';

  const labels = ['Start (0%)', 'Early (25%)', 'Peak (50%)', 'Late (75%)', 'End (100%)'];
  const issues = failedCheckpoints.map(
    i => `${labels[i]}: ${Math.round(deltas[i])}° off`
  );

  return `Position mismatch at: ${issues.join(', ')}`;
}
