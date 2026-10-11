/**
 * useVoiceCoach — spoken coaching via the browser's Web Speech API (no extra dependency).
 * speak(text, { key, cooldownMs, interrupt })
 *   key        identifies the cue so the same cue isn't repeated too often
 *   cooldownMs minimum gap between two utterances with the same key
 *   interrupt  cancel anything currently being spoken
 * The on/off choice is remembered in localStorage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const LS_KEY = 'voice_coach_enabled';

export default function useVoiceCoach() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(LS_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  const lastSpokenRef = useRef({});
  const voiceRef = useRef(null);

  useEffect(() => {
    if (!supported) return undefined;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current =
        voices.find((v) => /en-IN/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text, { key = text, cooldownMs = 4000, interrupt = false } = {}) => {
      if (!supported || !enabled || !text) return;
      const now = Date.now();
      if (now - (lastSpokenRef.current[key] || 0) < cooldownMs) return;
      if (!interrupt && window.speechSynthesis.speaking) return;   // don't talk over ourselves
      if (interrupt) window.speechSynthesis.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.0;
      if (voiceRef.current) {
        u.voice = voiceRef.current;
        u.lang = voiceRef.current.lang;
      }
      lastSpokenRef.current[key] = now;
      window.speechSynthesis.speak(u);
    },
    [supported, enabled]
  );

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      if (!next && supported) window.speechSynthesis.cancel();
      return next;
    });
  }, [supported]);

  return { supported, enabled, toggle, speak };
}
