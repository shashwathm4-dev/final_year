/**
 * useHoldDetection — timed isometric holds.
 * States: WAITING -> HOLDING <-> PAUSED -> (complete) -> WAITING
 * The timer only advances while |angle - targetAngle| <= tolerance.
 * Out of range longer than graceMs  => PAUSED (counted as one "break").
 * Out of range longer than abortMs  => attempt discarded.
 */
import { useState, useRef, useCallback } from 'react';

export default function useHoldDetection(exerciseConfig, onHoldComplete) {
  const [state, setState] = useState('WAITING');
  const [repCount, setRepCount] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(0);
  const [heldSeconds, setHeldSeconds] = useState(0);

  const stateRef = useRef('WAITING');
  const countRef = useRef(0);
  const heldMsRef = useRef(0);
  const breaksRef = useRef(0);
  const lastTsRef = useRef(null);
  const outSinceRef = useRef(null);
  const framesRef = useRef([]);
  const startFrameRef = useRef(null);
  const midFrameRef = useRef(null);
  const lastShownRef = useRef(0);

  const goto = useCallback((s) => {
    if (stateRef.current !== s) {
      stateRef.current = s;
      setState(s);
    }
  }, []);

  const resetAttempt = useCallback(() => {
    heldMsRef.current = 0;
    breaksRef.current = 0;
    outSinceRef.current = null;
    framesRef.current = [];
    startFrameRef.current = null;
    midFrameRef.current = null;
    lastTsRef.current = null;
    lastShownRef.current = 0;
    setHeldSeconds(0);
    goto('WAITING');
  }, [goto]);

  const addFrame = useCallback(
    (frame) => {
      if (!exerciseConfig || !exerciseConfig.hold || !frame) return;
      const { targetAngle, tolerance, durationSec, graceMs = 600, abortMs = 3000 } = exerciseConfig.hold;
      const angle = frame.angle;
      setCurrentAngle(angle);

      const inRange = Math.abs(angle - targetAngle) <= tolerance;
      const dt = lastTsRef.current == null ? 0 : Math.min(frame.timestamp - lastTsRef.current, 200);
      lastTsRef.current = frame.timestamp;

      if (stateRef.current === 'WAITING') {
        if (inRange) {
          heldMsRef.current = 0;
          breaksRef.current = 0;
          outSinceRef.current = null;
          framesRef.current = [frame];
          startFrameRef.current = frame;
          midFrameRef.current = null;
          goto('HOLDING');
        }
        return;
      }

      framesRef.current.push(frame);

      if (inRange) {
        outSinceRef.current = null;
        if (stateRef.current === 'PAUSED') goto('HOLDING');
        heldMsRef.current += dt;
        // Keep one image from the middle of the hold
        if (!midFrameRef.current && heldMsRef.current >= (durationSec * 1000) / 2) {
          midFrameRef.current = {
            ...frame,
            frameDataUrl: typeof frame.captureFrame === 'function' ? frame.captureFrame() : null,
          };
        }
      } else {
        if (outSinceRef.current == null) outSinceRef.current = frame.timestamp;
        const outFor = frame.timestamp - outSinceRef.current;
        if (outFor > abortMs) {
          resetAttempt();
          return;
        }
        if (outFor > graceMs && stateRef.current !== 'PAUSED') {
          breaksRef.current += 1;
          goto('PAUSED');
        }
      }

      // Throttle UI updates to 0.1 s steps
      const shown = Math.floor(heldMsRef.current / 100);
      if (shown !== lastShownRef.current) {
        lastShownRef.current = shown;
        setHeldSeconds(heldMsRef.current / 1000);
      }

      if (heldMsRef.current >= durationSec * 1000) {
        const frames = framesRef.current;
        const meanAngle = frames.reduce((s, f) => s + f.angle, 0) / frames.length;
        const n = countRef.current + 1;
        countRef.current = n;
        setRepCount(n);

        const data = {
          repNumber: n,
          mode: 'hold',
          startFrame: startFrameRef.current,
          peakFrame: midFrameRef.current || frame,
          endFrame: frame,
          peakAngle: meanAngle,
          frames: [...frames],
          holdSeconds: Math.round(heldMsRef.current / 100) / 10,
          breaks: breaksRef.current,
          timestamp: Date.now(),
        };
        resetAttempt();
        if (onHoldComplete) onHoldComplete(data);
      }
    },
    [exerciseConfig, onHoldComplete, goto, resetAttempt]
  );

  const reset = useCallback(() => {
    countRef.current = 0;
    setRepCount(0);
    setCurrentAngle(0);
    resetAttempt();
  }, [resetAttempt]);

  return { state, repCount, currentAngle, heldSeconds, addFrame, reset, abortCurrent: resetAttempt };
}
