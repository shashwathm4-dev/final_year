/**
 * PoseCamera — Webcam feed with MediaPipe skeleton overlay.
 * Handles getUserMedia, runs detection loop via requestAnimationFrame,
 * and renders the skeleton on a canvas overlaid on the video.
 */
import { useEffect, useRef, useCallback } from 'react';
import { drawSkeleton, drawAngleArc } from '../utils/canvasDrawing';
import { getLandmark } from '../utils/landmarkUtils';

export default function PoseCamera({
  detectForVideo,
  isReady,
  onFrame,
  exerciseConfig,
  currentAngle,
  isActive,
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const streamRef = useRef(null);

  // Start webcam
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error('Failed to access webcam:', err);
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Detection loop
  const lastTimestampRef = useRef(0);
  const offscreenCanvasRef = useRef(null);

  const captureFrameDataUrl = useCallback(() => {
    const video = videoRef.current;
    if (!video) return null;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const oc = offscreenCanvasRef.current;
    oc.width = video.videoWidth || 640;
    oc.height = video.videoHeight || 480;
    const octx = oc.getContext('2d');
    octx.drawImage(video, 0, 0);
    return oc.toDataURL('image/jpeg', 0.7);
  }, []);

  useEffect(() => {
    if (!isReady || !isActive) return;

    let running = true;

    function tick() {
      if (!running) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2 && detectForVideo) {
        const now = performance.now();

        // Throttle to ~30fps
        if (now - lastTimestampRef.current > 33) {
          lastTimestampRef.current = now;

          const result = detectForVideo(video, now);

          if (result && result.landmarks) {
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;

            // Highlight the exercise-relevant joints
            const highlightJoints = exerciseConfig
              ? Object.values(exerciseConfig.landmarkIndices)
              : [];

            drawSkeleton(ctx, result.landmarks, width, height, {
              highlightJoints,
            });

            // Draw angle arc if we have the right config
            if (exerciseConfig && exerciseConfig.angleFunction === 'threePoint' && currentAngle) {
              const indices = Object.values(exerciseConfig.landmarkIndices);
              const lmA = getLandmark(result.landmarks, indices[0]);
              const lmB = getLandmark(result.landmarks, indices[1]);
              const lmC = getLandmark(result.landmarks, indices[2]);
              drawAngleArc(ctx, lmB, lmA, lmC, currentAngle, width, height);
            }

            // Emit frame data to parent
            if (onFrame) {
              onFrame({
                landmarks: result.landmarks,
                timestamp: now,
                captureFrame: captureFrameDataUrl,
              });
            }
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isReady, isActive, detectForVideo, onFrame, exerciseConfig, currentAngle, captureFrameDataUrl]);

  return (
    <div className="pose-camera">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          if (canvasRef.current && videoRef.current) {
            canvasRef.current.width = videoRef.current.videoWidth || 640;
            canvasRef.current.height = videoRef.current.videoHeight || 480;
          }
        }}
      />
      <canvas ref={canvasRef} />
      {!isReady && (
        <div className="camera-loading">
          <div className="loading-spinner" />
          <p>Loading pose detection model...</p>
        </div>
      )}
    </div>
  );
}
