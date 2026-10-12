#!/usr/bin/env node
/**
 * CLI script to train a rep-classifier model for an exercise.
 * Usage: node src/scripts/trainRepClassifier.js <exerciseId>
 */
const { trainForExercise } = require('../services/repClassifier');

async function main() {
  const exerciseId = process.argv[2] || 'shoulder_abduction';
  console.log(`Training rep classifier for exercise: ${exerciseId}...`);
  try {
    const result = await trainForExercise(exerciseId);
    if (result.published) {
      console.log(`\n✅ Model successfully trained and published!`);
      console.log(`Samples: ${result.model.nSamples}`);
      console.log(`Accuracy: ${(result.model.metrics.accuracy * 100).toFixed(1)}%`);
      console.log(`Baseline: ${(result.model.metrics.baselineAccuracy * 100).toFixed(1)}%`);
    } else {
      console.log(`\n⚠️ Model not published: ${result.reason}`);
      if (result.metrics) console.log('Metrics:', result.metrics);
    }
  } catch (err) {
    console.error('Training error:', err);
    process.exit(1);
  }
}

main();
