/**
 * ExerciseBuilder — Doctor tool to configure and record new custom physiotherapy exercises.
 * Allows selecting 3 anatomical landmarks, recording demonstration reps,
 * auto-computing the 5-checkpoint trajectory profile, and saving to Firestore.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PoseCamera from '../components/PoseCamera';
import usePoseLandmarker from '../hooks/usePoseLandmarker';
import { JOINT_NAME_TO_INDEX } from '../utils/landmarkUtils';
import { threePointAngle } from '../utils/angleUtils';
import { createCustomExercise } from '../services/api';

const AVAILABLE_JOINTS = [
  { key: 'left_shoulder', label: 'Left Shoulder' },
  { key: 'right_shoulder', label: 'Right Shoulder' },
  { key: 'left_elbow', label: 'Left Elbow' },
  { key: 'right_elbow', label: 'Right Elbow' },
  { key: 'left_wrist', label: 'Left Wrist' },
  { key: 'right_wrist', label: 'Right Wrist' },
  { key: 'left_hip', label: 'Left Hip' },
  { key: 'right_hip', label: 'Right Hip' },
  { key: 'left_knee', label: 'Left Knee' },
  { key: 'right_knee', label: 'Right Knee' },
  { key: 'left_ankle', label: 'Left Ankle' },
  { key: 'right_ankle', label: 'Right Ankle' },
];

export default function ExerciseBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { detectForVideo, isReady, isLoading } = usePoseLandmarker();

  // Exercise Metadata
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [jointA, setJointA] = useState('left_hip');
  const [jointB, setJointB] = useState('left_shoulder');
  const [jointC, setJointC] = useState('left_elbow');
  const [tolerance, setTolerance] = useState(25); // degrees tolerance

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingCountdown, setRecordingCountdown] = useState(0);
  const [recordedAngles, setRecordedAngles] = useState([]);
  const [currentLiveAngle, setCurrentLiveAngle] = useState(0);
  const [computedProfile, setComputedProfile] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const angleBufferRef = useRef([]);

  // Compute live angle from landmarks
  const handleFrame = useCallback(
    ({ landmarks }) => {
      if (!landmarks) return;

      const idxA = JOINT_NAME_TO_INDEX[jointA];
      const idxB = JOINT_NAME_TO_INDEX[jointB];
      const idxC = JOINT_NAME_TO_INDEX[jointC];

      const pA = landmarks[idxA];
      const pB = landmarks[idxB];
      const pC = landmarks[idxC];

      if (pA && pB && pC) {
        const angle = threePointAngle(
          [pA.x * 640, pA.y * 480],
          [pB.x * 640, pB.y * 480],
          [pC.x * 640, pC.y * 480]
        );
        const rounded = Math.round((angle || 0) * 10) / 10;
        setCurrentLiveAngle(rounded);

        if (isRecording) {
          angleBufferRef.current.push({
            angle: rounded,
            timestamp: Date.now(),
          });
        }
      }
    },
    [jointA, jointB, jointC, isRecording]
  );

  const startRecording = () => {
    angleBufferRef.current = [];
    setRecordedAngles([]);
    setComputedProfile(null);
    setStatusMsg('');

    // 3s countdown before 8s demonstration
    setRecordingCountdown(3);
    const countTimer = setInterval(() => {
      setRecordingCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countTimer);
          setIsRecording(true);
          startCaptureTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startCaptureTimer = () => {
    setTimeout(() => {
      setIsRecording(false);
      processRecording(angleBufferRef.current);
    }, 8000); // 8 second capture
  };

  // Extract 5 checkpoint angles: 0%, 25%, 50%, 75%, 100%
  const processRecording = (buffer) => {
    if (!buffer || buffer.length < 10) {
      setStatusMsg('⚠ Not enough motion captured. Please ensure full body is visible and repeat.');
      return;
    }

    const angles = buffer.map((b) => b.angle);
    setRecordedAngles(angles);

    const minAngle = Math.min(...angles);
    const maxAngle = Math.max(...angles);
    const minIdx = angles.indexOf(minAngle);
    const maxIdx = angles.indexOf(maxAngle);

    // Pick 5 checkpoints evenly across the recorded movement cycle
    const len = angles.length;
    const cp1 = Math.round(angles[0]);
    const cp2 = Math.round(angles[Math.floor(len * 0.25)]);
    const cp3 = Math.round(angles[Math.floor(len * 0.5)]); // peak or midpoint
    const cp4 = Math.round(angles[Math.floor(len * 0.75)]);
    const cp5 = Math.round(angles[len - 1]);

    const referenceCheckpoints = [cp1, cp2, cp3, cp4, cp5];
    const checkpoint_thresholds = [tolerance, tolerance + 5, tolerance + 5, tolerance + 5, tolerance];
    const target_angle_range = [Math.min(minAngle, maxAngle), Math.max(minAngle, maxAngle)];

    setComputedProfile({
      referenceCheckpoints,
      checkpoint_thresholds,
      target_angle_range,
      startAngleThreshold: Math.round(minAngle + (maxAngle - minAngle) * 0.15),
      peakAngleThreshold: Math.round(minAngle + (maxAngle - minAngle) * 0.75),
      returnAngleThreshold: Math.round(minAngle + (maxAngle - minAngle) * 0.25),
    });

    setStatusMsg('✓ Form checkpoints automatically computed from demonstration!');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setStatusMsg('⚠ Please specify an exercise display name');
      return;
    }
    if (!computedProfile) {
      setStatusMsg('⚠ Please record a demonstration repetition first');
      return;
    }

    setIsSaving(true);
    setStatusMsg('');

    const exerciseId = displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

    try {
      await createCustomExercise({
        id: exerciseId,
        displayName: displayName.trim(),
        description: description.trim() || `Custom exercise measuring angle between ${jointA}, ${jointB}, and ${jointC}.`,
        icon: '🏋️',
        joints: [jointA, jointB, jointC],
        landmarkIndices: {
          a: JOINT_NAME_TO_INDEX[jointA],
          b: JOINT_NAME_TO_INDEX[jointB],
          c: JOINT_NAME_TO_INDEX[jointC],
        },
        angleFunction: 'threePoint',
        target_angle_range: computedProfile.target_angle_range,
        startAngleThreshold: computedProfile.startAngleThreshold,
        peakAngleThreshold: computedProfile.peakAngleThreshold,
        returnAngleThreshold: computedProfile.returnAngleThreshold,
        checkpoint_thresholds: computedProfile.checkpoint_thresholds,
        referenceCheckpoints: computedProfile.referenceCheckpoints,
        note: `Custom clinician routine created by ${user?.email || 'doctor'}`,
      });

      setStatusMsg(`✓ Successfully created exercise "${displayName}"!`);
      setTimeout(() => navigate('/doctor'), 1500);
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Failed to save exercise'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <button className="btn-secondary" onClick={() => navigate('/doctor')}>
            ← Back to Dashboard
          </button>
          <div>
            <h1>Custom Exercise Builder</h1>
            <p className="dashboard-subtitle">Configure joint mechanics and record reference gold standards</p>
          </div>
        </div>
      </header>

      {statusMsg && (
        <div className={`dashboard-alert ${statusMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
          {statusMsg}
        </div>
      )}

      <div className="dashboard-grid">
        {/* Left: Configuration Form */}
        <section className="dashboard-card">
          <div className="card-header">
            <h2>⚙️ 1. Kinematic Configuration</h2>
          </div>

          <form onSubmit={handleSave} className="prescribe-form">
            <div className="form-group">
              <label>Exercise Name</label>
              <input
                type="text"
                placeholder="e.g. Seated Knee Extension"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Clinical Guidance / Purpose</label>
              <input
                type="text"
                placeholder="e.g. Quadriceps strengthening post-ACL reconstruction"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <h3 style={{ fontSize: '0.9rem', color: 'var(--teal-400)', marginTop: '0.5rem' }}>
              Joint Angle Formed at Vertex B (Vector BA → BC)
            </h3>

            <div className="form-row">
              <div className="form-group">
                <label>Point A (Origin)</label>
                <select value={jointA} onChange={(e) => setJointA(e.target.value)}>
                  {AVAILABLE_JOINTS.map((j) => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Point B (Vertex / Joint Center)</label>
                <select value={jointB} onChange={(e) => setJointB(e.target.value)}>
                  {AVAILABLE_JOINTS.map((j) => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Point C (Terminal)</label>
                <select value={jointC} onChange={(e) => setJointC(e.target.value)}>
                  {AVAILABLE_JOINTS.map((j) => (
                    <option key={j.key} value={j.key}>{j.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Allowed Angle Deviation Tolerance: ±{tolerance}°</label>
              <input
                type="range"
                min="10"
                max="45"
                value={tolerance}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setTolerance(val);
                  if (computedProfile) {
                    setComputedProfile({
                      ...computedProfile,
                      checkpoint_thresholds: [val, val + 5, val + 5, val + 5, val],
                    });
                  }
                }}
              />
            </div>

            {computedProfile && (
              <div className="profile-preview" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>
                <h4 style={{ color: 'var(--teal-400)', marginBottom: '0.5rem' }}>Auto-Extracted 5 Checkpoints (°):</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {computedProfile.referenceCheckpoints.map((cp, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CP{i + 1}</div>
                      <div style={{ fontWeight: 'bold' }}>{cp}°</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn-assign-submit"
              disabled={isSaving || !computedProfile}
              style={{ marginTop: '1rem' }}
            >
              {isSaving ? 'Publishing Exercise...' : 'Publish to Clinic Exercise Library'}
            </button>
          </form>
        </section>

        {/* Right: Camera & Demonstration Recording */}
        <section className="dashboard-card">
          <div className="card-header">
            <h2>📹 2. Record Gold-Standard Repetition</h2>
            <span className="count-badge">Live: {currentLiveAngle}°</span>
          </div>

          <div style={{ position: 'relative', width: '100%', borderRadius: '12px', overflow: 'hidden', minHeight: '360px', background: '#000' }}>
            <PoseCamera
              detectForVideo={detectForVideo}
              isReady={isReady}
              onFrame={handleFrame}
              exerciseConfig={{ id: 'custom_builder' }}
              currentAngle={currentLiveAngle}
              isActive={true}
            />

            {recordingCountdown > 0 && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '4rem', fontWeight: 'bold' }}>
                {recordingCountdown}
              </div>
            )}

            {isRecording && (
              <div style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#ef4444', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '20px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '10px', height: '10px', background: '#fff', borderRadius: '50%', display: 'inline-block' }} />
                RECORDING FORM...
              </div>
            )}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              className="btn-primary"
              style={{ flex: 1, padding: '0.8rem' }}
              onClick={startRecording}
              disabled={isRecording || recordingCountdown > 0 || !isReady}
            >
              {isRecording ? 'Capturing Movement...' : '● Record 8s Demonstration Rep'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
