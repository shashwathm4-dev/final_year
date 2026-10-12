/**
 * Privacy routes.
 * - GET    /api/privacy/consent   — stored consent for the current user (or null)
 * - POST   /api/privacy/consent   — save consent choice
 * - DELETE /api/privacy/my-data   — permanently delete the account and all stored data
 */
const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const validate = require('../middleware/validate');
const { writeLimiter } = require('../middleware/rateLimits');
const { consentSchema, deleteAccountSchema } = require('../validation/schemas');
const { admin } = require('../config/firebase');
const { getUserProfile, saveUserConsent, deleteUserData } = require('../services/firestore');

router.get('/consent', requireAuth, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.uid);
    res.json({ consent: profile?.consent || null });
  } catch (err) {
    console.error('Error reading consent:', err);
    res.status(500).json({ error: 'Failed to read consent' });
  }
});

router.post('/consent', requireAuth, writeLimiter, validate(consentSchema), async (req, res) => {
  try {
    const consent = await saveUserConsent(req.user.uid, req.body);
    res.json({ success: true, consent });
  } catch (err) {
    console.error('Error saving consent:', err);
    res.status(500).json({ error: 'Failed to save consent' });
  }
});

router.delete('/my-data', requireAuth, writeLimiter, validate(deleteAccountSchema), async (req, res) => {
  try {
    await deleteUserData(req.user.uid);

    // Remove the login itself when the Admin SDK is available
    let authDeleted = false;
    if (admin.apps && admin.apps.length > 0) {
      try {
        await admin.auth().deleteUser(req.user.uid);
        authDeleted = true;
      } catch (authErr) {
        console.warn('[privacy] Could not delete auth user:', authErr.message);
      }
    }
    res.json({ success: true, authDeleted });
  } catch (err) {
    console.error('Error deleting user data:', err);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

module.exports = router;
