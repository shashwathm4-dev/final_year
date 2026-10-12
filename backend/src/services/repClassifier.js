/**
 * On-Device Rep Classification Service (Feature 31)
 * Trains and evaluates lightweight logistic regression models for form classification.
 * Pure JavaScript, zero external ML dependencies.
 */
const fs = require('fs');
const path = require('path');
const { getExerciseById, getSessionsByPatient, getExercises } = require('./firestore');
let defaultExercises;
try {
  defaultExercises = require('../config/exercises.json');
} catch {
  defaultExercises = require('../../../frontend/src/config/exercises.json');
}

const MODELS_DIR = path.resolve(__dirname, '../../data/models');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Extract 22 normalized features from a rep.
 * Order:
 * 0..15: 16 curve points / targetMax
 * 16: peakAngle / targetMax
 * 17: clamp(durationMs / 4000, 0, 2)
 * 18: smoothnessScore / 100
 * 19: romScore / 100
 * 20: tempoScore / 100
 * 21: qualityScore / 100
 */
function extractFeatures(rep, exercise) {
  if (!rep || !Array.isArray(rep.curve) || rep.curve.length !== 16) {
    return null;
  }
  const targetMax = (exercise?.target_angle_range && exercise.target_angle_range[1]) || 180;

  const features = [];
  // 16 curve points
  for (let i = 0; i < 16; i++) {
    const angle = Number.isFinite(rep.curve[i]) ? rep.curve[i] : 0;
    features.push(Math.round((angle / targetMax) * 1000) / 1000);
  }

  // 16: peakAngle / targetMax
  const peakAngle = Number.isFinite(rep.peakAngle) ? rep.peakAngle : 0;
  features.push(Math.round((peakAngle / targetMax) * 1000) / 1000);

  // 17: clamp(durationMs / 4000, 0, 2)
  const durationMs = Number.isFinite(rep.durationMs) ? rep.durationMs : 2000;
  const durNorm = Math.max(0, Math.min(2, durationMs / 4000));
  features.push(Math.round(durNorm * 1000) / 1000);

  // 18: smoothnessScore / 100
  const smooth = Number.isFinite(rep.smoothnessScore) ? rep.smoothnessScore : 70;
  features.push(Math.round((smooth / 100) * 1000) / 1000);

  // 19: romScore / 100
  const rom = Number.isFinite(rep.romScore) ? rep.romScore : 70;
  features.push(Math.round((rom / 100) * 1000) / 1000);

  // 20: tempoScore / 100
  const tempo = Number.isFinite(rep.tempoScore) ? rep.tempoScore : 70;
  features.push(Math.round((tempo / 100) * 1000) / 1000);

  // 21: qualityScore / 100
  const quality = Number.isFinite(rep.qualityScore) ? rep.qualityScore : 70;
  features.push(Math.round((quality / 100) * 1000) / 1000);

  return features;
}

/**
 * Predict probability of correct rep given model and feature vector.
 */
function predictProb(model, x) {
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

/**
 * Train a Logistic Regression model with L2 regularization and class weighting.
 */
function trainLogReg(X, y, options = {}) {
  const epochs = options.epochs || 400;
  const lr = options.lr || 0.1;
  const l2 = options.l2 || 0.01;
  const n = X.length;
  const nFeatures = X[0].length;

  // 80/20 Stratified Split with deterministic pseudo-random shuffle
  const posIdx = [];
  const negIdx = [];
  for (let i = 0; i < n; i++) {
    if (y[i] === 1) posIdx.push(i);
    else negIdx.push(i);
  }

  // Simple deterministic shuffle using seed
  function shuffle(arr, seed = 42) {
    let s = seed;
    for (let i = arr.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  shuffle(posIdx, 123);
  shuffle(negIdx, 456);

  const trainPosCount = Math.floor(posIdx.length * 0.8);
  const trainNegCount = Math.floor(negIdx.length * 0.8);

  const trainIndices = [...posIdx.slice(0, trainPosCount), ...negIdx.slice(0, trainNegCount)];
  const valIndices = [...posIdx.slice(trainPosCount), ...negIdx.slice(trainNegCount)];

  const X_train = trainIndices.map((i) => X[i]);
  const y_train = trainIndices.map((i) => y[i]);
  const X_val = valIndices.map((i) => X[i]);
  const y_val = valIndices.map((i) => y[i]);

  const nTrain = X_train.length;

  // Compute standardization parameters on train set
  const featureMean = new Array(nFeatures).fill(0);
  const featureStd = new Array(nFeatures).fill(0);

  for (let j = 0; j < nFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < nTrain; i++) sum += X_train[i][j];
    featureMean[j] = sum / nTrain;

    let varSum = 0;
    for (let i = 0; i < nTrain; i++) {
      const diff = X_train[i][j] - featureMean[j];
      varSum += diff * diff;
    }
    const s = Math.sqrt(varSum / nTrain);
    featureStd[j] = s > 1e-6 ? s : 1.0;
  }

  // Standardize X_train
  const X_train_norm = X_train.map((row) =>
    row.map((val, j) => (val - featureMean[j]) / featureStd[j])
  );

  // Class weights for balance
  const nPosTrain = y_train.filter((l) => l === 1).length;
  const nNegTrain = nTrain - nPosTrain;
  const weightPos = nPosTrain > 0 ? nTrain / (2 * nPosTrain) : 1;
  const weightNeg = nNegTrain > 0 ? nTrain / (2 * nNegTrain) : 1;

  // Model weights & bias
  const weights = new Array(nFeatures).fill(0);
  let bias = 0;

  // Batch Gradient Descent
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;

    for (let i = 0; i < nTrain; i++) {
      let z = bias;
      for (let j = 0; j < nFeatures; j++) {
        z += weights[j] * X_train_norm[i][j];
      }
      const p = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
      const w = y_train[i] === 1 ? weightPos : weightNeg;
      const err = (p - y_train[i]) * w;

      for (let j = 0; j < nFeatures; j++) {
        gradW[j] += err * X_train_norm[i][j];
      }
      gradB += err;
    }

    for (let j = 0; j < nFeatures; j++) {
      weights[j] -= lr * (gradW[j] / nTrain + l2 * weights[j]);
    }
    bias -= lr * (gradB / nTrain);
  }

  const model = {
    featureMean,
    featureStd,
    weights,
    bias,
  };

  const metrics = evaluate(model, X_val, y_val);
  model.metrics = metrics;

  return { model, metrics };
}

/**
 * Evaluate model on validation set.
 */
function evaluate(model, X_val, y_val) {
  if (!X_val || X_val.length === 0) {
    return { accuracy: 1, precision: 1, recall: 1, baselineAccuracy: 1, nVal: 0 };
  }
  let correct = 0;
  let truePos = 0;
  let falsePos = 0;
  let falseNeg = 0;

  let totalPos = 0;
  for (let i = 0; i < y_val.length; i++) {
    if (y_val[i] === 1) totalPos++;
  }
  const majorityClass = Math.max(totalPos, y_val.length - totalPos);
  const baselineAccuracy = Math.round((majorityClass / y_val.length) * 1000) / 1000;

  for (let i = 0; i < X_val.length; i++) {
    const prob = predictProb(model, X_val[i]);
    const pred = prob >= 0.5 ? 1 : 0;
    const actual = y_val[i];

    if (pred === actual) correct++;
    if (pred === 1 && actual === 1) truePos++;
    if (pred === 1 && actual === 0) falsePos++;
    if (pred === 0 && actual === 1) falseNeg++;
  }

  const accuracy = Math.round((correct / y_val.length) * 1000) / 1000;
  const precision = truePos + falsePos > 0 ? Math.round((truePos / (truePos + falsePos)) * 1000) / 1000 : 0;
  const recall = truePos + falseNeg > 0 ? Math.round((truePos / (truePos + falseNeg)) * 1000) / 1000 : 0;

  return {
    accuracy,
    precision,
    recall,
    baselineAccuracy,
    nVal: y_val.length,
  };
}

/**
 * Gather labeled reps, train model, and persist if quality targets met.
 */
async function trainForExercise(exerciseId) {
  let exercise = null;
  try {
    exercise = await getExerciseById(exerciseId);
  } catch (_) {}
  if (!exercise && defaultExercises[exerciseId]) {
    exercise = defaultExercises[exerciseId];
  }

  // Load reps from all sessions in local store
  const { localStore, persistLocalStore } = require('./firestore');
  const sessions = Object.values(localStore?.sessions || {});
  const matchingSessions = sessions.filter((s) => s.exerciseId === exerciseId);

  const X = [];
  const y = [];

  for (const session of matchingSessions) {
    const reps = Array.isArray(session.reps) ? session.reps : [];
    for (const rep of reps) {
      // Filter trusted labels:
      // verdictSource === 'vlm' (label = correct ? 1 : 0)
      // verdictSource === 'local' && correct === false (label = 0)
      let label = null;
      if (rep.verdictSource === 'vlm' && rep.correct != null) {
        label = rep.correct === true ? 1 : 0;
      } else if (rep.verdictSource === 'local' && rep.correct === false) {
        label = 0;
      }

      if (label === null) continue;

      const feats = extractFeatures(rep, exercise);
      if (feats) {
        X.push(feats);
        y.push(label);
      }
    }
  }

  const nSamples = X.length;
  const nPos = y.filter((l) => l === 1).length;
  const nNeg = nSamples - nPos;

  // Criteria: n >= 60, each class >= 15
  if (nSamples < 60 || nPos < 15 || nNeg < 15) {
    return {
      published: false,
      reason: `Insufficient training data: need ≥60 labeled reps with ≥15 per class. (Current: ${nSamples} total, ${nPos} positive, ${nNeg} negative)`,
      metrics: {
        nSamples,
        nPos,
        nNeg,
      },
    };
  }

  const { model, metrics } = trainLogReg(X, y);

  // Criteria: valAccuracy >= 0.80 and valAccuracy >= baseline + 0.05
  if (metrics.accuracy < 0.80 || metrics.accuracy < metrics.baselineAccuracy + 0.05) {
    return {
      published: false,
      reason: `Model accuracy (${metrics.accuracy}) did not meet quality threshold (≥0.80 and ≥ baseline + 0.05 [baseline: ${metrics.baselineAccuracy}])`,
      metrics,
    };
  }

  const modelPayload = {
    version: 1,
    exerciseId,
    trainedAt: new Date().toISOString(),
    nSamples,
    featureMean: model.featureMean,
    featureStd: model.featureStd,
    weights: model.weights,
    bias: model.bias,
    metrics,
    thresholds: { accept: 0.85, reject: 0.15 },
  };

  // Persist to localStore.models
  if (!localStore.models) localStore.models = {};
  localStore.models[exerciseId] = modelPayload;
  persistLocalStore();

  // Save to disk backend/data/models/rep-classifier-<exerciseId>.json
  try {
    ensureDir(MODELS_DIR);
    const filePath = path.join(MODELS_DIR, `rep-classifier-${exerciseId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(modelPayload, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write model file to disk:', err.message);
  }

  return {
    published: true,
    model: modelPayload,
  };
}

function getStoredModel(exerciseId) {
  const { localStore } = require('./firestore');
  if (localStore?.models && localStore.models[exerciseId]) {
    return localStore.models[exerciseId];
  }
  const filePath = path.join(MODELS_DIR, `rep-classifier-${exerciseId}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return data;
    } catch (_) {}
  }
  return null;
}

module.exports = {
  extractFeatures,
  predictProb,
  trainLogReg,
  evaluate,
  trainForExercise,
  getStoredModel,
};
