/**
 * SessionSummary — End-of-session stats display.
 * Shows total reps, % correct, common issues, animated counters, fatigue summary, and Gemini/rule-based coaching.
 */
import React, { useMemo, useState, useEffect } from 'react';
import { getCoachingSummary } from '../services/api';
import { localCoach } from '../utils/localCoach';

export default function SessionSummary({ sessionId, repHistory, exerciseConfig, fatigue, onClose, onRestart }) {
  const [coach, setCoach] = useState(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const fetchCoach = (refresh = false) => {
    if (!repHistory || repHistory.length === 0) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setCoach(localCoach(repHistory, fatigue));
      return;
    }
    if (!sessionId) {
      setCoach(localCoach(repHistory, fatigue));
      return;
    }
    setCoachLoading(true);
    getCoachingSummary(sessionId, refresh)
      .then((data) => {
        if (data) setCoach(data);
        else setCoach(localCoach(repHistory, fatigue));
      })
      .catch(() => {
        setCoach(localCoach(repHistory, fatigue));
      })
      .finally(() => {
        setCoachLoading(false);
      });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCoach(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [sessionId]);

  useEffect(() => {
    const handleOnline = () => {
      if (coach?.source === 'offline') {
        fetchCoach(true);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [coach, sessionId]);

  const stats = useMemo(() => {
    if (!repHistory || repHistory.length === 0) {
      return { total: 0, correct: 0, pct: 0, issues: [], aiVerified: 0, angleOnly: 0 };
    }

    const total = repHistory.length;
    const correct = repHistory.filter((r) => r.correct === true).length;
    const pct = Math.round((correct / total) * 100);

    // Compute quality score averages
    const qualityReps = repHistory.filter((r) => r.qualityScore != null);
    const avgQuality =
      qualityReps.length > 0
        ? Math.round(qualityReps.reduce((acc, r) => acc + r.qualityScore, 0) / qualityReps.length)
        : null;

    // Collect issue frequencies
    const issueMap = {};
    repHistory.forEach((r) => {
      if (r.issue && r.correct === false) {
        issueMap[r.issue] = (issueMap[r.issue] || 0) + 1;
      }
    });

    const issues = Object.entries(issueMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([issue, count]) => ({ issue, count }));

    const aiVerified = repHistory.filter((r) => r.verdictSource === 'vlm').length;
    const angleOnly = repHistory.filter((r) => r.verdictSource === 'checkpoint_only').length;

    return { total, correct, pct, avgQuality, issues, aiVerified, angleOnly };
  }, [repHistory]);

  return (
    <div className="session-summary-overlay">
      <div className="session-summary">
        <div className="summary-header">
          <h2>Session Complete</h2>
          <p className="exercise-name">{exerciseConfig?.displayName}</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-ring" style={{ '--progress': stats.total > 0 ? 1 : 0 }}>
              <span className="stat-value">{stats.total}</span>
            </div>
            <span className="stat-label">Total Reps</span>
          </div>

          <div className="stat-card">
            <div className="stat-ring" style={{ '--progress': stats.total > 0 ? stats.correct / stats.total : 0 }}>
              <span className="stat-value">{stats.correct}</span>
            </div>
            <span className="stat-label">Correct</span>
          </div>

          <div className="stat-card">
            <div
              className={`stat-ring ${
                stats.pct >= 80 ? 'ring-success' : stats.pct >= 50 ? 'ring-warning' : 'ring-error'
              }`}
              style={{ '--progress': stats.pct / 100 }}
            >
              <span className="stat-value">{stats.pct}%</span>
            </div>
            <span className="stat-label">Accuracy</span>
          </div>

          {stats.avgQuality != null && (
            <div className="stat-card">
              <div
                className={`stat-ring ${
                  stats.avgQuality >= 80 ? 'ring-success' : stats.avgQuality >= 60 ? 'ring-warning' : 'ring-error'
                }`}
                style={{ '--progress': stats.avgQuality / 100 }}
              >
                <span className="stat-value">{stats.avgQuality}</span>
              </div>
              <span className="stat-label">Avg Quality</span>
            </div>
          )}
        </div>

        {/* 32 - Fatigue row */}
        {fatigue && fatigue.level !== 'none' && (
          <div
            className="fatigue-summary-row"
            style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '8px',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>⚡ Fatigue Detected:</span>
              <span className={`count-badge fatigue-${fatigue.level}`} style={{ textTransform: 'capitalize' }}>
                {fatigue.level}
              </span>
            </div>
            {fatigue.signals && fatigue.signals.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {fatigue.signals.map((s, i) => (
                  <li key={i}>{s.label}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="verification-note" style={{ fontSize: '0.8rem', opacity: 0.8, textAlign: 'center' }}>
          🤖 AI-verified reps: {stats.aiVerified} · 📐 Angle-check only (AI skipped): {stats.angleOnly}
        </p>

        {/* 28 - AI Coaching Summary */}
        <div className="coach-card dashboard-card" style={{ marginTop: '1rem', marginBottom: '1rem', padding: '1rem', textAlign: 'left' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              🎯 Coaching Insights
            </h3>
            {coach && (
              <span className="source-badge">
                {coach.source === 'gemini'
                  ? '✨ Gemini'
                  : coach.source === 'offline'
                  ? '📴 Offline summary'
                  : '📐 Rule-based (AI unavailable)'}
              </span>
            )}
          </div>

          {coachLoading ? (
            <div className="coach-skeleton" style={{ padding: '1rem 0', textAlign: 'center' }}>
              <div className="loading-spinner small" style={{ margin: '0 auto' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Analyzing movement patterns...</p>
            </div>
          ) : coach ? (
            <div className="coach-content">
              <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--teal-400)', fontSize: '0.95rem' }}>{coach.headline}</h4>
              <p style={{ fontSize: '0.85rem', lineHeight: '1.4', margin: '0 0 0.6rem 0' }}>{coach.summary}</p>

              {coach.wins && coach.wins.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.8rem', color: 'var(--green-400)' }}>Wins:</strong>
                  <ul style={{ margin: '0.2rem 0', paddingLeft: '1.2rem', fontSize: '0.8rem' }}>
                    {coach.wins.map((w, i) => (
                      <li key={i}>✓ {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {coach.focusAreas && coach.focusAreas.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.8rem', color: 'var(--amber-400)' }}>Focus areas:</strong>
                  <ul style={{ margin: '0.2rem 0', paddingLeft: '1.2rem', fontSize: '0.8rem' }}>
                    {coach.focusAreas.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {coach.nextStep && (
                <p style={{ fontSize: '0.8rem', margin: '0.4rem 0', color: 'var(--text-primary)' }}>
                  <strong>Next step:</strong> {coach.nextStep}
                </p>
              )}

              {coach.safetyNote && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', margin: '0.5rem 0' }}>
                  ⚠️ {coach.safetyNote}
                </p>
              )}

              <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.8, margin: '0.25rem 0 0.5rem 0' }}>
                Screening aid only — not a diagnosis. Discuss changes with your physiotherapist.
              </p>

              <button
                className="btn btn-secondary"
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => fetchCoach(true)}
                disabled={coachLoading}
                id="btn-regenerate-coaching"
              >
                🔄 Regenerate
              </button>
            </div>
          ) : null}
        </div>

        {stats.issues.length > 0 && (
          <div className="issues-section">
            <h3>Common Issues</h3>
            <ul className="issues-list">
              {stats.issues.map((item, i) => (
                <li key={i} className="issue-item">
                  <span className="issue-text">{item.issue}</span>
                  <span className="issue-count">×{item.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="summary-actions">
          <button className="btn btn-primary" onClick={onRestart} id="btn-restart-session">
            New Session
          </button>
          <button className="btn btn-secondary" onClick={onClose} id="btn-close-summary">
            Back to Exercises
          </button>
        </div>
      </div>
    </div>
  );
}
