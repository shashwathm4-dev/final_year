/**
 * Vector math utilities for computing joint angles from landmark positions.
 * All angles are returned in degrees.
 */

// Video frame size used to convert normalised landmarks into pixel space.
// PoseCamera updates this from the real video so portrait phone cameras measure correctly.
export const frameSize = { w: 640, h: 480 };
export function setFrameSize(w, h) {
  if (w > 0 && h > 0) {
    frameSize.w = w;
    frameSize.h = h;
  }
}

/**
 * Compute the angle between two 2D vectors (in degrees).
 * @param {[number, number]} v1 - First vector [x, y]
 * @param {[number, number]} v2 - Second vector [x, y]
 * @returns {number} Angle in degrees [0, 180]
 */
export function vectorAngle(v1, v2) {
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const mag1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1]);
  const mag2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1]);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/**
 * Compute shoulder abduction angle in degrees [0, 180].
 * Uses pixel-aspect ratio scaling (640x480 canvas space) so 2D vectors
 * map accurately to real-world geometric angles:
 * - Arm at rest (pointing straight down) = 0°
 * - Arm raised sideways to shoulder height = 90°
 * - Arm raised overhead = 150° - 180°
 */
export function computeShoulderAbductionAngle(landmarks) {
  if (!landmarks) return { angle: 0, confidence: 0 };

  const leftShoulder = landmarks[11];
  const leftElbow = landmarks[13];
  const rightShoulder = landmarks[12];
  const rightElbow = landmarks[14];

  // Convert 0..1 normalized coordinates into pixel-space (aspect ratio corrected 640x480)
  let leftAngle = 0, leftConf = 0;
  if (leftShoulder && leftElbow) {
    const dx = (leftElbow.x - leftShoulder.x) * frameSize.w;
    const dy = (leftElbow.y - leftShoulder.y) * frameSize.h;
    leftAngle = vectorAngle([0, 1], [dx, dy]);
    leftConf = Math.min(leftShoulder.visibility || 0, leftElbow.visibility || 0);
  }

  let rightAngle = 0, rightConf = 0;
  if (rightShoulder && rightElbow) {
    const dx = (rightElbow.x - rightShoulder.x) * frameSize.w;
    const dy = (rightElbow.y - rightShoulder.y) * frameSize.h;
    rightAngle = vectorAngle([0, 1], [dx, dy]);
    rightConf = Math.min(rightShoulder.visibility || 0, rightElbow.visibility || 0);
  }

  if (leftAngle >= rightAngle) {
    return { angle: Math.round(leftAngle * 10) / 10, confidence: leftConf };
  } else {
    return { angle: Math.round(rightAngle * 10) / 10, confidence: rightConf };
  }
}

/**
 * Compute the angle at vertex B formed by segments BA and BC.
 */
export function threePointAngle(a, b, c) {
  if (!a || !b || !c) return null;

  const vecBA = [a[0] - b[0], a[1] - b[1]];
  const vecBC = [c[0] - b[0], c[1] - b[1]];

  return vectorAngle(vecBA, vecBC);
}

/**
 * Compute neck tilt angle in degrees.
 * Measures head angle relative to shoulder baseline in pixel-aspect space.
 */
export function computeNeckTiltAngle(leftShoulder, rightShoulder, leftEar, rightEar, nose, size = frameSize) {
  if (!leftShoulder || !rightShoulder) return 0;

  const shoulderAngle = Math.atan2(
    (rightShoulder.y - leftShoulder.y) * size.h,
    (rightShoulder.x - leftShoulder.x) * size.w
  );

  let headAngle = null;

  if (leftEar && rightEar && Math.min(leftEar.visibility || 0, rightEar.visibility || 0) > 0.4) {
    headAngle = Math.atan2(
      (rightEar.y - leftEar.y) * size.h,
      (rightEar.x - leftEar.x) * size.w
    );
  } else if (nose) {
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    headAngle = Math.atan2(
      (nose.y - shoulderMidY) * size.h,
      (nose.x - shoulderMidX) * size.w
    ) + Math.PI / 2;
  }

  if (headAngle === null) return 0;

  let diffRad = Math.abs(headAngle - shoulderAngle);
  let diffDeg = diffRad * (180 / Math.PI);

  if (diffDeg > 180) diffDeg = 360 - diffDeg;
  if (diffDeg > 90) diffDeg = 180 - diffDeg;

  return Math.round(diffDeg * 10) / 10;
}

/**
 * Compute line to line angle in degrees [0, 90].
 */
export function lineToLineAngle(p1, p2, p3, p4) {
  if (!p1 || !p2 || !p3 || !p4) return null;

  const dir1 = [p2[0] - p1[0], p2[1] - p1[1]];
  const dir2 = [p4[0] - p3[0], p4[1] - p3[1]];

  let angle = vectorAngle(dir1, dir2);

  if (angle > 90) angle = 180 - angle;
  return angle;
}

/**
 * Compute a rotation heuristic based on ear/nose positions.
 */
export function neckRotationHeuristic(nose, leftEar, rightEar) {
  if (!nose || !leftEar || !rightEar) {
    return { angle: 0, confidence: 0, direction: 'unknown' };
  }

  const earMidX = (leftEar.x + rightEar.x) / 2;
  const earSpan = Math.abs(rightEar.x - leftEar.x);

  if (earSpan < 0.01) {
    return { angle: 80, confidence: 0.3, direction: nose.x < earMidX ? 'left' : 'right' };
  }

  const deviation = (nose.x - earMidX) / earSpan;
  const angle = Math.min(90, Math.abs(deviation) * 75);
  const minVis = Math.min(nose.visibility || 0, leftEar.visibility || 0, rightEar.visibility || 0);

  return {
    angle: Math.round(angle * 10) / 10,
    confidence: Math.min(0.8, minVis),
    direction: deviation > 0 ? 'right' : 'left',
  };
}

/**
 * Angle (degrees, 0–180) between the vertical-down direction and the vector A -> B,
 * in 640x480 pixel space. 0 = B directly below A (limb hanging), 90 = horizontal.
 */
export function verticalAngle2D(pA, pB, size = { w: 640, h: 480 }) {
  const dx = (pB.x - pA.x) * size.w;
  const dy = (pB.y - pA.y) * size.h;
  return vectorAngle([0, 1], [dx, dy]);
}

/**
 * Optional per-exercise transform so every exercise's angle STARTS LOW and RISES at the peak,
 * which is what useRepDetection assumes.
 *  { mode: 'supplement' }          -> 180 - raw   (e.g. elbow: 170 straight -> 10)
 *  { mode: 'offset', offset: -80 } -> raw + offset (e.g. seated knee: 90 bent -> 10)
 */
export function applyAngleTransform(raw, transform) {
  let v = raw;
  if (transform && transform.mode === 'supplement') v = 180 - raw;
  else if (transform && transform.mode === 'offset') v = raw + (transform.offset || 0);
  return Math.round(Math.max(0, v) * 10) / 10;
}

/* ---------- 3D (MediaPipe world landmarks, metres) ---------- */

export function vectorAngle3D(v1, v2) {
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  const m1 = Math.hypot(v1[0], v1[1], v1[2]);
  const m2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (m1 === 0 || m2 === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot / (m1 * m2)));
  return Math.acos(c) * (180 / Math.PI);
}

/** Angle at vertex b between segments b->a and b->c. Points are {x,y,z}. */
export function threePointAngle3D(a, b, c) {
  return vectorAngle3D(
    [a.x - b.x, a.y - b.y, a.z - b.z],
    [c.x - b.x, c.y - b.y, c.z - b.z]
  );
}

// MediaPipe world coordinates are y-DOWN, like the image. If a hanging arm reads ~180 instead
// of ~0 in your tests, change this to [0, -1, 0].
const WORLD_DOWN = [0, 1, 0];

/** Angle between "straight down" and the vector a -> b. 0 = hanging, 90 = horizontal. */
export function verticalAngle3D(a, b) {
  return vectorAngle3D(WORLD_DOWN, [b.x - a.x, b.y - a.y, b.z - a.z]);
}

