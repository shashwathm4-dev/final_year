/**
 * useFramingGate — debounced "is the user in a good position" state.
 *  - becomes ready after READY_FRAMES consecutive good frames (~0.5 s)
 *  - becomes not-ready after a short run of bad frames
 *    (short before the session, longer during it so brief glitches don't pause counting)
 * evaluate() is stable per exerciseConfig and safe to call on every frame.
 */
import { useState, useRef, useCallback } from 'react';
import { checkFraming } from '../utils/framingCheck';

const READY_FRAMES = 15;
const LOST_FRAMES_IDLE = 8;
const LOST_FRAMES_ACTIVE = 30;   // ~1 s

export default function useFramingGate(exerciseConfig) {
  const [status, setStatus] = useState({ ready: false, messages: ['Step in front of the camera.'] });
  const readyRef = useRef(false);
  const okRef = useRef(0);
  const badRef = useRef(0);
  const keyRef = useRef('');

  const evaluate = useCallback(
    (landmarks, _timestamp, { active = false } = {}) => {
      const res = checkFraming(landmarks, exerciseConfig);

      if (res.ok) {
        okRef.current += 1;
        badRef.current = 0;
      } else {
        badRef.current += 1;
        okRef.current = 0;
      }

      if (!readyRef.current && okRef.current >= READY_FRAMES) {
        readyRef.current = true;
      } else if (readyRef.current && badRef.current >= (active ? LOST_FRAMES_ACTIVE : LOST_FRAMES_IDLE)) {
        readyRef.current = false;
      }

      const messages = readyRef.current ? [] : res.messages.length ? res.messages : ['Hold still for a moment…'];
      const key = `${readyRef.current}|${messages.join('|')}`;
      if (key !== keyRef.current) {
        keyRef.current = key;
        setStatus({ ready: readyRef.current, messages });
      }
    },
    [exerciseConfig]
  );

  const reset = useCallback(() => {
    readyRef.current = false;
    okRef.current = 0;
    badRef.current = 0;
    keyRef.current = '';
    setStatus({ ready: false, messages: ['Step in front of the camera.'] });
  }, []);

  return { status, evaluate, reset };
}
