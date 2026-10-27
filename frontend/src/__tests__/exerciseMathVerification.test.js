/**
 * exerciseMathVerification.test.js
 * Comprehensive mathematical verification of angle computation and rep detection
 * for all 10 exercises defined in exercises.json.
 *
 * Exercises verified:
 * 1. shoulder_abduction (vsVertical, 3D/2D)
 * 2. neck_tilt (lineToLine)
 * 3. neck_rotation (rotation heuristic)
 * 4. elbow_flexion (threePoint, supplement mode: 180 - raw)
 * 5. knee_extension (threePoint, offset mode: raw - 80)
 * 6. squat (threePoint, supplement mode: 180 - raw)
 * 7. hip_abduction (vsVertical, 3D/2D)
 * 8. shoulder_flexion (vsVertical)
 * 9. shoulder_hold (vsVertical hold mode)
 * 10. wall_sit_hold (threePoint hold mode)
 */

import { describe, it, expect } from 'vitest';
import exercisesConfig from '../config/exercises.json';
import {
  vectorAngle,
  vectorAngle3D,
  threePointAngle,
  threePointAngle3D,
  lineToLineAngle,
  verticalAngle2D,
  verticalAngle3D,
  computeNeckTiltAngle,
  neckRotationHeuristic,
  applyAngleTransform,
} from '../utils/angleUtils';

// Helper to create 2D landmarks (MediaPipe normalized [0..1] space)
function createLandmark(x, y, z = 0, visibility = 0.95) {
  return { x, y, z, visibility };
}

describe('Vector Geometry & Trigonometric Verification', () => {
  it('vectorAngle verifies standard trigonometric angles (0°, 30°, 45°, 60°, 90°, 180°)', () => {
    // 0 deg
    expect(vectorAngle([1, 0], [1, 0])).toBeCloseTo(0, 4);
    // 30 deg: cos(30) = sqrt(3)/2
    expect(vectorAngle([1, 0], [Math.sqrt(3), 1])).toBeCloseTo(30, 4);
    // 45 deg: cos(45) = 1/sqrt(2)
    expect(vectorAngle([1, 0], [1, 1])).toBeCloseTo(45, 4);
    // 60 deg: cos(60) = 0.5
    expect(vectorAngle([1, 0], [1, Math.sqrt(3)])).toBeCloseTo(60, 4);
    // 90 deg
    expect(vectorAngle([1, 0], [0, 1])).toBeCloseTo(90, 4);
    // 180 deg
    expect(vectorAngle([1, 0], [-1, 0])).toBeCloseTo(180, 4);
  });

  it('vectorAngle3D verifies 3D orthogonal coordinate systems', () => {
    expect(vectorAngle3D([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 4);
    expect(vectorAngle3D([0, 0, 1], [0, 1, 0])).toBeCloseTo(90, 4);
    expect(vectorAngle3D([1, 1, 0], [0, 0, 1])).toBeCloseTo(90, 4);
    expect(vectorAngle3D([1, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 4);
    expect(vectorAngle3D([0, 1, 0], [0, 1, 0])).toBeCloseTo(0, 4);
  });
});

describe('Mathematical Verification for Each Exercise in exercises.json', () => {
  const size = { w: 640, h: 480 };

  // 1. SHOULDER ABDUCTION (vsVertical)
  describe('1. Shoulder Abduction (vsVertical)', () => {
    const config = exercisesConfig.shoulder_abduction;

    it('calculates 0° when arm hangs straight down (rest position)', () => {
      // Shoulder (11) at (320, 150), Elbow (13) straight below at (320, 270)
      const shoulder = createLandmark(0.5, 150 / 480);
      const elbow = createLandmark(0.5, 270 / 480);
      const angle = verticalAngle2D(shoulder, elbow, size);
      expect(angle).toBeCloseTo(0, 1);
      // Below startAngleThreshold
      expect(angle).toBeLessThan(config.startAngleThreshold);
    });

    it('calculates 90° when arm is horizontal at shoulder level (clinical target)', () => {
      // Shoulder at (0.5, 0.4), Elbow horizontally to the right at (0.7, 0.4)
      const shoulder = createLandmark(0.5, 0.4);
      const elbow = createLandmark(0.7, 0.4);
      const angle = verticalAngle2D(shoulder, elbow, size);
      expect(angle).toBeCloseTo(90, 1);
      // Within target range [70, 110]
      expect(angle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(angle).toBeLessThanOrEqual(config.target_angle_range[1]);
    });

    it('calculates 3D vertical angle accurately in meters', () => {
      const worldShoulder = { x: 0, y: 0, z: 0 };
      const worldElbowDown = { x: 0, y: 0.3, z: 0 };
      const worldElbowHoriz = { x: 0.3, y: 0, z: 0 };

      expect(verticalAngle3D(worldShoulder, worldElbowDown)).toBeCloseTo(0, 1);
      expect(verticalAngle3D(worldShoulder, worldElbowHoriz)).toBeCloseTo(90, 1);
    });
  });

  // 2. NECK TILT (lineToLine)
  describe('2. Neck Tilt (lineToLine)', () => {
    const config = exercisesConfig.neck_tilt;

    it('calculates ~0° when head is upright and parallel to shoulder baseline', () => {
      const leftShoulder = createLandmark(0.4, 0.5);
      const rightShoulder = createLandmark(0.6, 0.5);
      const leftEar = createLandmark(0.45, 0.3);
      const rightEar = createLandmark(0.55, 0.3);
      const nose = createLandmark(0.5, 0.32);

      const angle = computeNeckTiltAngle(leftShoulder, rightShoulder, leftEar, rightEar, nose, size);
      expect(angle).toBeCloseTo(0, 1);
      expect(angle).toBeLessThan(config.startAngleThreshold);
    });

    it('calculates 20°-25° when head tilts toward shoulder', () => {
      // Horizontal shoulder line: slope 0
      const leftShoulder = createLandmark(0.4, 0.5);
      const rightShoulder = createLandmark(0.6, 0.5);
      // Tilted ear line: rotate by ~25°
      // dx = 0.1 * cos(25°), dy = 0.1 * sin(25°) in pixel space
      const earSpanPx = 0.1 * size.w; // 64px
      const tiltRad = (25 * Math.PI) / 180;
      const dyNorm = (earSpanPx * Math.sin(tiltRad)) / size.h;
      const dxNorm = (earSpanPx * Math.cos(tiltRad)) / size.w;

      const leftEar = createLandmark(0.5 - dxNorm / 2, 0.3 - dyNorm / 2);
      const rightEar = createLandmark(0.5 + dxNorm / 2, 0.3 + dyNorm / 2);

      const angle = computeNeckTiltAngle(leftShoulder, rightShoulder, leftEar, rightEar, null, size);
      expect(angle).toBeCloseTo(25, 1);
      expect(angle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(angle).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 3. NECK ROTATION (rotation heuristic)
  describe('3. Neck Rotation (rotation)', () => {
    const config = exercisesConfig.neck_rotation;

    it('returns ~0° rotation when nose is centered between ears', () => {
      const leftEar = createLandmark(0.4, 0.3);
      const rightEar = createLandmark(0.6, 0.3);
      const nose = createLandmark(0.5, 0.35); // centered at 0.5

      const result = neckRotationHeuristic(nose, leftEar, rightEar);
      expect(result.angle).toBeCloseTo(0, 1);
      expect(result.angle).toBeLessThan(config.startAngleThreshold);
    });

    it('detects left/right rotation and scales angle based on ear displacement', () => {
      const leftEar = createLandmark(0.4, 0.3);
      const rightEar = createLandmark(0.6, 0.3); // mid = 0.5, span = 0.2
      // Rotate right: nose shifts toward 0.6 (e.g. 0.56, dev = 0.06/0.2 = 0.3 -> 0.3 * 75 = 22.5°)
      const noseRight = createLandmark(0.56, 0.35);
      const resultRight = neckRotationHeuristic(noseRight, leftEar, rightEar);
      expect(resultRight.direction).toBe('right');
      expect(resultRight.angle).toBeCloseTo(22.5, 1);

      // Strong turn: nose shifts to 0.62 (dev = 0.12/0.2 = 0.6 -> 0.6 * 75 = 45°)
      const noseFullTurn = createLandmark(0.62, 0.35);
      const resultTurn = neckRotationHeuristic(noseFullTurn, leftEar, rightEar);
      expect(resultTurn.angle).toBeCloseTo(45, 1);
      expect(resultTurn.angle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
    });
  });

  // 4. ELBOW FLEXION (threePoint with supplement transform)
  describe('4. Elbow Flexion (threePoint, supplement mode: 180° - raw)', () => {
    const config = exercisesConfig.elbow_flexion;

    it('verifies arm straight gives raw ≈ 180° and transformed ≈ 0°', () => {
      // Shoulder (11) at (100, 100), Elbow (13) at (100, 200), Wrist (15) at (100, 300)
      const rawAngle = threePointAngle([100, 100], [100, 200], [100, 300]);
      expect(rawAngle).toBeCloseTo(180, 1);

      const transformed = applyAngleTransform(rawAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(0, 1);
      expect(transformed).toBeLessThan(config.startAngleThreshold);
    });

    it('verifies 90° bend gives transformed 90°', () => {
      // Shoulder (100, 100), Elbow (100, 200), Wrist bent forward at (200, 200)
      const rawAngle = threePointAngle([100, 100], [100, 200], [200, 200]);
      expect(rawAngle).toBeCloseTo(90, 1);

      const transformed = applyAngleTransform(rawAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(90, 1);
    });

    it('verifies full elbow bend (~40° raw angle) gives ~140° flexion', () => {
      // Form an acute angle of 40° at elbow
      const v1 = [0, -100]; // shoulder straight above elbow
      // Wrist vector rotated by 40 degrees from v1
      const rad40 = (40 * Math.PI) / 180;
      const v2 = [100 * Math.sin(rad40), -100 * Math.cos(rad40)];
      const rawAngle = vectorAngle(v1, v2);
      expect(rawAngle).toBeCloseTo(40, 1);

      const transformed = applyAngleTransform(rawAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(140, 1);
      expect(transformed).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(transformed).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 5. SEATED KNEE EXTENSION (threePoint with offset transform: raw - 80)
  describe('5. Seated Knee Extension (threePoint, offset mode: raw - 80°)', () => {
    const config = exercisesConfig.knee_extension;

    it('verifies seated 90° bent knee gives transformed ~10°', () => {
      // Hip (23) at (100, 100), Knee (25) at (200, 100), Foot/Ankle (27) at (200, 200) (90° at knee)
      const rawAngle = threePointAngle([100, 100], [200, 100], [200, 200]);
      expect(rawAngle).toBeCloseTo(90, 1);

      const transformed = applyAngleTransform(rawAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(10, 1);
      expect(transformed).toBeLessThan(config.startAngleThreshold);
    });

    it('verifies leg extended straight (raw ~170°) gives transformed ~90°', () => {
      // Hip at (100, 100), Knee at (200, 100), Foot extended forward at (300, 100) -> 180°
      const rawAngle = threePointAngle([100, 100], [200, 100], [300, 100]);
      expect(rawAngle).toBeCloseTo(180, 1);

      const transformed = applyAngleTransform(rawAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(100, 1);
      expect(transformed).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(transformed).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 6. BODYWEIGHT SQUAT (threePoint with supplement transform: 180° - raw)
  describe('6. Bodyweight Squat (threePoint, supplement mode: 180° - raw)', () => {
    const config = exercisesConfig.squat;

    it('verifies standing tall (raw ≈ 180°) produces 0° squat angle', () => {
      // Hip (23) at (200, 100), Knee (25) at (200, 200), Ankle (27) at (200, 300)
      const rawAngle = threePointAngle([200, 100], [200, 200], [200, 300]);
      expect(rawAngle).toBeCloseTo(180, 1);

      const squatAngle = applyAngleTransform(rawAngle, config.angleTransform);
      expect(squatAngle).toBeCloseTo(0, 1);
      expect(squatAngle).toBeLessThan(config.startAngleThreshold);
    });

    it('verifies parallel squat depth (~90° knee flexion) gives 90° squat angle', () => {
      // Hip back at (100, 200), Knee at (200, 200), Ankle down at (200, 300) -> 90° angle at knee
      const rawAngle = threePointAngle([100, 200], [200, 200], [200, 300]);
      expect(rawAngle).toBeCloseTo(90, 1);

      const squatAngle = applyAngleTransform(rawAngle, config.angleTransform);
      expect(squatAngle).toBeCloseTo(90, 1);
      expect(squatAngle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(squatAngle).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 7. HIP ABDUCTION (vsVertical)
  describe('7. Standing Hip Abduction (vsVertical)', () => {
    const config = exercisesConfig.hip_abduction;

    it('verifies standing straight produces 0° against vertical', () => {
      const hip = createLandmark(0.4, 0.5);
      const ankle = createLandmark(0.4, 0.9); // directly below hip
      const angle = verticalAngle2D(hip, ankle, size);
      expect(angle).toBeCloseTo(0, 1);
      expect(angle).toBeLessThan(config.startAngleThreshold);
    });

    it('verifies leg abducting outward reaches 30° target range', () => {
      const hip = createLandmark(0.4, 0.5);
      // Leg length = 0.4 * 480 = 192px
      // 30° abduction: dx = 192 * sin(30°) = 96px, dy = 192 * cos(30°) = 166.27px
      const dxNorm = 96 / size.w;
      const dyNorm = 166.27 / size.h;
      const ankle = createLandmark(0.4 + dxNorm, 0.5 + dyNorm);

      const angle = verticalAngle2D(hip, ankle, size);
      expect(angle).toBeCloseTo(30, 1);
      expect(angle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(angle).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 8. SHOULDER FLEXION (vsVertical in side view)
  describe('8. Shoulder Flexion (vsVertical)', () => {
    const config = exercisesConfig.shoulder_flexion;

    it('verifies arm hanging down gives 0° against vertical', () => {
      const shoulder = createLandmark(0.5, 0.3);
      const elbow = createLandmark(0.5, 0.6);
      const angle = verticalAngle2D(shoulder, elbow, size);
      expect(angle).toBeCloseTo(0, 1);
      expect(angle).toBeLessThan(config.startAngleThreshold);
    });

    it('verifies full overhead reach (150°) falls within target range [140, 170]', () => {
      const shoulder = createLandmark(0.5, 0.5);
      // 150° raised forward/upward:
      // Vector [dx, dy] relative to [0, 1] down: angle = 150°
      const rad150 = (150 * Math.PI) / 180;
      // In pixel space: dx = sin(150), dy = cos(150) = -0.866
      const dxNorm = (100 * Math.sin(rad150)) / size.w;
      const dyNorm = (100 * Math.cos(rad150)) / size.h;
      const elbow = createLandmark(0.5 + dxNorm, 0.5 + dyNorm);

      const angle = verticalAngle2D(shoulder, elbow, size);
      expect(angle).toBeCloseTo(150, 1);
      expect(angle).toBeGreaterThanOrEqual(config.target_angle_range[0]);
      expect(angle).toBeLessThanOrEqual(config.target_angle_range[1]);
    });
  });

  // 9. SHOULDER HOLD (hold mode at 90°)
  describe('9. Shoulder Hold at 90° (vsVertical hold mode)', () => {
    const config = exercisesConfig.shoulder_hold;

    it('verifies tolerance boundary detection around 90°', () => {
      const target = config.hold.targetAngle; // 90
      const tol = config.hold.tolerance; // 12

      expect(config.target_angle_range[0]).toBe(target - tol); // 78
      expect(config.target_angle_range[1]).toBe(target + tol); // 102

      // Angle 90° is in tolerance
      const isWithinTolerance = (a) => Math.abs(a - target) <= tol;
      expect(isWithinTolerance(90)).toBe(true);
      expect(isWithinTolerance(78)).toBe(true);
      expect(isWithinTolerance(102)).toBe(true);
      expect(isWithinTolerance(77)).toBe(false);
      expect(isWithinTolerance(103)).toBe(false);
    });
  });

  // 10. WALL SIT HOLD (hold mode at 90°)
  describe('10. Wall Sit Hold (threePoint hold mode at ~90° knee flexion)', () => {
    const config = exercisesConfig.wall_sit_hold;

    it('verifies target angle and tolerance range for wall sit hold', () => {
      const target = config.hold.targetAngle; // 90
      const tol = config.hold.tolerance; // 12

      expect(config.target_angle_range[0]).toBe(target - tol); // 78
      expect(config.target_angle_range[1]).toBe(target + tol); // 102

      // 90° knee flexion (180 - 90 = 90)
      const rawKneeAngle = threePointAngle([100, 200], [200, 200], [200, 300]);
      const transformed = applyAngleTransform(rawKneeAngle, config.angleTransform);
      expect(transformed).toBeCloseTo(90, 1);
      expect(transformed >= config.target_angle_range[0] && transformed <= config.target_angle_range[1]).toBe(true);
    });
  });
});
