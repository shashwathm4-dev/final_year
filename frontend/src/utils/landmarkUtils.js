/**
 * MediaPipe Pose Landmark indices (33-point model)
 * Reference: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
 */

export const LANDMARKS = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

/**
 * Maps config joint names → landmark indices.
 * This enables the config-driven approach: exercises.json says "hip"
 * and we resolve it to the actual MediaPipe index.
 */
export const JOINT_NAME_TO_INDEX = {
  nose: LANDMARKS.NOSE,
  left_eye: LANDMARKS.LEFT_EYE,
  right_eye: LANDMARKS.RIGHT_EYE,
  left_ear: LANDMARKS.LEFT_EAR,
  right_ear: LANDMARKS.RIGHT_EAR,
  left_shoulder: LANDMARKS.LEFT_SHOULDER,
  right_shoulder: LANDMARKS.RIGHT_SHOULDER,
  left_elbow: LANDMARKS.LEFT_ELBOW,
  right_elbow: LANDMARKS.RIGHT_ELBOW,
  left_wrist: LANDMARKS.LEFT_WRIST,
  right_wrist: LANDMARKS.RIGHT_WRIST,
  left_hip: LANDMARKS.LEFT_HIP,
  right_hip: LANDMARKS.RIGHT_HIP,
  left_knee: LANDMARKS.LEFT_KNEE,
  right_knee: LANDMARKS.RIGHT_KNEE,
  left_ankle: LANDMARKS.LEFT_ANKLE,
  right_ankle: LANDMARKS.RIGHT_ANKLE,
  // Aliases for convenience
  hip: LANDMARKS.LEFT_HIP,
  shoulder: LANDMARKS.LEFT_SHOULDER,
  elbow: LANDMARKS.LEFT_ELBOW,
  wrist: LANDMARKS.LEFT_WRIST,
  knee: LANDMARKS.LEFT_KNEE,
  ankle: LANDMARKS.LEFT_ANKLE,
};

/**
 * Connections between landmarks for skeleton drawing.
 * Each pair [a, b] means draw a line from landmark a to landmark b.
 */
export const POSE_CONNECTIONS = [
  // Face
  [LANDMARKS.NOSE, LANDMARKS.LEFT_EYE_INNER],
  [LANDMARKS.LEFT_EYE_INNER, LANDMARKS.LEFT_EYE],
  [LANDMARKS.LEFT_EYE, LANDMARKS.LEFT_EYE_OUTER],
  [LANDMARKS.LEFT_EYE_OUTER, LANDMARKS.LEFT_EAR],
  [LANDMARKS.NOSE, LANDMARKS.RIGHT_EYE_INNER],
  [LANDMARKS.RIGHT_EYE_INNER, LANDMARKS.RIGHT_EYE],
  [LANDMARKS.RIGHT_EYE, LANDMARKS.RIGHT_EYE_OUTER],
  [LANDMARKS.RIGHT_EYE_OUTER, LANDMARKS.RIGHT_EAR],
  [LANDMARKS.MOUTH_LEFT, LANDMARKS.MOUTH_RIGHT],
  // Torso
  [LANDMARKS.LEFT_SHOULDER, LANDMARKS.RIGHT_SHOULDER],
  [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_HIP],
  [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_HIP],
  [LANDMARKS.LEFT_HIP, LANDMARKS.RIGHT_HIP],
  // Left arm
  [LANDMARKS.LEFT_SHOULDER, LANDMARKS.LEFT_ELBOW],
  [LANDMARKS.LEFT_ELBOW, LANDMARKS.LEFT_WRIST],
  [LANDMARKS.LEFT_WRIST, LANDMARKS.LEFT_PINKY],
  [LANDMARKS.LEFT_WRIST, LANDMARKS.LEFT_INDEX],
  [LANDMARKS.LEFT_WRIST, LANDMARKS.LEFT_THUMB],
  [LANDMARKS.LEFT_INDEX, LANDMARKS.LEFT_PINKY],
  // Right arm
  [LANDMARKS.RIGHT_SHOULDER, LANDMARKS.RIGHT_ELBOW],
  [LANDMARKS.RIGHT_ELBOW, LANDMARKS.RIGHT_WRIST],
  [LANDMARKS.RIGHT_WRIST, LANDMARKS.RIGHT_PINKY],
  [LANDMARKS.RIGHT_WRIST, LANDMARKS.RIGHT_INDEX],
  [LANDMARKS.RIGHT_WRIST, LANDMARKS.RIGHT_THUMB],
  [LANDMARKS.RIGHT_INDEX, LANDMARKS.RIGHT_PINKY],
  // Left leg
  [LANDMARKS.LEFT_HIP, LANDMARKS.LEFT_KNEE],
  [LANDMARKS.LEFT_KNEE, LANDMARKS.LEFT_ANKLE],
  [LANDMARKS.LEFT_ANKLE, LANDMARKS.LEFT_HEEL],
  [LANDMARKS.LEFT_ANKLE, LANDMARKS.LEFT_FOOT_INDEX],
  [LANDMARKS.LEFT_HEEL, LANDMARKS.LEFT_FOOT_INDEX],
  // Right leg
  [LANDMARKS.RIGHT_HIP, LANDMARKS.RIGHT_KNEE],
  [LANDMARKS.RIGHT_KNEE, LANDMARKS.RIGHT_ANKLE],
  [LANDMARKS.RIGHT_ANKLE, LANDMARKS.RIGHT_HEEL],
  [LANDMARKS.RIGHT_ANKLE, LANDMARKS.RIGHT_FOOT_INDEX],
  [LANDMARKS.RIGHT_HEEL, LANDMARKS.RIGHT_FOOT_INDEX],
];

/**
 * Get a landmark object by index from the landmarks array.
 * @param {Array} landmarks - MediaPipe landmarks array
 * @param {number} index - Landmark index
 * @returns {{ x: number, y: number, z: number, visibility: number }}
 */
export function getLandmark(landmarks, index) {
  if (!landmarks || index < 0 || index >= landmarks.length) {
    return null;
  }
  return landmarks[index];
}

/**
 * Extract [x, y] vector from a landmark for 2D angle math.
 * @param {Object} landmark - { x, y, z, visibility }
 * @returns {[number, number]}
 */
export function landmarkToVec2(landmark) {
  if (!landmark) return null;
  return [landmark.x, landmark.y];
}

/**
 * Compute midpoint between two landmarks.
 * @param {Object} lm1 - First landmark
 * @param {Object} lm2 - Second landmark
 * @returns {{ x: number, y: number, z: number, visibility: number }}
 */
export function midpoint(lm1, lm2) {
  if (!lm1 || !lm2) return null;
  return {
    x: (lm1.x + lm2.x) / 2,
    y: (lm1.y + lm2.y) / 2,
    z: (lm1.z + lm2.z) / 2,
    visibility: Math.min(lm1.visibility, lm2.visibility),
  };
}

/**
 * Check if a landmark has sufficient visibility/confidence.
 * @param {Object} landmark
 * @param {number} threshold - Minimum visibility (0-1)
 * @returns {boolean}
 */
export function isVisible(landmark, threshold = 0.5) {
  return landmark && landmark.visibility >= threshold;
}
