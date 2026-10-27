/**
 * ChatCoachPanel.jsx
 * Live coaching chatbot sidebar docked inside ExerciseSession layout.
 *
 * Features:
 * - Live Cue Strip at the top (prominent text + dynamic angle bar with in-range/near/out color).
 * - Message list: alert cards (with "Why?" button), streamed agent bubbles, tool chips, user bubbles.
 * - Quick chips: "What am I doing wrong?", "How do I fix this?", "Am I getting tired?", "Explain this exercise".
 * - Input box with send button (disabled offline or while busy).
 * - Consent / AI-off banner when status.llm is false.
 * - Collapsible with floating button and unread badge.
 * - Under 900px behaves as bottom sheet.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';

const QUICK_CHIPS = [
  'What am I doing wrong?',
  'How do I fix this?',
  'Am I getting tired?',
  'Explain this exercise',
];

export function ChatCoachPanel({
  agent,
  currentAngle = 0,
  targetRange = [80, 100],
  isOnline = true,
  isOpen = true,
  onToggleOpen = () => {},
  voiceEnabled = true,
  onToggleVoice = () => {},
}) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const {
    messages = [],
    send,
    assistNow,
    liveCue,
    status = { llm: false },
    busy = false,
  } = agent || {};

  const [tMin, tMax] = targetRange;

  // Track unread messages when collapsed
  const prevMsgLengthRef = useRef(messages.length);
  useEffect(() => {
    if (!isOpen) {
      const added = messages.length - prevMsgLengthRef.current;
      if (added > 0) {
        setUnreadCount((c) => c + added);
      }
    } else {
      setUnreadCount(0);
    }
    prevMsgLengthRef.current = messages.length;
  }, [messages.length, isOpen]);

  // Handle scroll detection
  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setUserScrolledUp(!isAtBottom);
  };

  // Auto-scroll to bottom unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, userScrolledUp]);

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim() || busy || !isOnline) return;
    send(inputText);
    setInputText('');
    setUserScrolledUp(false);
  };

  const handleChipClick = (chip) => {
    if (busy || !isOnline) return;
    send(chip);
    setUserScrolledUp(false);
  };

  // Live angle bar color
  const anglePct = Math.min(100, Math.max(0, (currentAngle / (tMax + 20)) * 100));
  const inRange = currentAngle >= tMin && currentAngle <= tMax;
  const nearRange =
    (currentAngle >= tMin - 15 && currentAngle < tMin) ||
    (currentAngle > tMax && currentAngle <= tMax + 15);
  const angleBarColor = inRange ? '#10b981' : nearRange ? '#f59e0b' : '#ef4444';

  if (!isOpen) {
    return (
      <button
        className="coach-floating-btn"
        onClick={() => {
          onToggleOpen(true);
          setUnreadCount(0);
        }}
        aria-label="Open AI Coach Sidebar"
      >
        <span className="coach-floating-icon">💬</span>
        <span className="coach-floating-label">AI Coach</span>
        {unreadCount > 0 && <span className="coach-unread-badge">{unreadCount}</span>}
      </button>
    );
  }

  return (
    <aside className="chat-coach-panel" aria-label="AI Coach Sidebar">
      {/* Header */}
      <div className="coach-header">
        <div className="coach-title-group">
          <span className="coach-avatar">🤖</span>
          <div>
            <h3 className="coach-title">AI Movement Coach</h3>
            <span className="coach-status-sub">
              {status.llm ? 'Active Reasoning' : 'Rule-Based Assistant'}
            </span>
          </div>
        </div>
        <div className="coach-header-actions">
          <button
            className={`btn-icon-toggle ${voiceEnabled ? 'active' : ''}`}
            onClick={onToggleVoice}
            title={voiceEnabled ? 'Mute spoken cues' : 'Unmute spoken cues'}
          >
            {voiceEnabled ? '🔊' : '🔇'}
          </button>
          <button
            className="btn-icon-toggle"
            onClick={() => onToggleOpen(false)}
            title="Collapse sidebar"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Live Cue Strip (The 'moves with you' part) */}
      <div className="live-cue-strip">
        <div className="live-cue-text">{liveCue || 'Follow exercise pace'}</div>
        <div className="live-cue-bar-track">
          <div
            className="live-cue-bar-fill"
            style={{ width: `${anglePct}%`, backgroundColor: angleBarColor }}
          />
          <span
            className="live-cue-target-start"
            style={{ left: `${(tMin / (tMax + 20)) * 100}%` }}
          />
          <span
            className="live-cue-target-end"
            style={{ left: `${(tMax / (tMax + 20)) * 100}%` }}
          />
        </div>
      </div>

      {/* Consent / AI-off Banner */}
      {!status.llm && (
        <div className="ai-off-banner">
          <span>AI chat is off (rule-based tips only). </span>
          <Link to="/privacy" className="ai-off-link">
            Enable Cloud AI
          </Link>
        </div>
      )}

      {/* Message List */}
      <div
        className="coach-messages-list"
        ref={scrollContainerRef}
        onScroll={handleScroll}
      >
        {messages.length === 0 && (
          <div className="coach-welcome">
            <p className="welcome-headline">Ready for your reps</p>
            <p className="welcome-sub">
              I will track your angle and posture live, warn you of compensations, and guide your form.
            </p>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === 'alert') {
            const a = m.alert;
            return (
              <div
                key={m.id}
                className={`alert-card alert-${a.severity}`}
                aria-live={a.severity === 'error' ? 'assertive' : 'polite'}
              >
                <div className="alert-card-header">
                  <span className="alert-card-icon">
                    {a.severity === 'error' ? '🚫' : a.severity === 'warn' ? '⚠️' : a.severity === 'success' ? '✅' : 'ℹ️'}
                  </span>
                  <span className="alert-card-title">{a.title}</span>
                </div>
                <div className="alert-card-detail">{a.detail}</div>
                {a.fix && (
                  <div className="alert-card-fix">
                    <strong>Fix:</strong> {a.fix}
                  </div>
                )}
                <div className="alert-card-actions">
                  <button
                    className="alert-why-btn"
                    onClick={() => assistNow('repeated_issue', a.detail)}
                    disabled={busy}
                  >
                    Why?
                  </button>
                </div>
              </div>
            );
          }

          if (m.role === 'user') {
            return (
              <div key={m.id} className="bubble-row user-row">
                <div className="chat-bubble user-bubble">{m.text}</div>
              </div>
            );
          }

          // Agent bubble
          return (
            <div key={m.id} className="bubble-row agent-row">
              <div className="chat-bubble agent-bubble">
                {m.tool && (
                  <div className="tool-chip">
                    <span className="tool-spinner" />
                    <span>checking your last reps…</span>
                  </div>
                )}
                {m.text ? (
                  <p className="agent-text">{m.text}</p>
                ) : (
                  !m.tool && <div className="typing-dots"><span /><span /><span /></div>
                )}
                {m.source && (
                  <span className="agent-source-badge">
                    {m.source === 'gemini' ? 'Gemini AI' : 'Rule-based'}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Chips */}
      <div className="quick-chips-row">
        {QUICK_CHIPS.map((chip, idx) => (
          <button
            key={idx}
            className="chip-btn"
            disabled={busy || !isOnline}
            onClick={() => handleChipClick(chip)}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Input box */}
      <form className="coach-input-bar" onSubmit={handleSend}>
        <input
          type="text"
          className="coach-input"
          placeholder={
            !isOnline
              ? 'Offline — live cues still work'
              : busy
              ? 'Coach is answering…'
              : 'Ask coach a question…'
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={busy || !isOnline}
          maxLength={500}
        />
        <button
          type="submit"
          className="coach-send-btn"
          disabled={!inputText.trim() || busy || !isOnline}
          aria-label="Send"
        >
          ➤
        </button>
      </form>
    </aside>
  );
}
