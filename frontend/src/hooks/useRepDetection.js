/**
 * useRepDetection — State machine for detecting exercise reps.
 *
 * States: IDLE → ASCENDING → PEAK → DESCENDING → COMPLETE (→ IDLE)
 *
 * Tracks angle crossing thresholds to detect one full rep cycle.
 * On completion, emits the rep data including key frames and angles.
 */
import { useState, useRef, useCallback } from 'react';

const STATES = {
  IDLE: 'IDLE',
  ASCENDING: 'ASCENDING',
  PEAK: 'PEAK',
  DESCENDING: 'DESCENDING',
};

/**
 * @param {Object} exerciseConfig - From exercises.json
 * @param {Function} onRepComplete - Callback with rep data
 * @returns {{ state, repCount, currentAngle, addFrame, reset }}
 */
export default function useRepDetection(exerciseConfig, onRepComplete) {
  const [state, setState] = useState(STATES.IDLE);
  const [repCount, setRepCount] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(0);

  // Use refs for mutable state that shouldn't trigger re-renders
  const stateRef = useRef(STATES.IDLE);
  const repCountRef = useRef(0);
  const frameBufferRef = useRef([]);       // Rolling buffer of frames in current rep
  const peakAngleRef = useRef(0);
  const peakFrameRef = useRef(null);
  const startFrameRef = useRef(null);

  /**
   * Add a new frame of angle data. Drives the state machine.
   * @param {{ timestamp: number, angle: number, confidence: number, landmarks: Array, frameDataUrl: string }} frame
   */
  const addFrame = useCallback(
    (frame) => {
      if (!exerciseConfig || !frame) return;

      const { startAngleThreshold, peakAngleThreshold, returnAngleThreshold } = exerciseConfig;
      const { angle } = frame;

      setCurrentAngle(angle);

      const currentState = stateRef.current;

      switch (currentState) {
        case STATES.IDLE: {
          // Wait for angle to exceed start threshold
          if (angle >= startAngleThreshold) {
            stateRef.current = STATES.ASCENDING;
            setState(STATES.ASCENDING);
            frameBufferRef.current = [frame];
            startFrameRef.current = frame;
            peakAngleRef.current = angle;
            peakFrameRef.current = frame;
          }
          break;
        }

        case STATES.ASCENDING: {
          frameBufferRef.current.push(frame);

          // Track peak angle
          if (angle > peakAngleRef.current) {
            peakAngleRef.current = angle;
            peakFrameRef.current = frame;
          }

          // Check if we've reached peak zone
          if (angle >= peakAngleThreshold) {
            stateRef.current = STATES.PEAK;
            setState(STATES.PEAK);
          }

          // If angle drops back to start without reaching peak — false start
          if (angle < startAngleThreshold * 0.5) {
            stateRef.current = STATES.IDLE;
            setState(STATES.IDLE);
            frameBufferRef.current = [];
          }
          break;
        }

        case STATES.PEAK: {
          frameBufferRef.current.push(frame);

          // Track peak angle (may still be ascending slightly)
          if (angle > peakAngleRef.current) {
            peakAngleRef.current = angle;
            peakFrameRef.current = frame;
          }

          // Check if descending
          if (angle < peakAngleThreshold) {
            stateRef.current = STATES.DESCENDING;
            setState(STATES.DESCENDING);
          }
          break;
        }

        case STATES.DESCENDING: {
          frameBufferRef.current.push(frame);

          // Rep completes when angle returns below the return threshold
          if (angle <= returnAngleThreshold) {
            const newRepCount = repCountRef.current + 1;
            repCountRef.current = newRepCount;
            setRepCount(newRepCount);

            // Collect rep data
            const repData = {
              repNumber: newRepCount,
              startFrame: startFrameRef.current,
              peakFrame: peakFrameRef.current,
              endFrame: frame,
              peakAngle: peakAngleRef.current,
              frames: [...frameBufferRef.current],
              timestamp: Date.now(),
            };

            // Reset for next rep
            stateRef.current = STATES.IDLE;
            setState(STATES.IDLE);
            frameBufferRef.current = [];
            peakAngleRef.current = 0;
            peakFrameRef.current = null;
            startFrameRef.current = null;

            // Notify
            if (onRepComplete) {
              onRepComplete(repData);
            }
          }
          break;
        }
      }
    },
    [exerciseConfig, onRepComplete]
  );

  /**
   * Reset the detection state (new session).
   */
  const reset = useCallback(() => {
    stateRef.current = STATES.IDLE;
    setState(STATES.IDLE);
    repCountRef.current = 0;
    setRepCount(0);
    setCurrentAngle(0);
    frameBufferRef.current = [];
    peakAngleRef.current = 0;
    peakFrameRef.current = null;
    startFrameRef.current = null;
  }, []);

  return {
    state,
    repCount,
    currentAngle,
    addFrame,
    reset,
  };
}
