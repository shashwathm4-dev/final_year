import React from 'react';
export default function CalibrationPanel({ phase, secondsLeft, liveAngle, onCancel }) {
  if (phase === 'idle') return null;
  const isRest = phase === 'rest';
  return (
    <div className="calibration-panel" role="dialog" aria-live="polite">
      <div className="calibration-step">Step {isRest ? '1' : '2'} of 2</div>
      <h3>{isRest ? 'Relax in the starting position' : 'Move as far as is comfortable, then hold'}</h3>
      <p>
        {isRest
          ? 'Stay still. We are measuring your resting position.'
          : 'Slowly move to the furthest position you can reach without pain and keep it there.'}
      </p>
      <div className="calibration-timer">{secondsLeft}s</div>
      <div className="calibration-angle">Angle: {Math.round(liveAngle)}°</div>
      <button className="btn btn-ghost" onClick={onCancel} id="btn-calibration-cancel">
        Cancel
      </button>
    </div>
  );
}
