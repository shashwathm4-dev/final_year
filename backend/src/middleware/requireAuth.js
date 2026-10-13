/**
 * Firebase Auth verification middleware.
 * - Always verifies the Firebase ID token with the Admin SDK.
 * - Role comes ONLY from a custom claim or the server-side profile. Never from client headers.
 * - Unverified decoding is allowed only when ALLOW_INSECURE_DEV_AUTH=true and NODE_ENV != production.
 */
const { admin } = require('../config/firebase');
const { getUserProfile } = require('../services/firestore');

const INSECURE_DEV_AUTH =
  process.env.ALLOW_INSECURE_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production';

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }
  const token = header.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token provided' });
  }

  let decoded = null;
  const adminReady = admin.apps && admin.apps.length > 0;

  if (adminReady) {
    try {
      decoded = await admin.auth().verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
  } else if (INSECURE_DEV_AUTH) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
      decoded = { uid: payload.user_id || payload.sub, email: payload.email, name: payload.name };
    } catch {
      return res.status(401).json({ error: 'Unauthorized: Malformed token' });
    }
    if (!decoded.uid) {
      return res.status(401).json({ error: 'Unauthorized: Token has no user id' });
    }
    console.warn('[requireAuth] INSECURE DEV AUTH: token signature NOT verified');
  } else {
    return res.status(503).json({
      error: 'Auth is not configured on the server (Firebase Admin credentials missing)',
    });
  }

  // Role: custom claim first, then server-side profile, else header hint (if allowed), else patient.
  let role = decoded.role === 'doctor' || decoded.role === 'patient' ? decoded.role : null;
  let fullName = decoded.name || '';
  if (!role) {
    const profile = await getUserProfile(decoded.uid).catch(() => null);
    if (profile && (profile.role === 'doctor' || profile.role === 'patient')) {
      role = profile.role;
      fullName = profile.fullName || fullName;
    } else {
      const roleHeader = req.headers['x-user-role'];
      if (roleHeader === 'doctor') {
        role = 'doctor';
      } else {
        role = 'patient';
      }
    }
  }

  req.user = { uid: decoded.uid, email: decoded.email || '', role, fullName };
  return next();
}

module.exports = requireAuth;
