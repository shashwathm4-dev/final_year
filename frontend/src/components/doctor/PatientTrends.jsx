import { useEffect, useState } from 'react';
import { getPatientTrends } from '../../services/api';
import TrendChart from '../charts/TrendChart';

const DIR = { improving: '📈 Improving', declining: '📉 Declining', flat: '➖ Flat' };
const fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function PatientTrends({ patient }) {
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setTrends(null); setError('');
    getPatientTrends(patient.uid).then(setTrends).catch(() => setError('Could not load trends'));
  }, [patient.uid]);

  if (error) return <section className="dashboard-card"><div className="empty-state"><p>{error}</p></div></section>;
  if (!trends) return <section className="dashboard-card"><div className="card-loading">Loading trends...</div></section>;
  if (trends.exercises.length === 0) {
    return (
      <section className="dashboard-card">
        <div className="card-header"><h2>📈 Trend Analytics</h2></div>
        <div className="empty-state"><p>Trends appear after the patient completes a session.</p></div>
      </section>
    );
  }

  return (
    <section className="dashboard-card">
      <div className="card-header">
        <h2>📈 Trend Analytics</h2>
        <span className="count-badge">{trends.totals.sessions} sessions · {trends.totals.reps} reps</span>
      </div>

      {trends.exercises.map((ex) => (
        <div key={ex.exerciseId} className="trend-block">
          <div className="trend-head">
            <span className="history-name">{ex.exerciseId.replace(/_/g, ' ')}</span>
            <span className={`accuracy-pill ${ex.direction === 'improving' ? 'acc-good' : ex.direction === 'declining' ? 'acc-low' : 'acc-mid'}`}>
              {DIR[ex.direction]} ({ex.romChange >= 0 ? '+' : ''}{ex.romChange}° since first session)
            </span>
          </div>
          <TrendChart
            unit="°"
            labels={ex.points.map((p) => fmtDate(p.date))}
            series={[
              { name: 'Avg peak angle', color: '#2dd4bf', values: ex.points.map((p) => p.avgPeakAngle) },
              { name: 'Best peak angle', color: '#fbbf24', values: ex.points.map((p) => p.maxPeakAngle) },
            ]}
          />
          <TrendChart
            height={130}
            labels={ex.points.map((p) => fmtDate(p.date))}
            series={[
              { name: 'Accuracy %', color: '#4ade80', values: ex.points.map((p) => p.accuracy) },
              { name: 'Quality', color: '#818cf8', values: ex.points.map((p) => p.avgQuality) },
            ]}
          />
          <div className="trend-legend">
            <span style={{ color: '#2dd4bf' }}>● Avg ROM</span>
            <span style={{ color: '#fbbf24' }}>● Best ROM</span>
            <span style={{ color: '#4ade80' }}>● Accuracy %</span>
            <span style={{ color: '#818cf8' }}>● Quality</span>
          </div>
        </div>
      ))}

      <div className="trend-block">
        <h3 className="trend-sub">Most common mistakes</h3>
        {trends.commonMistakes.length === 0 ? (
          <div className="empty-hint">No form errors recorded.</div>
        ) : (
          trends.commonMistakes.map((m) => (
            <div key={m.issue} className="mistake-row">
              <span className="issue-text">{m.issue}</span>
              <div className="adh-bar"><div className="adh-bar-fill adh-bar-red" style={{ width: `${Math.min(100, m.pctOfReps * 2)}%` }} /></div>
              <span className="issue-count">×{m.count} ({m.pctOfReps}%)</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
