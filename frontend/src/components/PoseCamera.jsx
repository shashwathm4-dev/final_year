/**
 * PoseCamera — Webcam feed with MediaPipe skeleton overlay.
 * Handles getUserMedia, runs detection loop via requestAnimationFrame,
 * and renders the skeleton on a canvas overlaid on the video.
 */
import { useEffect, useRef, useCallback } from 'react';
import { drawSkeleton, drawAngleArc } from '../utils/canvasDrawing';
import { getLandmark } from '../utils/landmarkUtils';
import { setFrameSize } from '../utils/angleUtils';

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
  const rootRef = useRef(null);

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
    if (!video || !video.videoWidth) return null;

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }
    const oc = offscreenCanvasRef.current;
    const MAX_W = 480;                       // keeps payloads ≈ 25–50 KB
    const scale = Math.min(1, MAX_W / video.videoWidth);
    oc.width = Math.round(video.videoWidth * scale);
    oc.height = Math.round(video.videoHeight * scale);
    const octx = oc.getContext('2d');
    octx.drawImage(video, 0, 0, oc.width, oc.height);
    const dataUrl = oc.toDataURL('image/jpeg', 0.7);
    // Don't leave a copy of the camera frame sitting in the offscreen canvas
    octx.clearRect(0, 0, oc.width, oc.height);
    return dataUrl;
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
          const ctx = canvas.getContext('2d');
          const frameSize = { w: video.videoWidth || 640, h: video.videoHeight || 480 };

          if (result && result.landmarks) {
            const width = canvas.width;
            const height = canvas.height;

            // Highlight the exercise-relevant joints
            const highlightJoints = exerciseConfig
              ? Object.values(exerciseConfig.landmarkIndices).filter((v) => Number.isInteger(v))
              : [];

            drawSkeleton(ctx, result.landmarks, width, height, { highlightJoints });

            // Draw angle arc for three-point exercises
            if (exerciseConfig && exerciseConfig.angleFunction === 'threePoint' && currentAngle) {
              const indices = Object.values(exerciseConfig.landmarkIndices);
              const lmA = getLandmark(result.landmarks, indices[0]);
              const lmB = getLandmark(result.landmarks, indices[1]);
              const lmC = getLandmark(result.landmarks, indices[2]);
              drawAngleArc(ctx, lmB, lmA, lmC, currentAngle, width, height);
            }

            if (onFrame) {
              onFrame({
                landmarks: result.landmarks,
                worldLandmarks: result.worldLandmarks || null,
                frameSize,
                timestamp: now,
                captureFrame: captureFrameDataUrl,
              });
            }
          } else {
            // No person detected: clear the old skeleton and tell the parent
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (onFrame) {
              onFrame({
                landmarks: null,
                worldLandmarks: null,
                frameSize,
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
    <div className="pose-camera" ref={rootRef}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={() => {
          if (canvasRef.current && videoRef.current) {
            const w = videoRef.current.videoWidth || 640;
            const h = videoRef.current.videoHeight || 480;
            canvasRef.current.width = w;
            canvasRef.current.height = h;
            setFrameSize(w, h);
            // Lets the mobile CSS keep the skeleton aligned with the video (portrait or landscape)
            if (rootRef.current) rootRef.current.style.setProperty('--video-aspect', `${w} / ${h}`);
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
