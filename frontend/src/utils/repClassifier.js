/**
 * On-device Rep Classifier (Feature 31)
 * Computes features from rep data and evaluates trained logistic regression model.
 */

/**
 * Extract 22 features matching the backend feature definition.
 */
export function featuresFromRep({ curve, peakAngle, durationMs, quality }, exercise) {
  if (!curve || !Array.isArray(curve) || curve.length !== 16) {
    return null;
  }
  const targetMax = (exercise?.target_angle_range && exercise.target_angle_range[1]) || 180;
  const features = [];

  // 0..15: 16 curve points / targetMax
  for (let i = 0; i < 16; i++) {
    const angle = Number.isFinite(curve[i]) ? curve[i] : 0;
    features.push(Math.round((angle / targetMax) * 1000) / 1000);
  }

  // 16: peakAngle / targetMax
  const pAngle = Number.isFinite(peakAngle) ? peakAngle : 0;
  features.push(Math.round((pAngle / targetMax) * 1000) / 1000);

  // 17: clamp(durationMs / 4000, 0, 2)
  const dur = Number.isFinite(durationMs) ? durationMs : 2000;
  const durNorm = Math.max(0, Math.min(2, dur / 4000));
  features.push(Math.round(durNorm * 1000) / 1000);

  // 18: smoothnessScore / 100
  const smooth = Number.isFinite(quality?.smoothnessScore) ? quality.smoothnessScore : 70;
  features.push(Math.round((smooth / 100) * 1000) / 1000);

  // 19: romScore / 100
  const rom = Number.isFinite(quality?.romScore) ? quality.romScore : 70;
  features.push(Math.round((rom / 100) * 1000) / 1000);

  // 20: tempoScore / 100
  const tempo = Number.isFinite(quality?.tempoScore) ? quality.tempoScore : 70;
  features.push(Math.round((tempo / 100) * 1000) / 1000);

  // 21: qualityScore / 100
  const qScore = Number.isFinite(quality?.qualityScore) ? quality.qualityScore : 70;
  features.push(Math.round((qScore / 100) * 1000) / 1000);

  return features;
}

/**
 * Predict probability of correct rep from standardized features.
 */
export function predictProb(model, x) {
  if (!model || !model.weights || !x) return 0.5;
  let z = model.bias || 0;
  const numFeats = Math.min(x.length, model.weights.length);
  for (let i = 0; i < numFeats; i++) {
    const mean = model.featureMean ? model.featureMean[i] || 0 : 0;
    const std = model.featureStd && model.featureStd[i] ? model.featureStd[i] : 1;
    const norm = (x[i] - mean) / std;
    z += norm * model.weights[i];
  }
  const clampedZ = Math.max(-20, Math.min(20, z));
  return 1 / (1 + Math.exp(-clampedZ));
}
