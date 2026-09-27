import { useState, useEffect } from 'react';
import staticExercises from '../config/exercises.json';
import { getExercises } from '../services/api';

export default function ExerciseSelector({ onSelect }) {
  const [exerciseList, setExerciseList] = useState(Object.values(staticExercises));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadExercises() {
      try {
        const fetched = await getExercises();
        if (fetched && fetched.length > 0) {
          setExerciseList(fetched);
        }
      } catch (err) {
        console.warn('Using default exercises:', err);
      } finally {
        setLoading(false);
      }
    }
    loadExercises();
  }, []);

  return (
    <div className="exercise-selector">
      <div className="selector-header">
        <h1>AI Physiotherapy Assistant</h1>
        <p className="subtitle">Select an exercise to begin your session</p>
      </div>


      <div className="exercise-grid">
        {exerciseList.map((ex) => (
          <button
            key={ex.id}
            className="exercise-card"
            onClick={() => onSelect(ex)}
            id={`exercise-card-${ex.id}`}
          >
            <div className="card-icon">{ex.icon}</div>
            <h2 className="card-title">{ex.displayName}</h2>
            <p className="card-description">{ex.description}</p>
            <div className="card-meta">
              <span className="meta-badge">
                Target: {ex.target_angle_range[0]}°–{ex.target_angle_range[1]}°
              </span>
              {ex.note && ex.note.includes('low') && (
                <span className="meta-badge meta-warning">Lower confidence</span>
              )}
            </div>
            <div className="card-arrow">→</div>
          </button>
        ))}
      </div>
    </div>
  );
}
