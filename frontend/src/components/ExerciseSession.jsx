/**
 * ExerciseSession — Main session orchestrator.
 * PoseCamera (smoothed landmarks, real frame size, 3D) -> framing gate -> calibration
 * -> angle -> rep/hold detection -> checkpoints -> AI check -> compensation -> voice.
 */
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PoseCamera from './PoseCamera';
import FeedbackToast from './FeedbackToast';
import SessionSummary from './SessionSummary';
import FramingOverlay from './FramingOverlay';
import CalibrationPanel from './CalibrationPanel';
import { useAuth } from '../context/AuthContext';
import usePoseLandmarker from '../hooks/usePoseLandmarker';
import useAngleComputation from '../hooks/useAngleComputation';
import useRepDetection from '../hooks/useRepDetection';
import useHoldDetection from '../hooks/useHoldDetection';
import useVoiceCoach from '../hooks/useVoiceCoach';
import useFramingGate from '../hooks/useFramingGate';
import useCalibration from '../hooks/useCalibration';
import { useCoachAgent } from '../hooks/useCoachAgent';
import { ChatCoachPanel } from './ChatCoachPanel';
import { computeCheckpoints, compareToReference, describeMismatch } from '../utils/checkpointComparison';

import { computeRepQuality, computeHoldQuality, resampleCurve } from '../utils/repQuality';
import { computeFatigue } from '../utils/fatigueDetection';
import { useAdaptiveConfig } from '../hooks/useAdaptiveConfig';
import { useRepClassifier } from '../hooks/useRepClassifier';
import { featuresFromRep, predictProb } from '../utils/repClassifier';
import ConnectionBadge from './ConnectionBadge';
import { applySide } from '../utils/sideUtils';
import { loadCalibration, saveCalibration, clearCalibration, calibrateConfig } from '../utils/calibration';
import {
  measurePosture,
  averagePosture,
  flagCompensations,
  summarizeCompensations,
  COMPENSATION_LABELS,
  COMPENSATION_CUES,
} from '../utils/compensation';
import { startSession, logRep, endSession, verifyRep, getExercise, logRepPlayback } from '../services/api';
import { buildPlaybackPayload } from '../utils/playbackUtils';
import defaultExercises from '../config/exercises.json';
import { auth } from '../config/firebase';
import { isCloudAiAllowed } from '../utils/consent';

const fallbackDefault = Object.values(defaultExercises)[0];

// Must match backend VLM_COOLDOWN_MS (default 8000)
const VLM_MIN_GAP_MS = 8000;

const STATE_COLORS = {
  IDLE: '#6b7280',
  ASCENDING: '#06d6a0',
  PEAK: '#ffd166',
  DESCENDING: '#118ab2',
  WAITING: '#6b7280',
  HOLDING: '#06d6a0',
  PAUSED: '#ffd166',
};

function defaultSideFor(cfg) {
  if (!cfg || !cfg.supportsSide) return null;
  return cfg.angleFunction === 'vsVertical' ? 'auto' : cfg.baseSide || 'left';
}

export default function ExerciseSession({ exerciseConfig: propConfig, onBack: propOnBack }) {
  const { exerciseId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const uid = user ? user.uid : null;

  const [customExercise, setCustomExercise] = useState(null);

  // Fetch custom exercise if not built-in
  useEffect(() => {
    if (propConfig) return;
    if (exerciseId && defaultExercises[exerciseId]) return;
    if (!exerciseId) return;

    getExercise(exerciseId)
      .then((data) => {
        if (data && data.id) setCustomExercise(data);
      })
      .catch((err) => {
        console.warn('Could not load custom exercise from API:', err.message);
      });
  }, [exerciseId, propConfig]);

  const baseExerciseConfig = useMemo(() => {
    if (propConfig) return propConfig;
    if (exerciseId && defaultExercises[exerciseId]) return defaultExercises[exerciseId];
    if (customExercise) return customExercise;
    return fallbackDefault;
  }, [propConfig, exerciseId, customExercise]);

  const {
    config: adaptedBaseConfig,
    adaptive,
    enabled: adaptiveOn,
    setEnabled: setAdaptiveOn,
    ready: adaptiveReady,
    workingTargetPeak,
    thresholdScale,
  } = useAdaptiveConfig(baseExerciseConfig);

  // ---- Side selection (item 6) ----
  const [side, setSide] = useState(() => defaultSideFor(adaptedBaseConfig));
  useEffect(() => {
    setSide(defaultSideFor(adaptedBaseConfig));
  }, [adaptedBaseConfig]);
  const sidedConfig = useMemo(() => applySide(adaptedBaseConfig, side), [adaptedBaseConfig, side]);

  // ---- Calibration (item 11): stored per user / exercise / side ----
  const [calibration, setCalibration] = useState(null);
  const [calibError, setCalibError] = useState('');
  useEffect(() => {
    setCalibration(loadCalibration(uid, adaptedBaseConfig.id, sidedConfig.side));
    setCalibError('');
  }, [uid, adaptedBaseConfig.id, sidedConfig.side]);

  const exerciseConfig = useMemo(() => calibrateConfig(sidedConfig, calibration), [sidedConfig, calibration]);
  const isHold = exerciseConfig.mode === 'hold';

  const { model: repModel } = useRepClassifier(exerciseConfig.id);

  const onBack = useCallback(() => {
    if (propOnBack) propOnBack();
    else navigate(-1);
  }, [propOnBack, navigate]);

  const { detectForVideo, isLoading, error, isReady } = usePoseLandmarker();
  const { computeAngle } = useAngleComputation(exerciseConfig);
  const { speak, enabled: voiceEnabled, supported: voiceSupported, toggle: toggleVoice } = useVoiceCoach();

  const [sessionId, setSessionId] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [repHistory, setRepHistory] = useState([]);
  const [showSummary, setShowSummary] = useState(false);
  const [confidence, setConfidence] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [progressionResult, setProgressionResult] = useState(null);
  const [liveFlags, setLiveFlags] = useState([]);
  const [skipGate, setSkipGate] = useState(false);
  const [coachPanelOpen, setCoachPanelOpen] = useState(true);

  const coachAgent = useCoachAgent({
    exerciseConfig,
    sessionId,
    isActive,
    isOnline: navigator.onLine,
    onSpeak: (phrase) => speak(phrase, { key: 'coach-agent-speak', interrupt: true, cooldownMs: 1500 }),
  });

  const currentAngleRef = useRef(0);
  const sessionStartRef = useRef(Date.now());

  const pendingRepsRef = useRef(new Set());
  const repHistoryRef = useRef([]);
  const fatigueWarnedRef = useRef(false);
  const lastVlmAtRef = useRef(0);
  const postureBufferRef = useRef([]);   // rolling posture samples while NOT active (item 9)
  const baselineRef = useRef(null);      // averaged baseline posture captured at Start
  const liveFlagsKeyRef = useRef('');
  const trackingLostRef = useRef(false);

  const fatigue = useMemo(() => computeFatigue(repHistory), [repHistory]);

  useEffect(() => {
    if (fatigue.level === 'high' && !fatigueWarnedRef.current) {
      fatigueWarnedRef.current = true;
      setFeedback({
        correct: null,
        issue: 'You look fatigued — consider resting before the next set.',
        severity: 'medium',
        verdictSource: 'local',
        source: 'local',
        repNumber: repHistory.length,
      });
    }
  }, [fatigue.level, repHistory.length]);

  // ---- Framing gate (item 10) ----
  const { status: gateStatus, evaluate: evaluateGate } = useFramingGate(exerciseConfig);
  const gateReady = gateStatus.ready || skipGate;
  const trackingLost = isActive && !skipGate && !gateStatus.ready;
  trackingLostRef.current = trackingLost;

  // ---- Calibration capture (item 11) ----
  const {
    phase: calibPhase,
    secondsLeft: calibSecondsLeft,
    start: startCalib,
    cancel: cancelCalib,
    isRunning: calibIsRunning,
    addSample: calibAddSample,
  } = useCalibration({
    onComplete: ({ restAngle, maxAngle }) => {
      const cal = { restAngle, maxAngle, at: Date.now() };
      saveCalibration(uid, baseConfig.id, sidedConfig.side, cal);
      setCalibration(cal);
      setCalibError('');
      postureBufferRef.current = [];
      speak('Calibration complete.', { key: 'calib-done', interrupt: true, cooldownMs: 0 });
    },
    onError: (msg) => setCalibError(msg),
  });

  // Initialize session
  useEffect(() => {
    async function initSession() {
      const { sessionId: sid } = await startSession(exerciseConfig.id);
      setSessionId(sid);
    }
    initSession();
  }, [exerciseConfig.id]);

  // Spoken coaching for a finished rep / hold (item 8)
  const coachAfterRep = useCallback(
    ({ correct, quality, peakAngle, repNumber, compensations, isHoldRep }) => {
      if (compensations.length > 0) {
        speak(COMPENSATION_CUES[compensations[0]], { key: 'rep-comp', cooldownMs: 2000, interrupt: true });
        return;
      }
      if (correct === false) {
        const [tMin, tMax] = exerciseConfig.target_angle_range || [0, 180];
        let cue = 'Check your form';
        if (isHoldRep) cue = 'Try to keep the position steadier';
        else if (peakAngle < tMin) cue = 'Go a little higher';
        else if (peakAngle > tMax + 15) cue = 'Not so high';
        else if (quality.limitingFactor === 'Movement Smoothness') cue = 'Move more smoothly';
        else if (quality.limitingFactor === 'Movement Tempo / Pacing') cue = 'Slow down and keep a steady pace';
        speak(cue, { key: 'rep-fix', cooldownMs: 2000, interrupt: true });
        return;
      }
      if (correct === true) {
        speak(isHoldRep ? 'Hold complete. Well done.' : `Rep ${repNumber}, good.`, {
          key: 'rep-ok',
          cooldownMs: 1500,
          interrupt: true,
        });
      }
    },
    [speak, exerciseConfig.target_angle_range]
  );

  // Rep / hold completion handler
  const handleRepComplete = useCallback(
    async (repData) => {
      const { frames, peakFrame, repNumber } = repData;
      const isHoldRep = repData.mode === 'hold';

      let verdictSource = 'checkpoint_only';
      let correct = true;
      let issue = null;
      let severity = 'low';
      let skipReason = null;
      let patientCheckpoints = null;
      let modelProb = null;
      let quality;

      if (isHoldRep) {
        quality = computeHoldQuality(frames, exerciseConfig, repData);
      } else {
        quality = computeRepQuality(frames, exerciseConfig);
      }

      const curve = resampleCurve(frames, 16);
      let comparison = null;

      if (isHoldRep) {
        const maxBreaks = exerciseConfig.hold.maxBreaks ?? 3;
        verdictSource = 'hold_check';
        if (repData.breaks > maxBreaks) {
          correct = false;
          issue = `Position drifted out of range ${repData.breaks} times during the hold`;
          severity = repData.breaks > maxBreaks + 2 ? 'high' : 'medium';
        }
      } else {
        patientCheckpoints = computeCheckpoints(frames);

        if (patientCheckpoints) {
          comparison = compareToReference(
            patientCheckpoints,
            exerciseConfig.referenceCheckpoints,
            exerciseConfig.checkpoint_thresholds
          );

          if (!comparison.passed) {
            verdictSource = 'checkpoint_fail';
            correct = false;
            issue = describeMismatch(comparison.failedCheckpoints, comparison.deltas);
            severity = comparison.maxDelta > 30 ? 'high' : 'medium';
          } else {
            // Checkpoints passed -> check on-device model first
            const feats = repModel
              ? featuresFromRep(
                  { curve, peakAngle: repData.peakAngle, durationMs: repData.durationMs, quality },
                  exerciseConfig
                )
              : null;
            const p = feats ? predictProb(repModel, feats) : null;
            const AUDIT_RATE = 0.1;
            const acceptThresh = repModel?.thresholds?.accept ?? 0.85;
            const rejectThresh = repModel?.thresholds?.reject ?? 0.15;
            const confident = p != null && (p >= acceptThresh || p <= rejectThresh);
            const audit = Math.random() < AUDIT_RATE;

            if (typeof navigator !== 'undefined' && !navigator.onLine && (!confident || audit)) {
              verdictSource = 'offline';
              correct = true;
              issue = 'Offline — AI check skipped (local checkpoints passed)';
            } else if (confident && !audit) {
              verdictSource = 'model';
              correct = p >= acceptThresh;
              issue = correct ? null : 'Movement pattern differs from your good reps';
              severity = correct ? 'low' : 'medium';
              modelProb = p;
            } else if (!isCloudAiAllowed(auth?.currentUser?.uid)) {
              // Patient chose on-device checks only — no image leaves the device
              verdictSource = 'local';
              correct = true;
              issue = null;
              severity = 'low';
            } else {
              const sinceLast = Date.now() - lastVlmAtRef.current;
              if (sinceLast < VLM_MIN_GAP_MS) {
                verdictSource = 'checkpoint_only';
                skipReason = 'cooldown';
              } else {
                setIsVerifying(true);
                try {
                  const patientFrame = peakFrame?.frameDataUrl || null;
                  if (!patientFrame) {
                    verdictSource = 'checkpoint_only';
                    skipReason = 'no_frame';
                  } else {
                    lastVlmAtRef.current = Date.now();
                    const vlmResult = await verifyRep({
                      patientFrame,
                      referenceFrame: null,
                      exerciseId: exerciseConfig.id,
                      sessionId,
                    });

                    correct = vlmResult.correct;
                    issue = vlmResult.issue || null;
                    severity = vlmResult.severity || 'low';
                    if (vlmResult.source === 'vlm') verdictSource = 'vlm';
                    else if (vlmResult.source === 'error') verdictSource = 'error';
                    else {
                      verdictSource = 'skipped';
                      issue = 'AI check skipped (rate limit / unavailable) — local checkpoints passed';
                    }
                  }
                } catch (err) {
                  console.warn('VLM verification failed:', err);
                  verdictSource = 'error';
                  correct = null;
                  issue = 'AI verification unavailable — please try again';
                } finally {
                  setIsVerifying(false);
                }
              }
            }
          }
        } else {
          verdictSource = 'checkpoint_only';
          skipReason = 'no_frame';
        }
      }

      // Compensation check (item 9)
      const compensations = summarizeCompensations(frames);
      if (compensations.length > 0) {
        const labels = compensations.map((c) => COMPENSATION_LABELS[c]).join(', ');
        quality = {
          ...quality,
          qualityScore: Math.max(20, quality.qualityScore - 12 * compensations.length),
          limitingFactor: 'Compensation',
        };
        correct = false;
        issue = issue ? `${issue}. Also: ${labels}` : `Compensation detected: ${labels}`;
        if (severity === 'low') severity = 'medium';
      }

      // Feed alert engine in coachAgent
      coachAgent.ingestTelemetry({
        type: 'rep',
        rep: repNumber,
        repNumber,
        correct,
        issue,
        peakAngle: repData.peakAngle,
        compensations,
        quality,
        qualityScore: quality.qualityScore,
        romScore: quality.romScore,
        durationMs: repData.durationMs,
        isHoldRep,
      });

      // Suppress duplicate FeedbackToast when panel is open
      if (!coachPanelOpen) {
        setFeedback({
          correct,
          issue,
          severity,
          verdictSource,
          skipReason,
          source: verdictSource,
          repNumber,
          qualityScore: quality.qualityScore,
          limitingFactor: quality.limitingFactor,
          modelProb,
        });
      }

      const historyEntry = {
        repNumber,
        timestamp: Date.now(),
        peakAngle: repData.peakAngle,
        durationMs: repData.durationMs,
        curve,
        modelProb,
        verdictSource,
        skipReason,
        correct,
        issue,
        severity,
        mode: isHoldRep ? 'hold' : 'reps',
        holdSeconds: repData.holdSeconds ?? null,
        breaks: repData.breaks ?? null,
        compensations,
        ...quality,
      };

      setRepHistory((prev) => {
        const next = [...prev, historyEntry];
        repHistoryRef.current = next;
        return next;
      });

      coachAfterRep({ correct, quality, peakAngle: repData.peakAngle, repNumber, compensations, isHoldRep });


      // Log to backend (+ skeleton playback for the doctor)
      const playback = buildPlaybackPayload(frames, {
        referenceCheckpoints: exerciseConfig.referenceCheckpoints,
        deltas: comparison?.deltas,
        failedCheckpoints: comparison?.failedCheckpoints,
        highlightJoints: Object.values(exerciseConfig.landmarkIndices || {}),
      });

      await logRep({
        sessionId,
        exerciseId: exerciseConfig.id,
        repNumber,
        timestamp: Date.now(),
        angles: patientCheckpoints,
        verdictSource,
        skipReason,
        correct,
        issue,
        severity,
        side: exerciseConfig.side || null,
        mode: isHoldRep ? 'hold' : 'reps',
        holdSeconds: repData.holdSeconds ?? null,
        breaks: repData.breaks ?? null,
        compensations,
        calibrationScale: exerciseConfig.calibration ? exerciseConfig.calibration.scale : null,
        tempoScore: quality.tempoScore,
        smoothnessScore: quality.smoothnessScore,
        romScore: quality.romScore,
        qualityScore: quality.qualityScore,
        peakAngle: repData.peakAngle,
        durationMs: repData.durationMs || (frames.length > 1 ? Math.round(frames[frames.length - 1].timestamp - frames[0].timestamp) : null),
        curve,
        modelProb,
        checkpointDeltas: comparison?.deltas || null,
        failedCheckpoints: comparison?.failedCheckpoints || [],
        hasPlayback: !!playback,
      });
      if (playback) logRepPlayback(sessionId, repNumber, playback); // fire and forget
    },
    [exerciseConfig, sessionId, coachAfterRep, repModel]
  );

  const trackedRepComplete = useCallback((data) => {
    const p = handleRepComplete(data);
    pendingRepsRef.current.add(p);
    p.finally(() => pendingRepsRef.current.delete(p));
    return p;
  }, [handleRepComplete]);

  // Both detectors are always created (hooks must be unconditional); only one receives a config.
  const repDetector = useRepDetection(isHold ? null : exerciseConfig, trackedRepComplete);
  const holdDetector = useHoldDetection(isHold ? exerciseConfig : null, trackedRepComplete);
  const detector = isHold ? holdDetector : repDetector;
  const { state: repState, repCount, currentAngle, addFrame, reset: resetReps, abortCurrent } = detector;

  // Process each frame from PoseCamera
  const handleFrame = useCallback(
    ({ landmarks, worldLandmarks, frameSize, timestamp, captureFrame }) => {
      // 1) Framing gate sees every frame, including frames with no person (landmarks === null)
      evaluateGate(landmarks, timestamp, { active: isActive });
      if (!landmarks) return;

      // 2) Angle: real frame size, 3D when the exercise asks for it
      const { angle, confidence: conf } = computeAngle(landmarks, { size: frameSize, worldLandmarks });

      // 3) Calibration capture (no-op unless a calibration is running)
      calibAddSample(angle, conf);

      const posture = measurePosture(landmarks, frameSize);

      if (!isActive) {
        // Collect a baseline of the user standing ready (item 9)
        if (!calibIsRunning() && Object.keys(posture).length > 0) {
          const buf = postureBufferRef.current;
          buf.push(posture);
          if (buf.length > 45) buf.shift();
        }
        return;
      }

      // Tracking lost: don't feed the detectors
      if (trackingLostRef.current) return;

      currentAngleRef.current = angle;
      setConfidence(conf);

      const flags = flagCompensations(posture, baselineRef.current, exerciseConfig.compensationChecks);
      const key = flags.join(',');
      if (key !== liveFlagsKeyRef.current) {
        liveFlagsKeyRef.current = key;
        setLiveFlags(flags);
      }

      // Ingest live snapshot into coach agent (throttled internally to <=1/s)
      coachAgent.ingestTelemetry({
        type: 'snapshot',
        angle,
        state: repState,
        repCount,
        liveFlags: flags,
        trackingLost: false,
        fatigueLevel: fatigue.level,
      });

      addFrame({
        timestamp,
        angle,
        confidence: conf,
        landmarks,
        captureFrame,
        frameDataUrl: null,
        flags,
      });
    },
    [evaluateGate, isActive, computeAngle, calibAddSample, calibIsRunning, addFrame, exerciseConfig.compensationChecks, repState, repCount, fatigue.level, coachAgent]
  );

  // Tracking lost / restored (item 10)
  const wasLostRef = useRef(false);
  useEffect(() => {
    if (trackingLost && !wasLostRef.current) {
      wasLostRef.current = true;
      abortCurrent();
      coachAgent.ingestTelemetry({ type: 'tracking', trackingLost: true });
      speak("I can't see you. Step back into view.", { key: 'lost', cooldownMs: 6000, interrupt: true });
    } else if (!trackingLost && wasLostRef.current) {
      wasLostRef.current = false;
      coachAgent.ingestTelemetry({ type: 'tracking', trackingLost: false });
      speak('Tracking restored.', { key: 'restored', cooldownMs: 3000 });
    }
  }, [trackingLost, abortCurrent, speak, coachAgent]);


  // Calibration voice prompt for step 2
  useEffect(() => {
    if (calibPhase === 'max') {
      speak('Now slowly move as far as is comfortable, and hold.', { key: 'calib-max', interrupt: true, cooldownMs: 0 });
    }
  }, [calibPhase, speak]);

  // Live compensation voice cue (rate-limited by the voice hook)
  useEffect(() => {
    if (isActive && liveFlags.length > 0) {
      speak(COMPENSATION_CUES[liveFlags[0]], { key: `live-${liveFlags[0]}`, cooldownMs: 6000 });
    }
  }, [isActive, liveFlags, speak]);

  // Hold voice cues (item 8)
  const prevHoldStateRef = useRef('WAITING');
  useEffect(() => {
    if (!isHold || !isActive) return;
    const prev = prevHoldStateRef.current;
    if (repState !== prev) {
      if (repState === 'HOLDING' && prev === 'WAITING') speak('Hold that position', { key: 'hold-start', interrupt: true, cooldownMs: 1000 });
      if (repState === 'PAUSED') speak('Get back into position', { key: 'hold-paused', cooldownMs: 3000 });
      prevHoldStateRef.current = repState;
    }
  }, [repState, isHold, isActive, speak]);

  const heldTick = Math.floor((holdDetector.heldSeconds || 0) / 5);
  useEffect(() => {
    if (isHold && isActive && heldTick > 0) {
      speak(`${heldTick * 5} seconds`, { key: `hold-${heldTick}`, cooldownMs: 8000 });
    }
  }, [heldTick, isHold, isActive, speak]);

  const handleStartCalibration = () => {
    setCalibError('');
    postureBufferRef.current = [];
    startCalib();
    speak('Relax in your starting position and stay still.', { key: 'calib-start', interrupt: true, cooldownMs: 0 });
  };

  const handleResetCalibration = () => {
    clearCalibration(uid, adaptedBaseConfig.id, sidedConfig.side);
    setCalibration(null);
  };

  const handleStart = async () => {
    baselineRef.current = averagePosture(postureBufferRef.current);
    liveFlagsKeyRef.current = '';
    setLiveFlags([]);
    fatigueWarnedRef.current = false;
    resetReps();
    setRepHistory([]);
    repHistoryRef.current = [];
    setFeedback(null);
    setShowSummary(false);
    const { sessionId: sid } = await startSession(exerciseConfig.id, {
      startedAt: new Date().toISOString(),
      difficulty: { adaptive, thresholdScale, workingTargetPeak },
    });
    setSessionId(sid);
    sessionStartRef.current = Date.now();
    setIsActive(true);
    prevHoldStateRef.current = 'WAITING';
    speak('Session started. Get ready.', { key: 'session-start', interrupt: true, cooldownMs: 0 });
  };

  const handleStop = async () => {
    setIsActive(false);
    await Promise.allSettled([...pendingRepsRef.current]);
    setShowSummary(true);
    setProgressionResult(null);
    liveFlagsKeyRef.current = '';
    setLiveFlags([]);

    const total = repHistoryRef.current.length;
    const validReps = repHistoryRef.current.filter((r) => r.correct === true).length;
    const pct = total > 0 ? Math.round((validReps / total) * 100) : 0;
    speak(
      total > 0
        ? `Session finished. You completed ${total} ${isHold ? 'holds' : 'reps'}, ${pct} percent with good form.`
        : 'Session finished.',
      { key: 'session-end', interrupt: true, cooldownMs: 0 }
    );

    if (sessionId) {
      endSession({ sessionId, totalReps: total, correctReps: validReps })
        .then((res) => {
          if (res && res.progression) setProgressionResult(res.progression);
        })
        .catch((err) =>
          console.warn('Could not finalize session on backend:', err.message)
        );
    }
  };

  const sideOptions = useMemo(() => {
    if (!adaptedBaseConfig.supportsSide) return [];
    const opts = [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ];
    if (adaptedBaseConfig.angleFunction === 'vsVertical') opts.push({ value: 'auto', label: 'Auto (higher side)' });
    return opts;
  }, [adaptedBaseConfig]);

  const [rangeMin, rangeMax] = exerciseConfig.target_angle_range;
  const calibrating = calibPhase !== 'idle';
  const startDisabled = !isReady || calibrating || !gateReady || !adaptiveReady;

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
          <ConnectionBadge />
          {adaptive && !isActive && (
            <div className="adaptive-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(255,255,255,0.08)' }}>
              <span>🎯 Adaptive: goal {workingTargetPeak}°</span>
              <button
                className="btn btn-ghost"
                style={{ padding: '0.1rem 0.35rem', fontSize: '0.75rem' }}
                onClick={() => setAdaptiveOn(!adaptiveOn)}
                id="btn-toggle-adaptive"
              >
                {adaptiveOn ? 'Use standard targets' : 'Use adaptive goal'}
              </button>
            </div>
          )}
          {voiceSupported && (
            <button className="btn btn-ghost" onClick={toggleVoice} id="btn-voice-toggle">
              {voiceEnabled ? '🔊 Voice on' : '🔇 Voice off'}
            </button>
          )}

          {!isActive && sideOptions.length > 0 && (
            <div className="side-selector" role="group" aria-label="Side">
              {sideOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={`btn btn-ghost side-btn ${side === opt.value ? 'side-active' : ''}`}
                  onClick={() => setSide(opt.value)}
                  id={`btn-side-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {!isActive && !isHold && (
            <>
              <button
                className="btn btn-ghost"
                onClick={handleStartCalibration}
                disabled={!isReady || calibrating || !gateReady}
                id="btn-calibrate"
              >
                🎯 {calibration ? 'Recalibrate' : 'Calibrate range'}
              </button>
              {calibration && (
                <button className="btn btn-ghost" onClick={handleResetCalibration} id="btn-calibrate-reset">
                  Reset
                </button>
              )}
            </>
          )}

          {!isActive && (
            <label className="skip-gate">
              <input type="checkbox" checked={skipGate} onChange={(e) => setSkipGate(e.target.checked)} />
              Skip position check
            </label>
          )}

          {!isActive ? (
            <button
              className="btn btn-primary btn-glow"
              onClick={handleStart}
              disabled={startDisabled}
              id="btn-start-session"
            >
              {!isReady ? 'Loading...' : !gateReady ? 'Get in position…' : 'Start Session'}
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
            isActive={true} // Always run camera, even when paused
          />

          {/* Pre-session hints */}
          {!isActive && !calibrating && (
            <div className="camera-hint">
              {exerciseConfig.cameraView === 'side'
                ? 'Stand or sit sideways to the camera so your whole leg or arm is visible.'
                : 'Face the camera so your whole body part is visible.'}
              {exerciseConfig.calibration && (
                <div className="calibration-note">
                  Calibrated: targets set to {Math.round(exerciseConfig.calibration.scale * 100)}% of the clinical range
                </div>
              )}
              {calibError && <div className="calibration-note">⚠ {calibError}</div>}
            </div>
          )}

          {/* Framing gate overlay (item 10) */}
          {!isActive && !calibrating && !skipGate && <FramingOverlay status={gateStatus} />}
          {trackingLost && <FramingOverlay status={gateStatus} lost />}

          {/* Calibration panel (item 11) */}
          <CalibrationPanel
            phase={calibPhase}
            secondsLeft={calibSecondsLeft}
            liveAngle={currentAngleRef.current}
            onCancel={cancelCalib}
          />

          {/* Live HUD overlay */}
          {isActive && (
            <div className="hud-overlay">
              {liveFlags.length > 0 && (
                <div className="compensation-banner">
                  ⚠ {liveFlags.map((f) => COMPENSATION_LABELS[f]).join(' · ')}
                </div>
              )}

              {/* Angle gauge */}
              <div className="angle-gauge">
                <div className="gauge-value">{Math.round(currentAngle)}°</div>
                <div className="gauge-label">Joint Angle</div>
                <div className="gauge-bar">
                  <div
                    className="gauge-fill"
                    style={{
                      width: `${Math.min(100, (currentAngle / (rangeMax + 20)) * 100)}%`,
                      backgroundColor:
                        currentAngle >= rangeMin && currentAngle <= rangeMax
                          ? '#06d6a0'
                          : currentAngle > rangeMax
                          ? '#ffd166'
                          : '#6b7280',
                    }}
                  />
                  <div className="gauge-target-start" style={{ left: `${(rangeMin / (rangeMax + 20)) * 100}%` }} />
                  <div className="gauge-target-end" style={{ left: `${(rangeMax / (rangeMax + 20)) * 100}%` }} />
                </div>
              </div>

              {/* Counter */}
              <div className="rep-counter">
                <div className="rep-value">{repCount}</div>
                <div className="rep-label">{isHold ? 'Holds' : 'Reps'}</div>
              </div>

              {/* State indicator */}
              <div className="state-indicator" style={{ color: STATE_COLORS[repState] }}>
                <div className="state-dot" style={{ backgroundColor: STATE_COLORS[repState] }} />
                <span>{repState}</span>
              </div>

              {/* Side badge */}
              {exerciseConfig.side && <div className="side-badge">Side: {exerciseConfig.side}</div>}

              {/* Confidence */}
              <div className={`confidence-indicator ${confidence < 0.5 ? 'low-confidence' : ''}`}>
                <span>Tracking: {Math.round(confidence * 100)}%</span>
              </div>

              {/* Fatigue indicator */}
              <div className={`fatigue-indicator fatigue-${fatigue.level}`}>
                Fatigue: {fatigue.enoughData ? fatigue.level : 'measuring…'}
              </div>

              {/* Hold progress */}
              {isHold && (
                <div className="hold-progress">
                  <div className="hold-progress-label">
                    {holdDetector.heldSeconds.toFixed(1)}s / {exerciseConfig.hold.durationSec}s
                  </div>
                  <div className="hold-progress-bar">
                    <div
                      className="hold-progress-fill"
                      style={{
                        width: `${Math.min(100, (holdDetector.heldSeconds / exerciseConfig.hold.durationSec) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

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
            <h3>{isHold ? 'Hold History' : 'Rep History'}</h3>
            <div className="rep-list">
              {repHistory.map((rep, i) => (
                <div
                  key={i}
                  className={`rep-item ${
                    rep.correct === true ? 'rep-correct' : rep.correct === false ? 'rep-incorrect' : 'rep-unknown'
                  }`}
                >
                  <span className="rep-number">#{rep.repNumber}</span>
                  <span className="rep-angle">
                    {rep.mode === 'hold' ? `${rep.holdSeconds}s` : `${Math.round(rep.peakAngle)}°`}
                  </span>
                  {rep.qualityScore != null && (
                    <span className="rep-quality" style={{ fontSize: '0.75rem', opacity: 0.85, fontWeight: 600 }}>
                      {rep.qualityScore} pts
                    </span>
                  )}
                  {rep.compensations && rep.compensations.length > 0 && (
                    <span className="rep-comp" title={rep.compensations.map((c) => COMPENSATION_LABELS[c]).join(', ')}>
                      ⚠
                    </span>
                  )}
                  <span
                    className={`rep-verdict ${
                      rep.correct === true ? 'verdict-pass' : rep.correct === false ? 'verdict-fail' : 'verdict-unknown'
                    }`}
                  >
                    {rep.correct === true ? '✓' : rep.correct === false ? '✗' : '?'}
                  </span>
                  <span
                    className="rep-source"
                    title={rep.verdictSource === 'checkpoint_only' ? `AI check skipped (${rep.skipReason})` : undefined}
                  >
                    {rep.verdictSource === 'vlm'
                      ? '🤖'
                      : rep.verdictSource === 'model'
                      ? '🧠'
                      : rep.verdictSource === 'offline'
                      ? '📴'
                      : rep.verdictSource === 'skipped'
                      ? '⏭'
                      : rep.verdictSource === 'error'
                      ? '⚡'
                      : rep.verdictSource === 'hold_check'
                      ? '⏱'
                      : rep.verdictSource === 'checkpoint_only'
                      ? '📐?'
                      : '📐'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live AI Coaching Sidebar */}
        {isActive && (
          <ChatCoachPanel
            agent={coachAgent}
            currentAngle={currentAngle}
            targetRange={exerciseConfig.target_angle_range || [80, 100]}
            isOnline={navigator.onLine}
            isOpen={coachPanelOpen}
            onToggleOpen={setCoachPanelOpen}
            voiceEnabled={voiceEnabled}
            onToggleVoice={toggleVoice}
          />
        )}
      </div>

      {/* Feedback toast */}

      <FeedbackToast feedback={feedback} onDismiss={() => setFeedback(null)} />

      {/* Session summary */}
      {showSummary && (
        <SessionSummary
          sessionId={sessionId}
          repHistory={repHistory}
          exerciseConfig={exerciseConfig}
          fatigue={fatigue}
          onClose={onBack}
          onRestart={handleStart}
        />
      )}

      {showSummary && progressionResult && (
        <div className="progression-banner">
          <strong>{progressionResult.programName}</strong>
          {progressionResult.raised ? (
            <span>
              🎉 Target raised for {progressionResult.raised.exerciseName}: {progressionResult.raised.from.sets}×{progressionResult.raised.from.reps} → {progressionResult.raised.to.sets}×{progressionResult.raised.to.reps}
            </span>
          ) : progressionResult.goodSession ? (
            <span>✅ Good session — streak {progressionResult.streak}/{progressionResult.required}</span>
          ) : (
            <span>Complete all sets with ≥ accuracy target to build your streak ({progressionResult.accuracy}% this time)</span>
          )}
        </div>
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
