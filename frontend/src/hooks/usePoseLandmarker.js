/**
 * usePoseLandmarker — React hook for MediaPipe PoseLandmarker lifecycle.
 * Initializes the model on mount, exposes detectForVideo, cleans up on unmount.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';
import { LandmarkSmoother } from '../utils/landmarkSmoother';

// Tuning: raise minCutoff if the skeleton looks too "floaty"; raise beta if fast moves lag.
const SMOOTHING = { minCutoff: 1.5, beta: 8, dCutoff: 1.0 };

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const WASM_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

export default function usePoseLandmarker() {
  const landmarkerRef = useRef(null);
  const smootherRef = useRef(new LandmarkSmoother(SMOOTHING));
  const worldSmootherRef = useRef(new LandmarkSmoother(SMOOTHING));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        const vision = await FilesetResolver.forVisionTasks(WASM_CDN);

        if (cancelled) return;

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU', // Use GPU acceleration if available
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) {
          landmarker.close();
          return;
        }

        landmarkerRef.current = landmarker;
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to initialize PoseLandmarker:', err);
          setError(err.message || 'Failed to load pose detection model');
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, []);

  /**
   * Run pose detection on a video frame.
   * @param {HTMLVideoElement} videoEl
   * @param {number} timestamp - performance.now() value
   * @returns {{ landmarks: Array, worldLandmarks: Array, rawLandmarks: Array } | null}
   */
  const detectForVideo = useCallback((videoEl, timestamp) => {
    if (!landmarkerRef.current || !videoEl || videoEl.readyState < 2) {
      return null;
    }

    try {
      const result = landmarkerRef.current.detectForVideo(videoEl, timestamp);
      if (result && result.landmarks && result.landmarks.length > 0) {
        const world = result.worldLandmarks && result.worldLandmarks[0];
        return {
          landmarks: smootherRef.current.smooth(result.landmarks[0], timestamp),
          worldLandmarks: world ? worldSmootherRef.current.smooth(world, timestamp) : null,
          rawLandmarks: result.landmarks[0],
        };
      }
      // No person this frame: don't smooth across the gap
      smootherRef.current.reset();
      worldSmootherRef.current.reset();
      return null;
    } catch (err) {
      return null;
    }
  }, []);

  return {
    detectForVideo,
    isLoading,
    error,
    isReady: !isLoading && !error && landmarkerRef.current !== null,
  };
}
