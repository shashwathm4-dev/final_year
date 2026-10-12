/**
 * ProgramBuilder — Doctor page to create weekly exercise programs with progression rules.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExercises, getPrograms, createProgram, deleteProgram, getMyClinic } from '../services/api';
import defaultExercisesJson from '../config/exercises.json';

const staticExercises = Object.values(defaultExercisesJson);
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyItem = (exerciseId = '') => ({
  exerciseId,
  targetSets: 3,
  targetReps: 10,
  daysOfWeek: [1, 3, 5],
  notes: '',
});

export default function ProgramBuilder() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState(staticExercises);
  const [programs, setPrograms] = useState([]);
  const [hasClinic, setHasClinic] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [shareWithClinic, setShareWithClinic] = useState(false);
  const [items, setItems] = useState([emptyItem()]);
  const [progression, setProgression] = useState({
    enabled: true,
    goodSessionsRequired: 3,
    accuracyThreshold: 80,
    repsIncrement: 2,
    setsIncrement: 0,
    maxReps: 20,
    maxSets: 5,
  });

  const load = async () => {
    const [ex, pr, clinicRes] = await Promise.all([
      getExercises().catch(() => []),
      getPrograms(),
      getMyClinic(),
    ]);
    if (ex && ex.length > 0) setExercises(ex);
    setPrograms(pr);
    setHasClinic(!!clinicRes?.clinic);
  };

  useEffect(() => {
    load();
  }, []);

  const updateItem = (idx, patch) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const toggleDay = (idx, day) => {
    const current = items[idx].daysOfWeek;
    updateItem(idx, {
      daysOfWeek: current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setStatusMsg('');
    const payloadItems = items
      .filter((it) => it.exerciseId)
      .map((it) => {
        const ex = exercises.find((x) => x.id === it.exerciseId);
        return {
          ...it,
          exerciseName: ex?.displayName || it.exerciseId,
          targetSets: Number(it.targetSets),
          targetReps: Number(it.targetReps),
        };
      });
    if (!name.trim() || payloadItems.length === 0) {
      setStatusMsg('✗ Enter a program name and choose at least one exercise');
      return;
    }
    try {
      await createProgram({ name, description, items: payloadItems, progression, shareWithClinic });
      setStatusMsg(`✓ Program "${name}" saved`);
      setName('');
      setDescription('');
      setItems([emptyItem()]);
      setShareWithClinic(false);
      load();
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to save program'}`);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteProgram(id);
      load();
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to delete program'}`);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">🗓️</span>
          <div>
            <h1>Exercise Programs</h1>
            <p className="dashboard-subtitle">Weekly plans with automatic progression</p>
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

      <div className="dashboard-grid doctor-grid">
        {/* Saved programs */}
        <section className="dashboard-card">
          <div className="card-header">
            <h2>📚 Saved Programs</h2>
            <span className="count-badge">{programs.length}</span>
          </div>
          {programs.length === 0 ? (
            <div className="empty-state"><p>No programs yet.</p></div>
          ) : (
            <div className="items-list">
              {programs.map((p) => (
                <div key={p.id} className="program-card">
                  <div className="program-card-head">
                    <strong>{p.name}</strong>
                    {p.clinicId && <span className="program-tag">Clinic shared</span>}
                  </div>
                  {p.description && <p className="assignment-meta">{p.description}</p>}
                  <ul className="program-item-list">
                    {p.items.map((it, i) => (
                      <li key={i}>
                        {it.exerciseName} — {it.targetSets}×{it.targetReps} (
                        {it.daysOfWeek.length ? it.daysOfWeek.map((d) => DAY_LABELS[d]).join(', ') : 'any day'})
                      </li>
                    ))}
                  </ul>
                  {p.progression?.enabled && (
                    <p className="assignment-meta">
                      ⬆ After {p.progression.goodSessionsRequired} good sessions (≥{p.progression.accuracyThreshold}% accuracy):
                      +{p.progression.repsIncrement} reps, +{p.progression.setsIncrement} sets
                    </p>
                  )}
                  {p.doctorName && <p className="assignment-meta">By Dr. {p.doctorName}</p>}
                  <button className="btn-secondary" onClick={() => handleDelete(p.id)}>Delete</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Builder form */}
        <section className="dashboard-card">
          <div className="card-header"><h2>➕ New Program</h2></div>
          <form onSubmit={handleSave} className="prescribe-form">
            <div className="form-group">
              <label>Program name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shoulder rehab — weeks 1–4" required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>

            <label className="program-label">Exercises in the weekly plan</label>
            {items.map((it, idx) => (
              <div key={idx} className="program-item-row">
                <div className="form-row">
                  <div className="form-group flex-2">
                    <select value={it.exerciseId} onChange={(e) => updateItem(idx, { exerciseId: e.target.value })} required>
                      <option value="">-- Choose Exercise --</option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>{ex.displayName}{ex.isCustom ? ' ★' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <input type="number" min="1" max="20" value={it.targetSets} onChange={(e) => updateItem(idx, { targetSets: e.target.value })} title="Sets" />
                  </div>
                  <div className="form-group">
                    <input type="number" min="1" max="100" value={it.targetReps} onChange={(e) => updateItem(idx, { targetReps: e.target.value })} title="Reps per set" />
                  </div>
                </div>
                <div className="day-chips">
                  {DAY_LABELS.map((label, d) => (
                    <button
                      type="button"
                      key={d}
                      className={`day-chip ${it.daysOfWeek.includes(d) ? 'day-chip-on' : ''}`}
                      onClick={() => toggleDay(idx, d)}
                    >
                      {label}
                    </button>
                  ))}
                  {items.length > 1 && (
                    <button type="button" className="day-chip day-chip-remove" onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                      Remove
                    </button>
                  )}
                </div>
                <input type="text" value={it.notes} onChange={(e) => updateItem(idx, { notes: e.target.value })} placeholder="Form notes for this exercise (optional)" />
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setItems([...items, emptyItem()])}>
              + Add another exercise
            </button>

            <label className="program-label">Progression rule</label>
            <label className="program-check">
              <input type="checkbox" checked={progression.enabled} onChange={(e) => setProgression({ ...progression, enabled: e.target.checked })} />
              Automatically raise targets when the patient does well
            </label>
            {progression.enabled && (
              <div className="progression-grid">
                <div className="form-group">
                  <label>Good sessions in a row</label>
                  <input type="number" min="1" max="10" value={progression.goodSessionsRequired} onChange={(e) => setProgression({ ...progression, goodSessionsRequired: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Min accuracy %</label>
                  <input type="number" min="1" max="100" value={progression.accuracyThreshold} onChange={(e) => setProgression({ ...progression, accuracyThreshold: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>+ Reps</label>
                  <input type="number" min="0" max="20" value={progression.repsIncrement} onChange={(e) => setProgression({ ...progression, repsIncrement: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>+ Sets</label>
                  <input type="number" min="0" max="5" value={progression.setsIncrement} onChange={(e) => setProgression({ ...progression, setsIncrement: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Max reps</label>
                  <input type="number" min="1" max="100" value={progression.maxReps} onChange={(e) => setProgression({ ...progression, maxReps: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Max sets</label>
                  <input type="number" min="1" max="20" value={progression.maxSets} onChange={(e) => setProgression({ ...progression, maxSets: e.target.value })} />
                </div>
              </div>
            )}

            {hasClinic && (
              <label className="program-check">
                <input type="checkbox" checked={shareWithClinic} onChange={(e) => setShareWithClinic(e.target.checked)} />
                Share this program with my clinic
              </label>
            )}

            <button type="submit" className="btn-assign-submit">Save Program</button>
          </form>
        </section>
      </div>
    </div>
  );
}
