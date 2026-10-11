/**
 * checkFraming — is the person positioned well enough to track this exercise?
 * Returns { ok, messages[] }.
 */
import { mirrorIndex } from './sideUtils';

const DEFAULTS = { minVisibility: 0.5, margin: 0.03 };

function requiredIndices(config) {
  if (Array.isArray(config.requiredLandmarks)) return config.requiredLandmarks;
  const base = Object.values(config.landmarkIndices || {}).filter((v) => Number.isInteger(v));
  // With side 'auto' either limb may be used: require the mirrored joints to be visible too
  const extra = config.side === 'auto' ? base.map(mirrorIndex) : [];
  return [...new Set([...base, ...extra])];
}

export function checkFraming(landmarks, config, opts = {}) {
  const { minVisibility, margin } = { ...DEFAULTS, ...opts };

  if (!landmarks) {
    return { ok: false, messages: ['No person detected. Step in front of the camera.'] };
  }
  if (!config) return { ok: true, messages: [] };

  const required = requiredIndices(config);
  let lowerMissing = false;
  let upperMissing = false;
  let nearEdge = false;

  for (const idx of required) {
    const lm = landmarks[idx];
    if (!lm || (lm.visibility ?? 0) < minVisibility) {
      if (idx >= 23) lowerMissing = true;
      else upperMissing = true;
      continue;
    }
    if (lm.x < margin || lm.x > 1 - margin || lm.y < margin || lm.y > 1 - margin) nearEdge = true;
  }

  const messages = [];
  if (lowerMissing) messages.push('Step back so your hips and legs are fully visible.');
  if (upperMissing) messages.push('Make sure your head, shoulders and arms are in view.');
  if (nearEdge) messages.push('Move toward the centre of the frame.');

  // Distance hints, only when nothing else is wrong
  if (messages.length === 0) {
    const ls = landmarks[11];
    const rs = landmarks[12];
    const lh = landmarks[23];
    const rh = landmarks[24];
    const vis = (l) => l && (l.visibility ?? 0) >= minVisibility;

    if (config.cameraView !== 'side' && vis(ls) && vis(rs)) {
      const shoulderWidth = Math.abs(ls.x - rs.x);
      if (shoulderWidth < 0.1) messages.push('Move a little closer to the camera.');
      else if (shoulderWidth > 0.6) messages.push('Move a little further from the camera.');
    } else if (config.cameraView === 'side' && vis(ls) && vis(rs) && vis(lh) && vis(rh)) {
      const torso = Math.abs((ls.y + rs.y) / 2 - (lh.y + rh.y) / 2);
      if (torso < 0.12) messages.push('Move a little closer to the camera.');
      else if (torso > 0.6) messages.push('Move a little further from the camera.');
    }
  }

  return { ok: messages.length === 0, messages };
}
