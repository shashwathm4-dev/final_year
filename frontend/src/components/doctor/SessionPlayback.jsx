import React, { useEffect, useRef, useState } from 'react';
import { getSession, getRepPlayback } from '../../services/api';
import { drawSkeleton } from '../../utils/canvasDrawing';
import { unpackLandmarks, referenceCurve } from '../../utils/playbackUtils';
import TrendChart from '../charts/TrendChart';

const CP = ['Start (0%)', 'Early (25%)', 'Peak (50%)', 'Late (75%)', 'End (100%)'];

export default function SessionPlayback({ sessionId, onClose }) {
  const [reps, setReps] = useState([]);
  const [repNumber, setRepNumber] = useState(null);
  const [pb, setPb] = useState(null);
  const [error, setError] = useState('');
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const canvasRef = useRef(null);

  // Load rep list
  useEffect(() => {
    getSession(sessionId).then((s) => {
      const list = (s?.reps || []).filter((r) => r.hasPlayback);
      setReps(list);
      if (list.length) setRepNumber(list[0].repNumber);
      else setError('No playback was recorded for this session.');
    });
  }, [sessionId]);

  // Load selected rep
  useEffect(() => {
    if (repNumber == null) return;
    setPb(null); setIdx(0); setPlaying(false); setError('');
    getRepPlayback(sessionId, repNumber).then(setPb).catch(() => setError('Playback not available for this rep.'));
  }, [sessionId, repNumber]);

  // Playback clock (reads idx only at start)
  useEffect(() => {
    if (!playing || !pb) return undefined;
    const frames = pb.frames;
    const total = frames[frames.length - 1].t;
    const wall0 = performance.now();
    const t0 = frames[idx]?.t ?? 0;
    let raf;
    const loop = (now) => {
      const t = t0 + (now - wall0) * speed;
      if (t >= total) { setIdx(frames.length - 1); setPlaying(false); return; }
      let i = 0;
      while (i < frames.length - 1 && frames[i + 1].t <= t) i++;
      setIdx(i);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, pb, speed]);

  // Draw current frame
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !pb) return;
    const ctx = c.getContext('2d');
    drawSkeleton(ctx, unpackLandmarks(pb.frames[idx].lm), c.width, c.height, { highlightJoints: pb.highlightJoints || [] });
  }, [pb, idx]);

  const togglePlay = () => {
    if (!pb) return;
    if (!playing && idx >= pb.frames.length - 1) setIdx(0);
    setPlaying((p) => !p);
  };

  const n = pb?.frames.length || 0;
  const ref = pb ? referenceCurve(pb.referenceCheckpoints, n) : null;
  const failed = new Set(pb?.failedCheckpoints || []);

  return (
    <div className="session-summary-overlay" onClick={onClose}>
      <div className="session-summary playback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="summary-header">
          <h2>Session Playback</h2>
          <p className="exercise-name">Skeleton replay — no camera video is stored</p>
        </div>

        {reps.length > 0 && (
          <div className="playback-reps">
            {reps.map((r) => (
              <button
                key={r.repNumber}
                className={`playback-rep-btn ${r.repNumber === repNumber ? 'active' : ''} ${r.correct === false ? 'bad' : r.correct === true ? 'good' : ''}`}
                onClick={() => setRepNumber(r.repNumber)}
              >
                #{r.repNumber}
              </button>
            ))}
          </div>
        )}

        {error && <div className="empty-hint">{error}</div>}

        {pb && (
          <>
            <canvas ref={canvasRef} width={640} height={480} className="playback-canvas" />

            <div className="playback-controls">
              <button className="btn btn-primary" onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
              <input
                type="range" min={0} max={n - 1} value={idx}
                onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
                className="playback-slider"
              />
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
                <option value={0.5}>0.5×</option>
                <option value={1}>1×</option>
                <option value={2}>2×</option>
              </select>
            </div>

            <div className="playback-markers">
              {CP.map((label, i) => (
                <button
                  key={label}
                  className={`playback-marker ${pb.deltas ? (failed.has(i) ? 'marker-bad' : 'marker-ok') : ''}`}
                  onClick={() => { setPlaying(false); setIdx(Math.round((i / 4) * (n - 1))); }}
                  title="Jump to checkpoint"
                >
                  {label}{pb.deltas ? (failed.has(i) ? ` ✗ ${Math.round(pb.deltas[i])}° off` : ' ✓') : ''}
                </button>
              ))}
            </div>

            <TrendChart
              unit="°"
              height={150}
              labels={pb.frames.map((f) => `${(f.t / 1000).toFixed(1)}s`)}
              series={[
                { name: 'Patient', color: '#2dd4bf', values: pb.frames.map((f) => f.a) },
                ...(ref ? [{ name: 'Reference', color: '#fbbf24', values: ref }] : []),
              ]}
            />
            <div className="trend-legend">
              <span style={{ color: '#2dd4bf' }}>● Patient angle</span>
              {ref && <span style={{ color: '#fbbf24' }}>● Reference profile</span>}
              <span>Now: {Math.round(pb.frames[idx].a)}°</span>
            </div>
          </>
        )}

        <div className="summary-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
