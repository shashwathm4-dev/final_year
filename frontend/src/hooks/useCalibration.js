/**
 * useCalibration — two timed phases:
 *   'rest' (3 s): patient relaxes in the starting position  -> restAngle = median
 *   'max'  (6 s): patient moves to the furthest comfortable position -> maxAngle = 90th percentile
 * Feed it every frame through addSample(angle, confidence).
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { median, percentile } from '../utils/calibration';

const REST_MS = 3000;
const MAX_MS = 6000;

export default function useCalibration({ onComplete, onError } = {}) {
  const [phase, setPhase] = useState('idle'); // idle | rest | max
  const [secondsLeft, setSecondsLeft] = useState(0);

  const phaseRef = useRef('idle');
  const startedRef = useRef(0);
  const restRef = useRef([]);
  const maxRef = useRef([]);
  const cbRef = useRef({ onComplete, onError });
  useEffect(() => {
    cbRef.current = { onComplete, onError };
  });

  const setPhaseBoth = useCallback((p) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const start = useCallback(() => {
    restRef.current = [];
    maxRef.current = [];
    startedRef.current = performance.now();
    setPhaseBoth('rest');
    setSecondsLeft(REST_MS / 1000);
  }, [setPhaseBoth]);

  const cancel = useCallback(() => {
    setPhaseBoth('idle');
    setSecondsLeft(0);
  }, [setPhaseBoth]);

  const isRunning = useCallback(() => phaseRef.current !== 'idle', []);

  const addSample = useCallback(
    (angle, confidence) => {
      const ph = phaseRef.current;
      if (ph === 'idle') return;

      const now = performance.now();
      const elapsed = now - startedRef.current;
      const duration = ph === 'rest' ? REST_MS : MAX_MS;

      if (confidence >= 0.5) (ph === 'rest' ? restRef : maxRef).current.push(angle);
      setSecondsLeft(Math.max(0, Math.ceil((duration - elapsed) / 1000)));
      if (elapsed < duration) return;

      if (ph === 'rest') {
        startedRef.current = now;
        setPhaseBoth('max');
        setSecondsLeft(MAX_MS / 1000);
        return;
      }

      // Finished
      const rest = restRef.current;
      const max = maxRef.current;
      setPhaseBoth('idle');
      setSecondsLeft(0);

      if (rest.length < 10 || max.length < 20) {
        cbRef.current.onError?.('Not enough tracking data. Make sure you are fully visible and try again.');
        return;
      }
      const restAngle = median(rest);
      const maxAngle = percentile(max, 90);
      if (maxAngle - restAngle < 15) {
        cbRef.current.onError?.('The movement was too small. Try again and move further.');
        return;
      }
      cbRef.current.onComplete?.({
        restAngle: Math.round(restAngle * 10) / 10,
        maxAngle: Math.round(maxAngle * 10) / 10,
      });
    },
    [setPhaseBoth]
  );

  return { phase, secondsLeft, start, cancel, isRunning, addSample };
}
