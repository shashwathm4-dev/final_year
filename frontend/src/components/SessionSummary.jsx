/**
 * SessionSummary — End-of-session stats display.
 * Shows total reps, % correct, common issues, animated counters.
 */
import { useMemo } from 'react';

export default function SessionSummary({ repHistory, exerciseConfig, onClose, onRestart }) {
  const stats = useMemo(() => {
    if (!repHistory || repHistory.length === 0) {
      return { total: 0, correct: 0, pct: 0, issues: [] };
    }

    const total = repHistory.length;
    const correct = repHistory.filter(r => r.correct === true).length;
    const pct = Math.round((correct / total) * 100);

    // Collect issue frequencies
    const issueMap = {};
    repHistory.forEach(r => {
      if (r.issue && r.correct === false) {
        issueMap[r.issue] = (issueMap[r.issue] || 0) + 1;
      }
    });

    const issues = Object.entries(issueMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([issue, count]) => ({ issue, count }));

    return { total, correct, pct, issues };
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

          <div className="stat-card stat-card-wide">
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
