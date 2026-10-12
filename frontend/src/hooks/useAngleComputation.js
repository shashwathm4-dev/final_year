/**
 * useAngleComputation — computes the exercise angle from landmarks.
 * computeAngle(landmarks, { size, worldLandmarks })
 *   size            { w, h } real video size (default 640x480)
 *   worldLandmarks  MediaPipe world landmarks (metres) for 3D mode
 * angleFunction: threePoint | vsVertical | lineToLine | rotation
 */
import { useCallback } from 'react';
import { getLandmark } from '../utils/landmarkUtils';
import { mirrorIndex } from '../utils/sideUtils';
import {
  computeNeckTiltAngle,
  neckRotationHeuristic,
  threePointAngle,
  threePointAngle3D,
  verticalAngle2D,
  verticalAngle3D,
  applyAngleTransform,
  frameSize,
} from '../utils/angleUtils';

const DEFAULT_SIZE = { w: 640, h: 480 };
const MIN_VIS = 0.5;

// Accept legacy keys {hip, shoulder, elbow} as well as {a, b, c}
function normalizeIndices(li = {}) {
  return { a: li.a ?? li.hip, b: li.b ?? li.shoulder, c: li.c ?? li.elbow };
}

function threePointFor(landmarks, world, idx, transform, use3D, size) {
  const pA = getLandmark(landmarks, idx.a);
  const pB = getLandmark(landmarks, idx.b);
  const pC = getLandmark(landmarks, idx.c);
  if (!pA || !pB || !pC) return { angle: 0, confidence: 0 };

  const confidence = Math.min(pA.visibility || 0, pB.visibility || 0, pC.visibility || 0);
  const wA = world && world[idx.a];
  const wB = world && world[idx.b];
  const wC = world && world[idx.c];

  let raw;
  let used3D = false;
  if (use3D && wA && wB && wC && confidence >= MIN_VIS) {
    raw = threePointAngle3D(wA, wB, wC);
    used3D = true;
  } else {
    const { w, h } = size && size.w && size.h ? size : frameSize;
    const angle = threePointAngle([pA.x * w, pA.y * h], [pB.x * w, pB.y * h], [pC.x * w, pC.y * h]);
    raw = angle;
  }
  return { angle: applyAngleTransform(raw || 0, transform), confidence, used3D };
}

function vsVerticalFor(landmarks, world, idx, use3D, size) {
  const pA = getLandmark(landmarks, idx.a);
  const pB = getLandmark(landmarks, idx.b);
  if (!pA || !pB) return { angle: 0, confidence: 0 };

  const confidence = Math.min(pA.visibility || 0, pB.visibility || 0);
  const wA = world && world[idx.a];
  const wB = world && world[idx.b];

  let raw;
  let used3D = false;
  if (use3D && wA && wB && confidence >= MIN_VIS) {
    raw = verticalAngle3D(wA, wB);
    used3D = true;
  } else {
    raw = verticalAngle2D(pA, pB, size);
  }
  return { angle: Math.round(raw * 10) / 10, confidence, used3D };
}

export default function useAngleComputation(exerciseConfig) {
  const computeAngle = useCallback(
    (landmarks, { size, worldLandmarks } = {}) => {
      if (!landmarks || !exerciseConfig) return { angle: 0, confidence: 0 };

      const sz = size && size.w && size.h ? size : DEFAULT_SIZE;
      const { angleFunction, landmarkIndices, angleTransform, side, use3D } = exerciseConfig;
      const idx = normalizeIndices(landmarkIndices);

      switch (angleFunction) {
        case 'threePoint':
          return threePointFor(landmarks, worldLandmarks, idx, angleTransform, !!use3D, sz);

        case 'vsVertical': {
          const primary = vsVerticalFor(landmarks, worldLandmarks, idx, !!use3D, sz);
          if (side !== 'auto') return primary;
          const mirrored = vsVerticalFor(
            landmarks,
            worldLandmarks,
            { a: mirrorIndex(idx.a), b: mirrorIndex(idx.b) },
            !!use3D,
            sz
          );
          return mirrored.angle > primary.angle ? mirrored : primary;
        }

        case 'lineToLine': {
          const leftShoulder = getLandmark(landmarks, 11);
          const rightShoulder = getLandmark(landmarks, 12);
          const leftEar = getLandmark(landmarks, 7);
          const rightEar = getLandmark(landmarks, 8);
          const nose = getLandmark(landmarks, 0);
          if (!leftShoulder || !rightShoulder) return { angle: 0, confidence: 0 };

          const tiltAngle = computeNeckTiltAngle(leftShoulder, rightShoulder, leftEar, rightEar, nose, sz);
          const confidence = Math.min(
            leftShoulder.visibility || 0,
            rightShoulder.visibility || 0,
            nose ? nose.visibility || 0 : 0.8
          );
          return { angle: tiltAngle, confidence };
        }

        case 'rotation': {
          const nose = getLandmark(landmarks, 0);
          const leftEar = getLandmark(landmarks, 7);
          const rightEar = getLandmark(landmarks, 8);
          if (!nose || !leftEar || !rightEar) return { angle: 0, confidence: 0 };
          const result = neckRotationHeuristic(nose, leftEar, rightEar);
          return { angle: result.angle, confidence: result.confidence, direction: result.direction };
        }

        default:
          console.warn(`Unknown angle function: ${angleFunction}`);
          return { angle: 0, confidence: 0 };
      }
    },
    [exerciseConfig]
  );

  return { computeAngle };
}
