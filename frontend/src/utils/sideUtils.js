/**
 * Left/right mirroring of MediaPipe pose landmark indices.
 * Odd indices >= 11 are the person's LEFT side, even indices are the RIGHT side.
 */
export function mirrorIndex(i) {
  if (i === 0) return 0;                          // nose
  if (i >= 1 && i <= 6) return i <= 3 ? i + 3 : i - 3;   // eyes
  if (i === 7) return 8;                          // ears
  if (i === 8) return 7;
  if (i === 9) return 10;                         // mouth
  if (i === 10) return 9;
  if (i >= 11) return i % 2 === 1 ? i + 1 : i - 1;       // shoulders ... feet
  return i;
}

/**
 * Returns a copy of `config` whose landmarkIndices refer to the chosen side.
 * - Exercises without supportsSide are returned unchanged (with side = null).
 * - side 'auto' keeps the base indices; useAngleComputation evaluates both sides (vsVertical only).
 */
export function applySide(config, side) {
  if (!config) return config;
  if (!config.supportsSide) return { ...config, side: null };

  const base = config.baseSide || 'left';
  const chosen = side || base;
  if (chosen === 'auto' || chosen === base) return { ...config, side: chosen };

  const mirrored = {};
  for (const [k, v] of Object.entries(config.landmarkIndices || {})) {
    mirrored[k] = Number.isInteger(v) ? mirrorIndex(v) : v;
  }
  return { ...config, landmarkIndices: mirrored, side: chosen };
}
