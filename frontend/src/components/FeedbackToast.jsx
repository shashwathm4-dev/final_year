/**
 * FeedbackToast — Animated slide-in toast for post-rep feedback.
 * Color-coded by verdict: green (correct), amber (minor), red (significant).
 * Shows verdict source badge: "Local Check" or "AI Verified".
 */
import { useEffect, useState } from 'react';

export default function FeedbackToast({ feedback, onDismiss }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (feedback) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(() => onDismiss?.(), 300); // Wait for exit animation
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback, onDismiss]);

  if (!feedback) return null;

  const isError = feedback.correct === null && (feedback.source === 'error' || feedback.verdictSource === 'error');

  const severityClass =
    feedback.correct === true
      ? 'toast-success'
      : feedback.correct === false
      ? feedback.severity === 'high'
        ? 'toast-error'
        : 'toast-warning'
      : isError
      ? 'toast-caution'
      : 'toast-info';

  const icon =
    feedback.correct === true
      ? '✓'
      : feedback.correct === false || isError
      ? '⚠'
      : 'ℹ';

  return (
    <div className={`feedback-toast ${severityClass} ${isVisible ? 'toast-enter' : 'toast-exit'}`}>
      <div className="toast-icon">{icon}</div>
      <div className="toast-content">
        <div className="toast-header">
          <span className="toast-title">
            {feedback.correct === true
              ? 'Great Form!'
              : feedback.correct === false
              ? 'Form Correction'
              : isError
              ? 'Verification Error'
              : 'Notice'}
          </span>
          {feedback.qualityScore != null && (
            <span className="source-badge" style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)' }}>
              🎯 Quality: {feedback.qualityScore}%
            </span>
          )}
          <span className={`source-badge ${
            feedback.verdictSource === 'vlm'
              ? 'badge-ai'
              : isError
              ? 'badge-error'
              : 'badge-local'
          }`}>
            {feedback.verdictSource === 'vlm'
              ? '🤖 AI Verified'
              : isError
              ? '⚡ Error'
              : '📐 Local Check'}
          </span>
        </div>
        <p className="toast-message">{feedback.issue || 'Perfect rep — keep it up!'}</p>
        {feedback.limitingFactor && feedback.limitingFactor !== 'Optimal Form' && (
          <p style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
            Focus area: {feedback.limitingFactor}
          </p>
        )}
      </div>
    </div>
  );
}
