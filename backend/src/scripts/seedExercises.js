/**
 * seedExercises.js — Seed Firestore exercises collection from static exercises.json.
 * Run manually via: node src/scripts/seedExercises.js
 */
const { db, isClientSdk } = require('../config/firebase');
const defaultExercises = require('../../../frontend/src/config/exercises.json');

async function seed() {
  console.log('Seeding exercises to Firestore...');
  if (!db) {
    console.log('Firestore not initialized or running in local mode — skipping cloud seed.');
    return;
  }

  try {
    for (const [key, exercise] of Object.entries(defaultExercises)) {
      const payload = {
        ...exercise,
        isCustom: false,
        createdBy: null,
        updatedAt: new Date().toISOString(),
      };

      if (isClientSdk) {
        const { doc, setDoc } = require('firebase/firestore');
        await setDoc(doc(db, 'exercises', key), payload);
      } else {
        await db.collection('exercises').doc(key).set(payload);
      }
      console.log(`✓ Seeded exercise: ${exercise.displayName} (${key})`);
    }
    console.log('Seeding complete!');
  } catch (err) {
    console.error('Error seeding exercises:', err.message);
  }
}

if (require.main === module) {
  seed().then(() => process.exit(0));
}

module.exports = seed;
