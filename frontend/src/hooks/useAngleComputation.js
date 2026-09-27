/**
 * useAngleComputation — Computes joint angles from landmarks based on exercise config.
 * Supports dual-arm tracking, neck tilt, and camera-frame-independent shoulder abduction.
 */
import { useCallback } from 'react';
import { getLandmark } from '../utils/landmarkUtils';
import { computeShoulderAbductionAngle, computeNeckTiltAngle, neckRotationHeuristic, threePointAngle } from '../utils/angleUtils';

export default function useAngleComputation(exerciseConfig) {
  const computeAngle = useCallback(
    (landmarks) => {
      if (!landmarks || !exerciseConfig) {
        return { angle: 0, confidence: 0 };
      }

      const { angleFunction, landmarkIndices, id } = exerciseConfig;

      switch (angleFunction) {
        case 'threePoint': {
          // If this is the specific shoulder abduction exercise, use the custom abduction calculation
          if (id === 'shoulder_abduction') {
            return computeShoulderAbductionAngle(landmarks);
          }

          // Otherwise, if custom landmarkIndices are specified (e.g. A, B, C for custom joint angle)
          if (landmarkIndices && (landmarkIndices.a != null || landmarkIndices.hip != null)) {
            const idxA = landmarkIndices.a ?? landmarkIndices.hip;
            const idxB = landmarkIndices.b ?? landmarkIndices.shoulder;
            const idxC = landmarkIndices.c ?? landmarkIndices.elbow;

            const pA = getLandmark(landmarks, idxA);
            const pB = getLandmark(landmarks, idxB);
            const pC = getLandmark(landmarks, idxC);

            if (!pA || !pB || !pC) return { angle: 0, confidence: 0 };

            const angle = threePointAngle([pA.x * 640, pA.y * 480], [pB.x * 640, pB.y * 480], [pC.x * 640, pC.y * 480]);
            const confidence = Math.min(pA.visibility || 0, pB.visibility || 0, pC.visibility || 0);
            return { angle: Math.round((angle || 0) * 10) / 10, confidence };
          }

          return computeShoulderAbductionAngle(landmarks);
        }


        case 'lineToLine': {
          // Neck tilt: head rotation relative to shoulder line
          const leftShoulder = getLandmark(landmarks, 11);
          const rightShoulder = getLandmark(landmarks, 12);
          const leftEar = getLandmark(landmarks, 7);
          const rightEar = getLandmark(landmarks, 8);
          const nose = getLandmark(landmarks, 0);

          if (!leftShoulder || !rightShoulder) return { angle: 0, confidence: 0 };

          const tiltAngle = computeNeckTiltAngle(leftShoulder, rightShoulder, leftEar, rightEar, nose);

          const confidence = Math.min(
            leftShoulder.visibility || 0,
            rightShoulder.visibility || 0,
            nose ? nose.visibility || 0 : 0.8
          );

          return { angle: tiltAngle, confidence };
        }

        case 'rotation': {
          // Neck rotation heuristic: nose(0), left ear(7), right ear(8)
          const nose = getLandmark(landmarks, 0);
          const leftEar = getLandmark(landmarks, 7);
          const rightEar = getLandmark(landmarks, 8);

          if (!nose || !leftEar || !rightEar) return { angle: 0, confidence: 0 };

          const result = neckRotationHeuristic(nose, leftEar, rightEar);
          return {
            angle: result.angle,
            confidence: result.confidence,
            direction: result.direction,
          };
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
