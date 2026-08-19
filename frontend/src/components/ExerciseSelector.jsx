/**
 * ExerciseSelector — Card grid for choosing an exercise.
 */
import exercises from '../config/exercises.json';

export default function ExerciseSelector({ onSelect }) {
  const exerciseList = Object.values(exercises);

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
