/**
 * ExerciseSession — Main session orchestrator.
 * Composes PoseCamera + angle computation + rep detection + checkpoint comparison.
 * Handles the full flow: detection → angle → rep → compare → verify → log → feedback.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import PoseCamera from './PoseCamera';
import FeedbackToast from './FeedbackToast';
import SessionSummary from './SessionSummary';
import usePoseLandmarker from '../hooks/usePoseLandmarker';
import useAngleComputation from '../hooks/useAngleComputation';
import useRepDetection from '../hooks/useRepDetection';
import { computeCheckpoints, compareToReference, describeMismatch } from '../utils/checkpointComparison';
import { startSession, logRep, verifyRep } from '../services/api';

export default function ExerciseSession({ exerciseConfig, onBack }) {
  const { detectForVideo, isLoading, error, isReady } = usePoseLandmarker();
  const { computeAngle } = useAngleComputation(exerciseConfig);

  const [sessionId, setSessionId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [repHistory, setRepHistory] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);

  const currentAngleRef = useRef(0);

  // Initialize session
  useEffect(() => {
    async function initSession() {
      const { sessionId: sid } = await startSession(exerciseConfig.id);
      setSessionId(sid);
    }
    initSession();
  }, [exerciseConfig.id]);

  // Rep completion handler
  const handleRepComplete = useCallback(
    async (repData) => {
      const { frames, peakFrame, repNumber } = repData;

      // Step 1: Compute 5 checkpoints
      const patientCheckpoints = computeCheckpoints(frames);
      const referenceCheckpoints = exerciseConfig.referenceCheckpoints;
      const thresholds = exerciseConfig.checkpoint_thresholds;

      let verdictSource = 'local';
      let correct = true;
      let issue = null;
      let severity = 'low';

      if (patientCheckpoints) {
        const comparison = compareToReference(patientCheckpoints, referenceCheckpoints, thresholds);

        if (!comparison.passed) {
          // Local mismatch — skip VLM, show immediate warning
          verdictSource = 'local';
          correct = false;
          issue = describeMismatch(comparison.failedCheckpoints, comparison.deltas);
          severity = comparison.maxDelta > 30 ? 'high' : 'medium';
        } else {
          // Checkpoints passed — send to VLM for verification
          verdictSource = 'vlm';
          setIsVerifying(true);

          try {
            // Capture the peak frame for VLM
            const patientFrame = peakFrame?.frameDataUrl || peakFrame?.captureFrame?.();

            if (patientFrame) {
              const vlmResult = await verifyRep({
                patientFrame,
                referenceFrame: null, // Will use stored reference on backend
                exerciseId: exerciseConfig.id,
              });

              correct = vlmResult.correct ?? true;
              issue = vlmResult.issue || null;
              severity = vlmResult.severity || 'low';
            }
          } catch (err) {
            console.warn('VLM verification failed:', err);
            // Fallback — assume correct since checkpoints passed
            correct = true;
            issue = null;
          } finally {
            setIsVerifying(false);
          }
        }
      }

      // Show feedback
      const feedbackData = { correct, issue, severity, verdictSource, repNumber };
      setFeedback(feedbackData);

      // Add to history
      const historyEntry = {
        repNumber,
        timestamp: Date.now(),
        peakAngle: repData.peakAngle,
        verdictSource,
        correct,
        issue,
        severity,
      };
      setRepHistory(prev => [...prev, historyEntry]);

      // Log to backend
      await logRep({
        sessionId,
        exerciseId: exerciseConfig.id,
        repNumber,
        timestamp: Date.now(),
        angles: patientCheckpoints,
        verdictSource,
        correct,
        issue,
      });
    },
    [exerciseConfig, sessionId]
  );

  const { state: repState, repCount, currentAngle, addFrame, reset: resetReps } = useRepDetection(
    exerciseConfig,
    handleRepComplete
  );

  // Process each frame from PoseCamera
  const handleFrame = useCallback(
    ({ landmarks, timestamp, captureFrame }) => {
      if (!isActive) return;

      const { angle, confidence: conf } = computeAngle(landmarks);
      currentAngleRef.current = angle;
      setConfidence(conf);

      // Capture frame data URL lazily (only when needed by rep detection)
      addFrame({
        timestamp,
        angle,
        confidence: conf,
        landmarks,
        captureFrame,
        frameDataUrl: null, // Will be captured at key moments
      });
    },
    [isActive, computeAngle, addFrame]
  );

  const handleStart = () => {
    resetReps();
    setRepHistory([]);
    setFeedback(null);
    setShowSummary(false);
    setIsActive(true);
  };

  const handleStop = () => {
    setIsActive(false);
    setShowSummary(true);
  };

  const stateColors = {
    IDLE: '#6b7280',
    ASCENDING: '#06d6a0',
    PEAK: '#ffd166',
    DESCENDING: '#118ab2',
  };

  return (
    <div className="exercise-session">
      {/* Header */}
      <div className="session-header">
        <button className="btn btn-ghost" onClick={onBack} id="btn-back-to-exercises">
          ← Back
        </button>
        <div className="header-title">
          <span className="exercise-icon">{exerciseConfig.icon}</span>
          <h1>{exerciseConfig.displayName}</h1>
        </div>
        <div className="header-actions">
          {!isActive ? (
            <button
              className="btn btn-primary btn-glow"
              onClick={handleStart}
              disabled={!isReady}
              id="btn-start-session"
            >
              {isReady ? 'Start Session' : 'Loading...'}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={handleStop} id="btn-stop-session">
              End Session
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="session-content">
        {/* Camera + skeleton */}
        <div className="camera-container">
          <PoseCamera
            detectForVideo={detectForVideo}
            isReady={isReady}
            onFrame={handleFrame}
            exerciseConfig={exerciseConfig}
            currentAngle={currentAngle}
            isActive={isActive || !isActive} // Always run camera, even when paused
          />

          {/* Live HUD overlay */}
          {isActive && (
            <div className="hud-overlay">
              {/* Angle gauge */}
              <div className="angle-gauge">
                <div className="gauge-value">{Math.round(currentAngle)}°</div>
                <div className="gauge-label">Joint Angle</div>
                <div className="gauge-bar">
                  <div
                    className="gauge-fill"
                    style={{
                      width: `${Math.min(100, (currentAngle / (exerciseConfig.target_angle_range[1] + 20)) * 100)}%`,
                      backgroundColor:
                        currentAngle >= exerciseConfig.target_angle_range[0] &&
                        currentAngle <= exerciseConfig.target_angle_range[1]
                          ? '#06d6a0'
                          : currentAngle > exerciseConfig.target_angle_range[1]
                          ? '#ffd166'
                          : '#6b7280',
                    }}
                  />
                  {/* Target range markers */}
                  <div
                    className="gauge-target-start"
                    style={{
                      left: `${(exerciseConfig.target_angle_range[0] / (exerciseConfig.target_angle_range[1] + 20)) * 100}%`,
                    }}
                  />
                  <div
                    className="gauge-target-end"
                    style={{
                      left: `${(exerciseConfig.target_angle_range[1] / (exerciseConfig.target_angle_range[1] + 20)) * 100}%`,
                    }}
                  />
                </div>
              </div>

              {/* Rep counter */}
              <div className="rep-counter">
                <div className="rep-value">{repCount}</div>
                <div className="rep-label">Reps</div>
              </div>

              {/* State indicator */}
              <div className="state-indicator" style={{ color: stateColors[repState] }}>
                <div className="state-dot" style={{ backgroundColor: stateColors[repState] }} />
                <span>{repState}</span>
              </div>

              {/* Confidence */}
              <div className={`confidence-indicator ${confidence < 0.5 ? 'low-confidence' : ''}`}>
                <span>Tracking: {Math.round(confidence * 100)}%</span>
              </div>

              {/* VLM processing indicator */}
              {isVerifying && (
                <div className="verifying-indicator">
                  <div className="loading-spinner small" />
                  <span>AI analyzing form...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar with rep history */}
        {isActive && repHistory.length > 0 && (
          <div className="rep-history-panel">
            <h3>Rep History</h3>
            <div className="rep-list">
              {repHistory.map((rep, i) => (
                <div
                  key={i}
                  className={`rep-item ${rep.correct ? 'rep-correct' : 'rep-incorrect'}`}
                >
                  <span className="rep-number">#{rep.repNumber}</span>
                  <span className="rep-angle">{Math.round(rep.peakAngle)}°</span>
                  <span className={`rep-verdict ${rep.correct ? 'verdict-pass' : 'verdict-fail'}`}>
                    {rep.correct ? '✓' : '✗'}
                  </span>
                  <span className="rep-source">
                    {rep.verdictSource === 'vlm' ? '🤖' : '📐'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Feedback toast */}
      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Session summary */}
      {showSummary && (
        <SessionSummary
          repHistory={repHistory}
          exerciseConfig={exerciseConfig}
          onClose={onBack}
          onRestart={handleStart}
        />
      )}

      {/* Model loading / error states */}
      {isLoading && (
        <div className="model-status">
          <div className="loading-spinner" />
          <p>Downloading pose detection model...</p>
          <p className="model-status-sub">This may take a moment on first load</p>
        </div>
      )}
      {error && (
        <div className="model-status model-error">
          <p>⚠ {error}</p>
          <p className="model-status-sub">Please ensure your browser supports WebGL/GPU acceleration</p>
        </div>
      )}
    </div>
  );
}
