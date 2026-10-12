/**
 * Local copy of the user's privacy consent (per user, per device).
 * The backend keeps the authoritative copy; this makes the check instant and works offline.
 */
export const CONSENT_VERSION = '1';

const keyFor = (uid) => `privacy_consent_${uid}`;

export function getConsent(uid) {
  if (!uid) return null;
  try {
    const c = JSON.parse(localStorage.getItem(keyFor(uid)));
    if (c && c.accepted && c.version === CONSENT_VERSION) return c;
  } catch {
    // ignore corrupt value
  }
  return null;
}

export function saveConsentLocal(uid, consent) {
  try {
    localStorage.setItem(keyFor(uid), JSON.stringify(consent));
  } catch {
    // ignore storage errors
  }
}

export function clearConsent(uid) {
  try {
    localStorage.removeItem(keyFor(uid));
  } catch {
    // ignore
  }
}

/** True only if the user accepted AND allowed the cloud AI check. */
export function isCloudAiAllowed(uid) {
  const c = getConsent(uid);
  return !!(c && c.cloudAi);
}
