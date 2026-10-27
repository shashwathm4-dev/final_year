/**
 * useCoachAgent.js
 * React hook that manages:
 * - Alert engine lifecycle
 * - Messages state [{ role: 'user'|'agent'|'alert', ... }]
 * - Throttled live telemetry push to POST /api/agent/live (<=1/s)
 * - Live cue strip instruction (computed locally every ~250ms with hysteresis)
 * - SSE streaming chat and automated assist calls
 * - Status check, busy states, enable toggle, abort on unmount
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createAlertEngine } from '../utils/coachAlerts';
import { getAgentStatus, streamAgent } from '../services/api';
import { auth } from '../config/firebase';

const PAIN_REGEX = /\b(pain|hurt|hurts|hurting|dizzy|dizziness|numb|numbness|sharp|tingl|tingling)\b/i;

export function useCoachAgent({
  exerciseConfig = {},
  sessionId,
  isActive = false,
  isOnline = true,
  onSpeak,
}) {
  const [messages, setMessages] = useState([]);
  const [liveCue, setLiveCue] = useState('');
  const [status, setStatus] = useState({ llm: false, consentRequired: true, hasApiKey: false });
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const engineRef = useRef(null);
  const abortControllerRef = useRef(null);
  const lastLivePushRef = useRef(0);
  const queuedEventsRef = useRef([]);
  const activeStreamMsgIdRef = useRef(null);
  const latestAngleRef = useRef(0);
  const latestStateRef = useRef('IDLE');

  // Initialize alert engine
  useEffect(() => {
    engineRef.current = createAlertEngine(exerciseConfig);
    return () => {
      if (engineRef.current) engineRef.current.reset();
    };
  }, [exerciseConfig.id]);

  // Load agent status
  useEffect(() => {
    async function fetchStatus() {
      const s = await getAgentStatus();
      setStatus(s);
    }
    fetchStatus();
  }, []);

  // Abort ongoing streams on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Compute live cue strip (~250ms timer with hysteresis)
  useEffect(() => {
    if (!isActive) {
      setLiveCue('');
      return;
    }

    const [tMin, tMax] = exerciseConfig.target_angle_range || [80, 100];

    const timer = setInterval(() => {
      const angle = latestAngleRef.current;
      const state = latestStateRef.current;

      if (state === 'PAUSED') {
        setLiveCue('Paused — get back in position');
        return;
      }
      if (state === 'HOLDING') {
        setLiveCue('Good — hold steady');
        return;
      }

      if (angle < tMin - 15) {
        setLiveCue(`Raise higher (${Math.round(angle)}° → ${tMin}°)`);
      } else if (angle < tMin) {
        setLiveCue(`Almost there (${Math.round(angle)}° → ${tMin}°)`);
      } else if (angle >= tMin && angle <= tMax) {
        setLiveCue('Good — in target range');
      } else if (angle > tMax + 15) {
        setLiveCue(`Lower slowly — over target (${Math.round(angle)}°)`);
      } else {
        setLiveCue('Controlled pace — steady return');
      }
    }, 250);

    return () => clearInterval(timer);
  }, [isActive, exerciseConfig.target_angle_range]);

  /**
   * Throttled telemetry pusher to /api/agent/live (<= 1/s)
   */
  const pushLiveTelemetry = useCallback(
    async (snapshot, immediateEvents = []) => {
      if (!isActive || !sessionId || sessionId.startsWith('local_') || !isOnline) {
        return;
      }

      const now = Date.now();
      const eventsToSend = [...queuedEventsRef.current, ...immediateEvents];
      queuedEventsRef.current = [];

      // Throttle snapshots to once per second unless immediate events are present
      if (!immediateEvents.length && now - lastLivePushRef.current < 1000) {
        return;
      }

      lastLivePushRef.current = now;

      try {
        let token = null;
        if (auth?.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
        await fetch('/api/agent/live', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            exerciseId: exerciseConfig.id,
            snapshot,
            events: eventsToSend.length ? eventsToSend : undefined,
          }),
        });
      } catch (err) {
        // Silently swallow live push errors so exercise is uninterrupted
      }
    },
    [isActive, sessionId, exerciseConfig.id, isOnline]
  );

  /**
   * Ingest rep or snapshot into alert engine
   */
  const ingestTelemetry = useCallback(
    (item) => {
      if (item.angle != null) latestAngleRef.current = item.angle;
      if (item.state) latestStateRef.current = item.state;

      if (!engineRef.current || !enabled) return;

      const newAlerts = engineRef.current.ingest(item);
      if (newAlerts && newAlerts.length > 0) {
        setMessages((prev) => [
          ...prev,
          ...newAlerts.map((a) => ({
            id: a.id,
            role: 'alert',
            alert: a,
            at: a.at,
          })),
        ]);

        // Auto-invoke assist on repeated mistake or high fatigue
        const repeated = newAlerts.find((a) => a.key === 'repeated_issue');
        if (repeated) {
          assistNow('repeated_issue', repeated.detail);
        }
        const fatigueWarn = newAlerts.find((a) => a.key === 'fatigue_warn');
        if (fatigueWarn) {
          assistNow('fatigue');
        }
      }

      // Live push handling
      if (item.type === 'rep') {
        pushLiveTelemetry(null, [item]);
      } else {
        pushLiveTelemetry(item);
      }
    },
    [enabled, pushLiveTelemetry]
  );

  /**
   * Send a question to the agent
   */
  const send = useCallback(
    async (text) => {
      if (!text || !text.trim() || busy) return;
      const clean = text.trim();

      // Pain safety local check
      if (PAIN_REGEX.test(clean)) {
        setMessages((prev) => [
          ...prev,
          { id: `u-${Date.now()}`, role: 'user', text: clean, at: Date.now() },
          {
            id: `pain-alert-${Date.now()}`,
            role: 'alert',
            alert: {
              id: `pain-alert-${Date.now()}`,
              key: 'pain_stop',
              severity: 'error',
              title: 'Safety Stop Alert',
              detail: 'Pain or sharp discomfort detected.',
              fix: 'Stop exercising immediately and contact your physiotherapist before continuing.',
              at: Date.now(),
            },
            at: Date.now(),
          },
        ]);
        if (onSpeak) onSpeak('Stop exercising and contact your physiotherapist.');
        return;
      }

      setBusy(true);
      const userMsgId = `u-${Date.now()}`;
      const agentMsgId = `a-${Date.now()}`;
      activeStreamMsgIdRef.current = agentMsgId;

      // Add user message and empty agent placeholder
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: clean, at: Date.now() },
        { id: agentMsgId, role: 'agent', text: '', tool: null, at: Date.now() },
      ]);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const history = messages
        .filter((m) => m.role === 'user' || m.role === 'agent')
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      await streamAgent(
        '/agent/chat',
        { message: clean, history, sessionId },
        {
          onToken: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, text: m.text ? m.text + chunk : chunk, tool: null } : m
              )
            );
          },
          onTool: (toolName) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, tool: toolName } : m))
            );
          },
          onDone: (data) => {
            setBusy(false);
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, tool: null, source: data.source } : m))
            );
          },
          onError: (err) => {
            setBusy(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? {
                      ...m,
                      tool: null,
                      text: m.text || 'Focus on controlled tempo and keep your core stable.',
                    }
                  : m
              )
            );
          },
        },
        abortControllerRef.current.signal
      );
    },
    [busy, messages, sessionId, onSpeak]
  );

  /**
   * Request automated assist on repeated issues or fatigue
   */
  const assistNow = useCallback(
    async (reason = 'repeated_issue', issueText = '') => {
      if (busy) return;
      setBusy(true);

      const agentMsgId = `a-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: agentMsgId, role: 'agent', text: '', tool: 'checking your last reps…', at: Date.now() },
      ]);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      await streamAgent(
        '/agent/assist',
        { reason, issue: issueText, sessionId },
        {
          onToken: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId ? { ...m, text: m.text ? m.text + chunk : chunk, tool: null } : m
              )
            );
          },
          onTool: (toolName) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, tool: toolName } : m))
            );
          },
          onDone: (data) => {
            setBusy(false);
            setMessages((prev) =>
              prev.map((m) => (m.id === agentMsgId ? { ...m, tool: null, source: data.source } : m))
            );
          },
          onError: () => {
            setBusy(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgId
                  ? { ...m, tool: null, text: 'Take a short breath and reset your posture for the next rep.' }
                  : m
              )
            );
          },
        },
        abortControllerRef.current.signal
      );
    },
    [busy, sessionId]
  );

  return {
    messages,
    send,
    assistNow,
    liveCue,
    status,
    busy,
    enabled,
    setEnabled,
    ingestTelemetry,
  };
}
