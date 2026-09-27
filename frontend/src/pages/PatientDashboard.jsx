/**
 * PatientDashboard — Patient view for assigned exercises & workout history.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAssignments, getMySessions, getExercises } from '../services/api';

export default function PatientDashboard() {
  const { user, fullName, signOut } = useAuth();
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [availableExercises, setAvailableExercises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPatientData() {
      try {
        const [assigned, sessions, allExercises] = await Promise.all([
          getAssignments(),
          getMySessions(),
          getExercises(),
        ]);
        setAssignments(assigned || []);
        setRecentSessions(sessions || []);
        setAvailableExercises(allExercises || []);
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
          <span className="user-badge patient-badge">Patient</span>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>

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
                    <h3>{item.exerciseName || item.exerciseId}</h3>
                    <p className="assignment-meta">
                      🎯 Target: {item.targetSets || 3} sets × {item.targetReps || 10} reps
                    </p>
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
              <h2>📈 Your Recent Activity</h2>
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
                    <div key={s.sessionId} className="history-item">
                      <div className="history-main">
                        <span className="history-name">{s.exerciseId?.replace(/_/g, ' ')}</span>
                        <span className="history-date">{dateStr}</span>
                      </div>
                      <div className="history-stats">
                        <span className="history-reps">{s.totalReps || 0} reps</span>
                        <span className={`accuracy-pill ${accuracy >= 80 ? 'acc-good' : accuracy >= 50 ? 'acc-mid' : 'acc-low'}`}>
                          {accuracy}% correct
                        </span>
                      </div>
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
