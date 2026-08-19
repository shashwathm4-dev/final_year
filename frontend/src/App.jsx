/**
 * App — Root component with simple state-based routing.
 * Views: ExerciseSelector → ExerciseSession (→ SessionSummary)
 */
import { useState } from 'react';
import ExerciseSelector from './components/ExerciseSelector';
import ExerciseSession from './components/ExerciseSession';
import './App.css';

export default function App() {
  const [selectedExercise, setSelectedExercise] = useState(null);

  return (
    <div className="app">
      {!selectedExercise ? (
        <ExerciseSelector onSelect={setSelectedExercise} />
      ) : (
        <ExerciseSession
          exerciseConfig={selectedExercise}
          onBack={() => setSelectedExercise(null)}
        />
      )}
    </div>
  );
}
