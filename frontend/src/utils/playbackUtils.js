const r3 = (n) => Math.round(n * 1000) / 1000;

/** Downsample a rep's frames (max ~60) into a compact skeleton-only payload. */
export function buildPlaybackPayload(frames, { referenceCheckpoints, deltas, failedCheckpoints, highlightJoints } = {}) {
  if (!frames || frames.length < 5) return null;
  const stride = Math.max(1, Math.ceil(frames.length / 60));
  const picked = frames.filter((_, i) => i % stride === 0 || i === frames.length - 1);
  const t0 = picked[0].timestamp;
  const out = picked
    .filter((f) => Array.isArray(f.landmarks) && f.landmarks.length >= 33)
    .map((f) => {
      const lm = [];
      for (let i = 0; i < 33; i++) {
        const p = f.landmarks[i];
        lm.push(r3(p.x), r3(p.y), Math.round((p.visibility ?? 0) * 100) / 100);
      }
      return { t: Math.round(f.timestamp - t0), a: Math.round(f.angle * 10) / 10, lm };
    });
  if (out.length < 5) return null;
  return {
    durationMs: out[out.length - 1].t,
    frames: out,
    referenceCheckpoints: referenceCheckpoints || null,
    deltas: deltas || null,
    failedCheckpoints: failedCheckpoints || [],
    highlightJoints: highlightJoints || [],
  };
}

export function unpackLandmarks(flat) {
  const out = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push({ x: flat[i], y: flat[i + 1], visibility: flat[i + 2] });
  return out;
}

/** Reference angle at each of n frames, interpolated from the 5 reference checkpoints. */
export function referenceCurve(ref, n) {
  if (!ref || ref.length !== 5 || n < 2) return null;
  return Array.from({ length: n }, (_, i) => {
    const pos = (i / (n - 1)) * 4;
    const lo = Math.floor(pos);
    const hi = Math.min(4, lo + 1);
    return ref[lo] + (ref[hi] - ref[lo]) * (pos - lo);
  });
}
