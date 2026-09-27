/**
 * Firebase Auth verification middleware.
 * Verifies Firebase ID Token from Authorization header: Bearer <token>
 * Attaches req.user = { uid, role, email, fullName }
 */
const { admin, db } = require('../config/firebase');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided' });
  }

  try {
    if (admin.apps && admin.apps.length > 0) {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const uid = decodedToken.uid;
      let role = decodedToken.role || 'patient';
      let fullName = decodedToken.name || '';

      // Lookup user document in Firestore for up-to-date role
      if (db && typeof db.collection === 'function') {
        try {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            role = userData.role || role;
            fullName = userData.fullName || fullName;
          }
        } catch (dbErr) {
          console.warn('[requireAuth] Could not fetch user doc from Firestore:', dbErr.message);
        }
      }

      req.user = {
        uid,
        email: decodedToken.email,
        role,
        fullName,
      };
      return next();
    } else {
      // Local development fallback when Admin SDK is not initialized with credentials
      console.warn('[requireAuth] Firebase Admin not initialized with credentials — fallback token parsing');
      try {
        // Attempt basic base64 decode of JWT payload for local dev
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          req.user = {
            uid: payload.user_id || payload.sub || 'dev_user',
            email: payload.email || 'dev@example.com',
            role: payload.role || 'patient',
            fullName: payload.name || 'Dev User',
          };
          return next();
        }
      } catch {
        // Token parsing failed
      }
      return res.status(401).json({ error: 'Unauthorized: Firebase Admin SDK not configured on server' });
    }
  } catch (err) {
    console.error('[requireAuth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = requireAuth;
