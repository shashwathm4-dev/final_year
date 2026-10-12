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
  getUnreadComments,
  getPrograms,
  assignProgramToPatient,
  getPatientPrograms,
  getMyClinic,
  getClinicPatients,
  downloadProgressReport,
  getPatientRisk,
  getRepModel,
  trainRepModel,
} from '../services/api';
import AdherencePanel from '../components/doctor/AdherencePanel';
import PatientTrends from '../components/doctor/PatientTrends';
import SessionPlayback from '../components/doctor/SessionPlayback';
import SessionComments from '../components/SessionComments';
import ConnectionBadge from '../components/ConnectionBadge';
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

  const [programs, setPrograms] = useState([]);
  const [programToAssign, setProgramToAssign] = useState('');
  const [patientPrograms, setPatientPrograms] = useState([]);
  const [hasClinic, setHasClinic] = useState(false);
  const [scope, setScope] = useState('mine'); // 'mine' | 'clinic'
  const [reportBusy, setReportBusy] = useState(false);

  const [risk, setRisk] = useState(null);
  const [modelsState, setModelsState] = useState({});
  const [trainingEx, setTrainingEx] = useState(null);

  const [tab, setTab] = useState('patients'); // 'patients' | 'adherence'
  const [playbackSessionId, setPlaybackSessionId] = useState(null);
  const [openCommentsId, setOpenCommentsId] = useState(null);
  const [unread, setUnread] = useState({ total: 0, bySession: {} });

  const selectPatient = async (patient) => {
    setSelectedPatient(patient);
    setRisk(null);
    try {
      const sessions = await getPatientSessions(patient.uid);
      setPatientSessions(sessions || []);
    } catch (err) {
      console.warn('Could not fetch patient sessions:', err);
      setPatientSessions([]);
    }
    setPatientPrograms(await getPatientPrograms(patient.uid));
    getPatientRisk(patient.uid)
      .then((r) => setRisk(r.results || []))
      .catch(() => setRisk([]));
  };

  useEffect(() => {
    exercises.forEach((ex) => {
      getRepModel(ex.id).then((m) => {
        if (m) setModelsState((prev) => ({ ...prev, [ex.id]: m }));
      }).catch(() => {});
    });
  }, [exercises]);

  const handleTrainModel = async (exerciseId) => {
    setTrainingEx(exerciseId);
    setStatusMsg('');
    try {
      const res = await trainRepModel(exerciseId);
      if (res.published) {
        setModelsState((prev) => ({ ...prev, [exerciseId]: res.model }));
        setStatusMsg(`✓ Model trained and published for ${exerciseId}!`);
      } else {
        setStatusMsg(`⚠️ Not published: ${res.reason}`);
      }
    } catch (err) {
      setStatusMsg(`✗ Train failed: ${err.message}`);
    } finally {
      setTrainingEx(null);
    }
  };

  const handleScopeChange = async (nextScope) => {
    setScope(nextScope);
    try {
      if (nextScope === 'clinic') {
        setPatients(await getClinicPatients());
      } else {
        const res = await getDoctorPatients();
        setPatients(res.patients || []);
      }
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to load patients'}`);
    }
  };

  const handleAssignProgram = async (e) => {
    e.preventDefault();
    if (!selectedPatient || !programToAssign) return;
    setStatusMsg('');
    try {
      await assignProgramToPatient(programToAssign, selectedPatient.uid);
      const prog = programs.find((p) => p.id === programToAssign);
      setStatusMsg(`✓ Program "${prog?.name}" assigned to ${selectedPatient.fullName || selectedPatient.email}`);
      setProgramToAssign('');
      setPatientPrograms(await getPatientPrograms(selectedPatient.uid));
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to assign program'}`);
    }
  };

  const handleDownloadReport = async () => {
    if (!selectedPatient) return;
    setReportBusy(true);
    try {
      await downloadProgressReport(selectedPatient.uid, 30);
    } catch {
      setStatusMsg('✗ Could not generate the report');
    } finally {
      setReportBusy(false);
    }
  };

  const refreshUnread = () => getUnreadComments().then(setUnread);
  useEffect(() => {
    refreshUnread();
    const t = setInterval(refreshUnread, 30000);
    return () => clearInterval(t);
  }, []);

  const openPatientFromBoard = (patientId) => {
    const p = patients.find((x) => x.uid === patientId);
    if (p) { selectPatient(p); setTab('patients'); }
  };

  useEffect(() => {
    async function initDashboard() {
      try {
        const [patientsRes, exercisesRes, programsRes, clinicRes] = await Promise.all([
          getDoctorPatients().catch(() => ({ patients: [] })),
          getExercises().catch(() => staticExercises),
          getPrograms(),
          getMyClinic(),
        ]);
        setPrograms(programsRes);
        setHasClinic(!!clinicRes?.clinic);
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
          <button className="btn-secondary" onClick={() => navigate('/programs')}>
            🗓️ Programs
          </button>
          <button className="btn-secondary" onClick={() => navigate('/clinic')}>
            🏥 Clinic
          </button>
          <span className="user-badge doctor-badge">Doctor</span>
          <button className="btn-secondary" onClick={() => navigate('/privacy')}>
            🔒 Privacy
          </button>
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

      <div className="dash-tabs">
        <button className={`dash-tab ${tab === 'patients' ? 'active' : ''}`} onClick={() => setTab('patients')}>
          👥 Patients {unread.total > 0 && <span className="unread-dot">{unread.total}</span>}
        </button>
        <button className={`dash-tab ${tab === 'adherence' ? 'active' : ''}`} onClick={() => setTab('adherence')}>
          🚦 Adherence
        </button>
      </div>

      {tab === 'adherence' && <AdherencePanel onOpenPatient={openPatientFromBoard} />}

      {playbackSessionId && (
        <SessionPlayback sessionId={playbackSessionId} onClose={() => setPlaybackSessionId(null)} />
      )}

      {tab === 'patients' && (
      <div className="dashboard-grid doctor-grid">
        {/* Patient Sidebar */}
        <section className="dashboard-card patient-sidebar">
          <div className="card-header">
            <h2>👥 Assigned Patients</h2>
            <span className="count-badge">{patients.length}</span>
          </div>

          {hasClinic && (
            <div className="scope-toggle">
              <button type="button" className={`day-chip ${scope === 'mine' ? 'day-chip-on' : ''}`} onClick={() => handleScopeChange('mine')}>
                My patients
              </button>
              <button type="button" className={`day-chip ${scope === 'clinic' ? 'day-chip-on' : ''}`} onClick={() => handleScopeChange('clinic')}>
                Whole clinic
              </button>
            </div>
          )}

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
                    <span className="patient-email">
                      {p.email}{scope === 'clinic' && p.doctorName ? ` · Dr. ${p.doctorName}` : ''}
                    </span>
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

              {/* Assign Program Card */}
              <section className="dashboard-card">
                <div className="card-header">
                  <h2>🗓️ Weekly Program</h2>
                  <button className="btn-secondary" onClick={handleDownloadReport} disabled={reportBusy}>
                    {reportBusy ? 'Generating…' : '📄 Download PDF Report'}
                  </button>
                </div>

                {patientPrograms.filter((p) => p.status === 'active').map((pp) => (
                  <div key={pp.id} className="program-card">
                    <div className="program-card-head">
                      <strong>{pp.programName}</strong>
                      <span className="program-tag">Active</span>
                    </div>
                    <ul className="program-item-list">
                      {pp.items.map((it, i) => (
                        <li key={i}>
                          {it.exerciseName} — now {it.targetSets}×{it.targetReps} · good-session streak {it.goodStreak || 0}/{pp.progression?.goodSessionsRequired ?? 3}
                        </li>
                      ))}
                    </ul>
                    {pp.log && pp.log.length > 0 && (
                      <p className="assignment-meta">
                        Last increase: {pp.log[pp.log.length - 1].exerciseName} → {pp.log[pp.log.length - 1].to.sets}×{pp.log[pp.log.length - 1].to.reps}
                      </p>
                    )}
                  </div>
                ))}

                <form onSubmit={handleAssignProgram} className="prescribe-form">
                  <div className="form-row">
                    <div className="form-group flex-2">
                      <select value={programToAssign} onChange={(e) => setProgramToAssign(e.target.value)} required>
                        <option value="">-- Choose Program --</option>
                        {programs.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}{p.clinicId ? ' (clinic)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className="btn-assign-submit">Assign Program</button>
                  </div>
                  {programs.length === 0 && (
                    <span className="empty-hint">No programs yet — create one with the “Programs” button above.</span>
                  )}
                </form>
              </section>

              <PatientTrends patient={selectedPatient} />

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
                        <div key={s.sessionId} className="history-entry">
                          <div className="history-item">
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
                          <div className="history-actions">
                            <button className="btn-link" onClick={() => setPlaybackSessionId(s.sessionId)}>▶ Playback</button>
                            <button className="btn-link" onClick={() => setOpenCommentsId(openCommentsId === s.sessionId ? null : s.sessionId)}>
                              💬 Messages
                              {unread.bySession[s.sessionId] > 0 && <span className="unread-dot">{unread.bySession[s.sessionId]}</span>}
                            </button>
                          </div>
                          {openCommentsId === s.sessionId && (
                            <SessionComments sessionId={s.sessionId} myRole="doctor" onRead={refreshUnread} />
                          )}
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
      )}
    </div>
  );
}

