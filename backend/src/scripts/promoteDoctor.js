/** Usage: node src/scripts/promoteDoctor.js user@example.com */
const { admin, db } = require('../config/firebase');
(async () => {
  const email = process.argv[2];
  if (!email || !db) { console.error('Usage: node promoteDoctor.js <email> (Admin SDK required)'); process.exit(1); }
  const user = await admin.auth().getUserByEmail(email);
  await admin.auth().setCustomUserClaims(user.uid, { role: 'doctor' });
  await db.collection('users').doc(user.uid).set({ role: 'doctor' }, { merge: true });
  console.log(`✓ ${email} is now a doctor (user must sign out and in again)`);
  process.exit(0);
})();
