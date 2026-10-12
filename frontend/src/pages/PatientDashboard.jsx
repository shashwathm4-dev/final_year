/**
 * PatientDashboard — Patient view for assigned exercises & workout history.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAssignments, getMySessions, getExercises, getUnreadComments, downloadProgressReport, getMyRisk } from '../services/api';
import SessionComments from '../components/SessionComments';
import ConnectionBadge from '../components/ConnectionBadge';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import defaultExercisesJson from '../config/exercises.json';

const staticExercises = Object.values(defaultExercisesJson);
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PatientDashboard() {
  const { user, fullName, signOut } = useAuth();
  const navigate = useNavigate();
  const { canInstall, promptInstall } = useInstallPrompt();

  const [assignments, setAssignments] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [availableExercises, setAvailableExercises] = useState(staticExercises);
  const [loading, setLoading] = useState(true);
  const [reportBusy, setReportBusy] = useState(false);
  const [riskAlert, setRiskAlert] = useState(null);

  const handleReport = async () => {
    setReportBusy(true);
    try {
      await downloadProgressReport(null, 30);
    } catch (err) {
      console.warn('Report failed:', err.message);
    } finally {
      setReportBusy(false);
    }
  };

  const [unread, setUnread] = useState({ total: 0, bySession: {} });
  const [openCommentsId, setOpenCommentsId] = useState(null);
  const refreshUnread = () => getUnreadComments().then(setUnread);
  useEffect(() => { refreshUnread(); }, []);

  useEffect(() => {
    async function loadPatientData() {
      try {
        const [assigned, sessions, allExercises, riskData] = await Promise.all([
          getAssignments().catch(() => []),
          getMySessions().catch(() => []),
          getExercises().catch(() => staticExercises),
          getMyRisk().catch(() => ({ results: [] })),
        ]);
        setAssignments((assigned || []).filter((a) => a.status !== 'archived'));
        setRecentSessions(sessions || []);
        if (allExercises && allExercises.length > 0) {
          setAvailableExercises(allExercises);
        }
        const nonLow = (riskData?.results || []).filter((r) => r.riskLevel && r.riskLevel !== 'low');
        if (nonLow.length > 0) {
          const flags = nonLow.flatMap((r) => r.flags || []);
          const topFlag = flags[0]?.message || 'Your recent sessions show a change worth mentioning to your physiotherapist.';
          setRiskAlert(topFlag);
        }
      } catch (err) {
        console.error('Error loading patient dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadPatientData();
  }, []);

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">🏃‍♂️</span>
          <div>
            <h1>Patient Portal</h1>
            <p className="dashboard-subtitle">
              Welcome, {fullName || user?.email?.split('@')[0]}
            </p>
          </div>
        </div>
        <div className="dashboard-actions">
          <ConnectionBadge />
          {canInstall && (
            <button className="btn-secondary" onClick={promptInstall} id="btn-install-app">
              📲 Install App
            </button>
          )}
          <span className="user-badge patient-badge">Patient</span>
          <button className="btn-secondary" onClick={() => navigate('/privacy')}>
            🔒 Privacy
          </button>
          <button className="btn-secondary" onClick={handleReport} disabled={reportBusy}>
            {reportBusy ? 'Generating…' : '📄 My Report'}
          </button>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>

      {riskAlert && (
        <div className="dashboard-alert" style={{ margin: '1rem 0', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--red-400)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>🩺</span>
          <div style={{ flex: 1, fontSize: '0.9rem' }}>
            <strong style={{ color: 'var(--red-400)' }}>Physiotherapy Notice:</strong> {riskAlert}
            <span style={{ display: 'block', fontSize: '0.75rem', opacity: 0.8, marginTop: '0.2rem' }}>
              Screening aid only — not a diagnosis. Discuss changes with your physiotherapist.
            </span>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        {/* Left column: Doctor's Prescribed Plan */}
        <section className="dashboard-card">
          <div className="card-header">
            <h2>📋 Prescribed Rehabilitation Plan</h2>
            <span className="count-badge">{assignments.length} assigned</span>
          </div>

          {loading ? (
            <div className="card-loading">Loading prescribed exercises...</div>
          ) : assignments.length === 0 ? (
            <div className="empty-state">
              <p>No prescribed exercises yet.</p>
              <span className="empty-hint">
                Your doctor will assign target routines here. You can also start an open session below!
              </span>
            </div>
          ) : (
            <div className="items-list">
              {assignments.map((item) => (
                <div key={item.id} className="assignment-item">
                  <div className="assignment-info">
                    <h3>
                      {item.exerciseName || item.exerciseId}
                      {item.programName && <span className="program-tag">{item.programName}</span>}
                      {item.daysOfWeek?.includes(new Date().getDay()) && <span className="program-tag due-today">Due today</span>}
                    </h3>
                    <p className="assignment-meta">
                      🎯 Target: {item.targetSets || 3} sets × {item.targetReps || 10} reps
                    </p>
                    {item.daysOfWeek && item.daysOfWeek.length > 0 && (
                      <div className="day-chips">
                        {DAY_LABELS.map((label, d) => (
                          <span key={d} className={`day-chip day-chip-static ${item.daysOfWeek.includes(d) ? 'day-chip-on' : ''}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && <p className="assignment-notes">Doctor note: "{item.notes}"</p>}
                  </div>
                  <button
                    className="btn-start"
                    onClick={() => navigate(`/session/${item.exerciseId}`)}
                  >
                    Start Routine →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right column: Quick Start & Session History */}
        <div className="dashboard-subcol">
          {/* Quick Start All Exercises */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>⚡ Quick Practice Session</h2>
            </div>
            <div className="quick-exercise-buttons">
              {availableExercises.map((ex) => (
                <button
                  key={ex.id}
                  className="quick-exercise-btn"
                  onClick={() => navigate(`/session/${ex.id}`)}
                >
                  <span className="btn-icon">{ex.icon || '💪'}</span>
                  <div className="btn-text">
                    <span className="btn-title">{ex.displayName}</span>
                    <span className="btn-sub">{ex.target_angle_range ? `${ex.target_angle_range[0]}°–${ex.target_angle_range[1]}°` : 'Standard'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Session History */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>📈 Your Recent Activity {unread.total > 0 && <span className="unread-dot">{unread.total}</span>}</h2>
              <span className="count-badge">{recentSessions.length} total</span>
            </div>

            {loading ? (
              <div className="card-loading">Loading session history...</div>
            ) : recentSessions.length === 0 ? (
              <div className="empty-state">
                <p>No completed sessions recorded yet.</p>
                <span className="empty-hint">Start a routine to track your progress metrics and AI form checks!</span>
              </div>
            ) : (
              <div className="history-list">
                {recentSessions.slice(0, 5).map((s) => {
                  const dateStr = s.startedAt ? new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
                  const accuracy = s.totalReps > 0 ? Math.round(((s.correctReps || 0) / s.totalReps) * 100) : 0;
                  return (
                    <div key={s.sessionId} className="history-entry">
                      <div className="history-item">
                        <div className="history-main">
                          <span className="history-name">{s.exerciseId?.replace(/_/g, ' ')}</span>
                          {s.coaching?.headline && (
                            <span className="history-sub" style={{ display: 'block', fontSize: '0.78rem', color: 'var(--teal-400)', opacity: 0.9, marginTop: '0.1rem' }}>
                              {s.coaching.headline}
                            </span>
                          )}
                          <span className="history-date">{dateStr}</span>
                        </div>
                        <div className="history-stats">
                          <span className="history-reps">{s.totalReps || 0} reps</span>
                          <span className={`accuracy-pill ${accuracy >= 80 ? 'acc-good' : accuracy >= 50 ? 'acc-mid' : 'acc-low'}`}>
                            {accuracy}% correct
                          </span>
                        </div>
                      </div>
                      <div className="history-actions">
                        <button className="btn-link" onClick={() => setOpenCommentsId(openCommentsId === s.sessionId ? null : s.sessionId)}>
                          💬 Doctor feedback
                          {unread.bySession[s.sessionId] > 0 && <span className="unread-dot">{unread.bySession[s.sessionId]}</span>}
                        </button>
                      </div>
                      {openCommentsId === s.sessionId && (
                        <SessionComments sessionId={s.sessionId} myRole="patient" onRead={refreshUnread} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
