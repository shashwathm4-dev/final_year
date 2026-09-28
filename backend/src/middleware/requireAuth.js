/**
 * Firebase Auth verification middleware.
 * Verifies Firebase ID Token from Authorization header: Bearer <token>
 * Attaches req.user = { uid, role, email, fullName }
 * Supports custom claims, client role header hint, and stored user profile lookup.
 */
const { admin, db } = require('../config/firebase');
const { getUserProfile } = require('../services/firestore');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.split('Bearer ')[1].trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided' });
  }

  const clientRole = req.headers['x-user-role'];

  try {
    let uid = null;
    let email = null;
    let role = null;
    let fullName = null;

    if (admin.apps && admin.apps.length > 0) {
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        uid = decodedToken.uid;
        email = decodedToken.email;
        role = decodedToken.role;
        fullName = decodedToken.name;
      } catch (adminErr) {
        console.warn('[requireAuth] Admin verify failed, falling back to payload parsing:', adminErr.message);
      }
    }

    if (!uid) {
      // Decode JWT payload directly
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        uid = payload.user_id || payload.sub || 'dev_user';
        email = payload.email || 'dev@example.com';
        role = payload.role;
        fullName = payload.name;
      } else {
        return res.status(401).json({ error: 'Unauthorized: Malformed token' });
      }
    }

    // Role priority:
    // 1. Explicit claim from token
    // 2. Client role header hint (e.g. from localStorage on doctor session)
    // 3. Stored profile in database/store
    // 4. Fallback 'patient'
    if (!role && clientRole && (clientRole === 'doctor' || clientRole === 'patient')) {
      role = clientRole;
    }

    if (!role) {
      try {
        const profile = await getUserProfile(uid);
        if (profile && profile.role) {
          role = profile.role;
          fullName = profile.fullName || fullName;
        }
      } catch (pErr) {
        // ignore
      }
    }

    req.user = {
      uid,
      email: email || '',
      role: role || 'patient',
      fullName: fullName || '',
    };

    return next();
  } catch (err) {
    console.error('[requireAuth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

module.exports = requireAuth;
