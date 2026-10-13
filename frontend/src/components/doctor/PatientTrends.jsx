import { useEffect, useState } from 'react';
import { getPatientTrends } from '../../services/api';
import TrendChart from '../charts/TrendChart';

const DIR = { improving: '📈 Improving', declining: '📉 Declining', flat: '➖ Flat' };
const fmtDate = (d) => {
  try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return ''; }
};

export default function PatientTrends({ patient }) {
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState('');

  // Guard: if patient or patient.uid is missing, skip the fetch entirely
  const patientUid = patient?.uid;

  useEffect(() => {
    if (!patientUid) return;
    setTrends(null);
    setError('');
    getPatientTrends(patientUid)
      .then((data) => {
        // Normalise the response so downstream rendering never crashes
        if (!data || typeof data !== 'object') {
          setTrends({ exercises: [], commonMistakes: [], totals: { sessions: 0, reps: 0 } });
        } else {
          setTrends({
            exercises: Array.isArray(data.exercises) ? data.exercises : [],
            commonMistakes: Array.isArray(data.commonMistakes) ? data.commonMistakes : [],
            totals: data.totals || { sessions: data.totalSessions || 0, reps: 0 },
          });
        }
      })
      .catch(() => setError('Could not load trends'));
  }, [patientUid]);

  if (!patientUid) return null;
  if (error) return <section className="dashboard-card"><div className="empty-state"><p>{error}</p></div></section>;
  if (!trends) return <section className="dashboard-card"><div className="card-loading">Loading trends...</div></section>;
  if (!trends.exercises || trends.exercises.length === 0) {
    return (
      <section className="dashboard-card">
        <div className="card-header"><h2>📈 Trend Analytics</h2></div>
        <div className="empty-state"><p>Trends appear after the patient completes a session.</p></div>
      </section>
    );
  }

  const totalSessions = trends.totals?.sessions ?? 0;
  const totalReps = trends.totals?.reps ?? 0;

  return (
    <section className="dashboard-card">
      <div className="card-header">
        <h2>📈 Trend Analytics</h2>
        <span className="count-badge">{totalSessions} sessions · {totalReps} reps</span>
      </div>

      {trends.exercises.map((ex) => {
        if (!ex || !ex.exerciseId) return null;
        const points = Array.isArray(ex.points) ? ex.points : [];
        return (
          <div key={ex.exerciseId} className="trend-block">
            <div className="trend-head">
              <span className="history-name">{ex.exerciseId.replace(/_/g, ' ')}</span>
              <span className={`accuracy-pill ${ex.direction === 'improving' ? 'acc-good' : ex.direction === 'declining' ? 'acc-low' : 'acc-mid'}`}>
                {DIR[ex.direction] || '➖ Flat'} ({(ex.romChange || 0) >= 0 ? '+' : ''}{ex.romChange || 0}° since first session)
              </span>
            </div>
            {points.length > 0 && (
              <>
                <TrendChart
                  unit="°"
                  labels={points.map((p) => fmtDate(p.date))}
                  series={[
                    { name: 'Avg peak angle', color: '#2dd4bf', values: points.map((p) => p.avgPeakAngle) },
                    { name: 'Best peak angle', color: '#fbbf24', values: points.map((p) => p.maxPeakAngle) },
                  ]}
                />
                <TrendChart
                  height={130}
                  labels={points.map((p) => fmtDate(p.date))}
                  series={[
                    { name: 'Accuracy %', color: '#4ade80', values: points.map((p) => p.accuracy) },
                    { name: 'Quality', color: '#818cf8', values: points.map((p) => p.avgQuality) },
                  ]}
                />
              </>
            )}
            <div className="trend-legend">
              <span style={{ color: '#2dd4bf' }}>● Avg ROM</span>
              <span style={{ color: '#fbbf24' }}>● Best ROM</span>
              <span style={{ color: '#4ade80' }}>● Accuracy %</span>
              <span style={{ color: '#818cf8' }}>● Quality</span>
            </div>
          </div>
        );
      })}

      <div className="trend-block">
        <h3 className="trend-sub">Most common mistakes</h3>
        {trends.commonMistakes.length === 0 ? (
          <div className="empty-hint">No form errors recorded.</div>
        ) : (
          trends.commonMistakes.map((m, idx) => (
            <div key={m.issue || idx} className="mistake-row">
              <span className="issue-text">{m.issue}</span>
              <div className="adh-bar"><div className="adh-bar-fill adh-bar-red" style={{ width: `${Math.min(100, (m.pctOfReps || 0) * 2)}%` }} /></div>
              <span className="issue-count">×{m.count || 0} ({m.pctOfReps || 0}%)</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
