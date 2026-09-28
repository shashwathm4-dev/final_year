/**
 * DoctorDashboard — Doctor view for managing patients, assigning routines, and reviewing sessions.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getDoctorPatients,
  addDoctorPatient,
  getExercises,
  assignExerciseToPatient,
  getPatientSessions,
} from '../services/api';
import defaultExercisesJson from '../config/exercises.json';

const staticExercises = Object.values(defaultExercisesJson);

export default function DoctorDashboard() {
  const { user, fullName, signOut } = useAuth();
  const navigate = useNavigate();

  const [patients, setPatients] = useState([]);
  const [exercises, setExercises] = useState(staticExercises);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientSessions, setPatientSessions] = useState([]);
  const [newPatientEmail, setNewPatientEmail] = useState('');
  const [assignData, setAssignData] = useState({
    exerciseId: '',
    targetReps: 10,
    targetSets: 3,
    notes: '',
  });
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initDashboard() {
      try {
        const [patientsRes, exercisesRes] = await Promise.all([
          getDoctorPatients().catch(() => ({ patients: [] })),
          getExercises().catch(() => staticExercises),
        ]);
        const pts = patientsRes.patients || [];
        setPatients(pts);
        if (exercisesRes && exercisesRes.length > 0) {
          setExercises(exercisesRes);
        }
        if (pts.length > 0) {
          selectPatient(pts[0]);
        }
      } catch (err) {
        console.error('Error initializing doctor dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    initDashboard();
  }, []);

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    try {
      const sessions = await getPatientSessions(patient.uid);
      setPatientSessions(sessions || []);
    } catch (err) {
      console.warn('Could not fetch patient sessions:', err);
      setPatientSessions([]);
    }
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    if (!newPatientEmail) return;
    setStatusMsg('');
    try {
      const res = await addDoctorPatient(newPatientEmail.trim());
      if (res.patient) {
        setPatients((prev) => [...prev, res.patient]);
        setNewPatientEmail('');
        setStatusMsg(`✓ Successfully added patient ${res.patient.email}`);
        if (!selectedPatient) selectPatient(res.patient);
      }
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to add patient'}`);
    }
  };

  const handleAssignExercise = async (e) => {
    e.preventDefault();
    if (!selectedPatient || !assignData.exerciseId) return;
    setStatusMsg('');

    const exerciseObj = exercises.find((ex) => ex.id === assignData.exerciseId);
    try {
      await assignExerciseToPatient({
        patientId: selectedPatient.uid,
        patientEmail: selectedPatient.email,
        exerciseId: assignData.exerciseId,
        exerciseName: exerciseObj?.displayName || assignData.exerciseId,
        targetReps: Number(assignData.targetReps),
        targetSets: Number(assignData.targetSets),
        notes: assignData.notes,
      });
      setStatusMsg(`✓ Assigned ${exerciseObj?.displayName} to ${selectedPatient.fullName || selectedPatient.email}`);
      setAssignData({ exerciseId: '', targetReps: 10, targetSets: 3, notes: '' });
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to assign exercise'}`);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Top Navbar */}
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">🩺</span>
          <div>
            <h1>Doctor Clinical Portal</h1>
            <p className="dashboard-subtitle">Dr. {fullName || user?.email?.split('@')[0]}</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="btn-primary" onClick={() => navigate('/builder')}>
            + Custom Exercise Builder
          </button>
          <span className="user-badge doctor-badge">Doctor</span>
          <button className="btn-secondary" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </header>

      {statusMsg && (
        <div className={`dashboard-alert ${statusMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
          {statusMsg}
        </div>
      )}

      <div className="dashboard-grid doctor-grid">
        {/* Patient Sidebar */}
        <section className="dashboard-card patient-sidebar">
          <div className="card-header">
            <h2>👥 Assigned Patients</h2>
            <span className="count-badge">{patients.length}</span>
          </div>

          <form onSubmit={handleAddPatient} className="add-patient-form">
            <input
              type="email"
              placeholder="Add patient by email..."
              value={newPatientEmail}
              onChange={(e) => setNewPatientEmail(e.target.value)}
              required
            />
            <button type="submit" className="btn-add-patient">+ Add</button>
          </form>

          {loading ? (
            <div className="card-loading">Loading patients...</div>
          ) : patients.length === 0 ? (
            <div className="empty-state">
              <p>No patients linked yet.</p>
              <span className="empty-hint">Enter their registered email above to link them to your practice.</span>
            </div>
          ) : (
            <div className="patient-list">
              {patients.map((p) => (
                <div
                  key={p.uid}
                  className={`patient-item ${selectedPatient?.uid === p.uid ? 'selected' : ''}`}
                  onClick={() => selectPatient(p)}
                >
                  <div className="patient-avatar">👤</div>
                  <div className="patient-meta">
                    <span className="patient-name">{p.fullName || 'Patient'}</span>
                    <span className="patient-email">{p.email}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Patient Details & Prescriptions */}
        <div className="dashboard-subcol">
          {selectedPatient ? (
            <>
              {/* Prescribe Exercise Card */}
              <section className="dashboard-card">
                <div className="card-header">
                  <h2>🎯 Prescribe Exercise Routine for {selectedPatient.fullName || selectedPatient.email}</h2>
                </div>
                <form onSubmit={handleAssignExercise} className="prescribe-form">
                  <div className="form-row">
                    <div className="form-group flex-2">
                      <label>Exercise</label>
                      <select
                        value={assignData.exerciseId}
                        onChange={(e) => setAssignData({ ...assignData, exerciseId: e.target.value })}
                        required
                      >
                        <option value="">-- Choose Exercise --</option>
                        {exercises.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.displayName} {ex.isCustom ? '★ (Custom)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Sets</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={assignData.targetSets}
                        onChange={(e) => setAssignData({ ...assignData, targetSets: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Reps / Set</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={assignData.targetReps}
                        onChange={(e) => setAssignData({ ...assignData, targetReps: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Clinical Instructions / Form Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Keep spine neutral and hold 1 second at peak"
                      value={assignData.notes}
                      onChange={(e) => setAssignData({ ...assignData, notes: e.target.value })}
                    />
                  </div>

                  <button type="submit" className="btn-assign-submit">
                    Prescribe Routine to Patient
                  </button>
                </form>
              </section>

              {/* Patient Session Logs */}
              <section className="dashboard-card">
                <div className="card-header">
                  <h2>📊 Patient Performance & Adherence History</h2>
                  <span className="count-badge">{patientSessions.length} sessions</span>
                </div>

                {patientSessions.length === 0 ? (
                  <div className="empty-state">
                    <p>No session data logged yet by this patient.</p>
                    <span className="empty-hint">Completed sessions and real-time form verifications will appear here.</span>
                  </div>
                ) : (
                  <div className="history-list">
                    {patientSessions.map((s) => {
                      const dateStr = s.startedAt ? new Date(s.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
                      const accuracy = s.totalReps > 0 ? Math.round(((s.correctReps || 0) / s.totalReps) * 100) : 0;
                      return (
                        <div key={s.sessionId} className="history-item">
                          <div className="history-main">
                            <span className="history-name">{s.exerciseId?.replace(/_/g, ' ')}</span>
                            <span className="history-date">{dateStr}</span>
                          </div>
                          <div className="history-stats">
                            <span className="history-reps">{s.totalReps || 0} reps total</span>
                            <span className={`accuracy-pill ${accuracy >= 80 ? 'acc-good' : accuracy >= 50 ? 'acc-mid' : 'acc-low'}`}>
                              {accuracy}% accuracy ({s.correctReps || 0} valid)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="dashboard-card empty-state-box">
              <p>Please select or add a patient from the left column to review their records or prescribe routines.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
