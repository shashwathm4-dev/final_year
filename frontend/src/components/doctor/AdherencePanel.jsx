import { useEffect, useState } from 'react';
import { getAdherence } from '../../services/api';

const LABEL = { on_track: 'On track', behind: 'Behind', at_risk: 'At risk', no_plan: 'No plan' };
const CLS = { on_track: 'acc-good', behind: 'acc-mid', at_risk: 'acc-low', no_plan: 'acc-mid' };

export default function AdherencePanel({ onOpenPatient }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getAdherence()
      .then((raw) => {
        // Normalise: the endpoint may return { totals, patients } or patients array directly
        if (!raw || typeof raw !== 'object') {
          setData({ totals: { at_risk: 0, behind: 0, on_track: 0, no_plan: 0 }, patients: [] });
        } else if (Array.isArray(raw)) {
          setData({ totals: { at_risk: 0, behind: 0, on_track: 0, no_plan: 0 }, patients: raw });
        } else {
          setData({
            totals: raw.totals || { at_risk: 0, behind: 0, on_track: 0, no_plan: 0 },
            patients: Array.isArray(raw.patients) ? raw.patients : [],
          });
        }
      })
      .catch(() => setError('Could not load adherence data'));
  }, []);

  if (error) return <div className="dashboard-card"><div className="empty-state"><p>{error}</p></div></div>;
  if (!data) return <div className="dashboard-card"><div className="card-loading">Calculating adherence...</div></div>;

  const { totals, patients } = data;
  return (
    <section className="dashboard-card">
      <div className="card-header">
        <h2>🚦 Patient Adherence (last 7 days)</h2>
        <span className="count-badge">{patients.length} patients</span>
      </div>

      <div className="adh-summary">
        {['at_risk', 'behind', 'on_track', 'no_plan'].map((k) => (
          <div key={k} className={`adh-chip ${CLS[k]}`}><strong>{totals[k] || 0}</strong> {LABEL[k]}</div>
        ))}
      </div>

      {patients.length === 0 ? (
        <div className="empty-state"><p>No patients linked yet.</p></div>
      ) : (
        <div className="history-list">
          {patients.map((p, idx) => (
            <div key={p.patientId || p.uid || idx} className="adh-row" onClick={() => onOpenPatient(p.patientId || p.uid)}>
              <div className="adh-main">
                <span className="history-name">{p.fullName || p.email || 'Patient'}</span>
                <span className="history-date">
                  {p.lastSessionAt ? `Last session ${new Date(p.lastSessionAt).toLocaleDateString()}` : 'No sessions yet'}
                </span>
                {Array.isArray(p.alerts) && p.alerts.map((a, i) => <span key={i} className="adh-alert">⚠ {a}</span>)}
              </div>
              <div className="adh-side">
                {p.weeklyPct != null && (
                  <div className="adh-bar"><div className="adh-bar-fill" style={{ width: `${p.weeklyPct}%` }} /></div>
                )}
                <span className={`accuracy-pill ${CLS[p.status] || 'acc-mid'}`}>{LABEL[p.status] || p.status}{p.weeklyPct != null ? ` · ${p.weeklyPct}%` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

