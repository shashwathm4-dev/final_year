/**
 * Hook for Personalized Adaptive Difficulty (Feature 29)
 * Fetches personal EMA progression profile for the exercise and applies adaptive targets.
 */
import { useState, useEffect, useMemo } from 'react';
import { getPersonalization } from '../services/api';

export function useAdaptiveConfig(baseConfig) {
  const [enabled, setEnabledState] = useState(() => {
    try {
      const stored = localStorage.getItem('adaptive_difficulty');
      return stored !== null ? stored === 'true' : true;
    } catch (_) {
      return true;
    }
  });

  const setEnabled = (val) => {
    setEnabledState(val);
    try {
      localStorage.setItem('adaptive_difficulty', String(val));
    } catch (_) {}
  };

  const [adaptedData, setAdaptedData] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!baseConfig || !baseConfig.id) {
      setReady(true);
      return;
    }

    let isMounted = true;
    let settled = false;

    // Timeout 2.5s fallback to ready with base config
    const timer = setTimeout(() => {
      if (!settled && isMounted) {
        settled = true;
        setReady(true);
      }
    }, 2500);

    getPersonalization(baseConfig.id)
      .then((res) => {
        if (!isMounted) return;
        if (res && res.adapted) {
          setAdaptedData(res.adapted);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch adaptive difficulty:', err.message);
      })
      .finally(() => {
        if (!settled && isMounted) {
          settled = true;
          clearTimeout(timer);
          setReady(true);
        }
      });

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [baseConfig?.id]);

  const adaptive = !!adaptedData?.adaptive;
  const workingTargetPeak = adaptedData?.workingTargetPeak ?? baseConfig?.target_angle_range?.[0] ?? 0;

  const config = useMemo(() => {
    if (!baseConfig) return null;
    if (adaptive && enabled && adaptedData) {
      return {
        ...baseConfig,
        checkpoint_thresholds: adaptedData.checkpoint_thresholds || baseConfig.checkpoint_thresholds,
        peakAngleThreshold: adaptedData.peakAngleThreshold ?? baseConfig.peakAngleThreshold,
      };
    }
    return baseConfig;
  }, [baseConfig, adaptive, enabled, adaptedData]);

  return {
    config,
    adaptive,
    enabled,
    setEnabled,
    ready,
    workingTargetPeak,
    thresholdScale: adaptedData?.thresholdScale ?? 1.0,
  };
}
