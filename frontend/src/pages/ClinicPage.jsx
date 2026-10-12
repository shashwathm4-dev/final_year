/**
 * ClinicPage — Doctor page for clinic accounts: create/join, members, invite code, clinic-wide patient list.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getMyClinic,
  createClinic,
  joinClinic,
  leaveClinic,
  regenerateInviteCode,
  removeClinicMember,
  reassignPatient,
  getClinicPatients,
  downloadProgressReport,
} from '../services/api';

export default function ClinicPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ clinic: null });
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const load = useCallback(async () => {
    const res = await getMyClinic();
    setData(res);
    if (res.clinic) {
      try {
        setPatients(await getClinicPatients());
      } catch {
        setPatients([]);
      }
    } else {
      setPatients([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn, okMsg) => {
    setStatusMsg('');
    try {
      await fn();
      if (okMsg) setStatusMsg(`✓ ${okMsg}`);
      await load();
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Something went wrong'}`);
    }
  };

  const handleReport = async (patientId) => {
    try {
      await downloadProgressReport(patientId, 30);
    } catch {
      setStatusMsg('✗ Could not generate the report');
    }
  };

  const { clinic, members = [], isAdmin } = data;

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">🏥</span>
          <div>
            <h1>{clinic ? clinic.name : 'Clinic'}</h1>
            <p className="dashboard-subtitle">
              {clinic ? (isAdmin ? 'You are the clinic admin' : 'Clinic member') : 'Multi-doctor clinic accounts'}
            </p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="btn-secondary" onClick={() => navigate('/doctor')}>← Back to Dashboard</button>
        </div>
      </header>

      {statusMsg && (
        <div className={`dashboard-alert ${statusMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
          {statusMsg}
        </div>
      )}

      {loading ? (
        <div className="card-loading">Loading clinic...</div>
      ) : !clinic ? (
        <div className="dashboard-grid doctor-grid">
          <section className="dashboard-card">
            <div className="card-header"><h2>➕ Create a clinic</h2></div>
            <form
              className="prescribe-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => createClinic(clinicName.trim()), 'Clinic created');
              }}
            >
              <input type="text" placeholder="Clinic name" value={clinicName} onChange={(e) => setClinicName(e.target.value)} required />
              <button type="submit" className="btn-assign-submit">Create Clinic (I will be admin)</button>
            </form>
          </section>
          <section className="dashboard-card">
            <div className="card-header"><h2>🔑 Join with invite code</h2></div>
            <form
              className="prescribe-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => joinClinic(inviteCode), 'Joined clinic');
              }}
            >
              <input type="text" placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
              <button type="submit" className="btn-assign-submit">Join Clinic</button>
            </form>
          </section>
        </div>
      ) : (
        <div className="dashboard-grid doctor-grid">
          {/* Members */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>👩⚕️ Doctors</h2>
              <span className="count-badge">{members.length}</span>
            </div>

            {isAdmin && clinic.inviteCode && (
              <div className="invite-box">
                <span>Invite code</span>
                <strong>{clinic.inviteCode}</strong>
                <button className="btn-secondary" onClick={() => run(regenerateInviteCode, 'Invite code regenerated')}>
                  Regenerate
                </button>
              </div>
            )}

            <div className="patient-list">
              {members.map((m) => (
                <div key={m.uid} className="patient-item">
                  <div className="patient-avatar">🩺</div>
                  <div className="patient-meta">
                    <span className="patient-name">
                      {m.fullName || m.email} {m.isAdmin && <span className="program-tag">Admin</span>}
                    </span>
                    <span className="patient-email">{m.email} · {m.patientCount} patient(s)</span>
                  </div>
                  {isAdmin && !m.isAdmin && (
                    <button
                      className="btn-secondary"
                      onClick={() => run(() => removeClinicMember(m.uid), 'Doctor removed; patients moved to you')}
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button className="btn-secondary leave-btn" onClick={() => run(leaveClinic, 'You left the clinic')}>
              Leave clinic
            </button>
          </section>

          {/* Clinic-wide patients */}
          <section className="dashboard-card">
            <div className="card-header">
              <h2>👥 Clinic Patients</h2>
              <span className="count-badge">{patients.length}</span>
            </div>
            {patients.length === 0 ? (
              <div className="empty-state"><p>No patients in this clinic yet.</p></div>
            ) : (
              <div className="items-list">
                {patients.map((p) => (
                  <div key={p.uid} className="assignment-item">
                    <div className="assignment-info">
                      <h3>{p.fullName || p.email}</h3>
                      <p className="assignment-meta">Doctor: {p.doctorName}</p>
                    </div>
                    <div className="clinic-patient-actions">
                      <button className="btn-secondary" onClick={() => handleReport(p.uid)}>📄 Report</button>
                      {isAdmin && (
                        <select
                          className="reassign-select"
                          value={p.doctorId}
                          onChange={(e) => run(() => reassignPatient(p.uid, e.target.value), 'Patient reassigned')}
                        >
                          {members.map((m) => (
                            <option key={m.uid} value={m.uid}>{m.fullName || m.email}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
