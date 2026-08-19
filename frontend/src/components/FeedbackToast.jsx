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

  const severityClass =
    feedback.correct === true
      ? 'toast-success'
      : feedback.correct === false
      ? feedback.severity === 'high'
        ? 'toast-error'
        : 'toast-warning'
      : 'toast-info';

  const icon =
    feedback.correct === true ? '✓' : feedback.correct === false ? '⚠' : 'ℹ';

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
              : 'Notice'}
          </span>
          <span className={`source-badge ${feedback.verdictSource === 'vlm' ? 'badge-ai' : 'badge-local'}`}>
            {feedback.verdictSource === 'vlm' ? '🤖 AI Verified' : '📐 Local Check'}
          </span>
        </div>
        <p className="toast-message">{feedback.issue || 'Perfect rep — keep it up!'}</p>
      </div>
    </div>
  );
}
