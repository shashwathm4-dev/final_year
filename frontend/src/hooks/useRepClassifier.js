/**
 * Hook to load and cache on-device rep classifier model for an exercise.
 */
import { useState, useEffect } from 'react';
import { getRepModel } from '../services/api';

export function useRepClassifier(exerciseId) {
  const [model, setModel] = useState(() => {
    if (!exerciseId) return null;
    try {
      const cached = localStorage.getItem(`repmodel:${exerciseId}`);
      return cached ? JSON.parse(cached) : null;
    } catch (_) {
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!exerciseId) {
      setReady(true);
      return;
    }

    let isMounted = true;
    getRepModel(exerciseId)
      .then((remoteModel) => {
        if (!isMounted) return;
        if (remoteModel && remoteModel.weights) {
          setModel(remoteModel);
          try {
            localStorage.setItem(`repmodel:${exerciseId}`, JSON.stringify(remoteModel));
          } catch (_) {}
        }
      })
      .catch(() => {
        // Fall back to localStorage cached model if network fails
      })
      .finally(() => {
        if (isMounted) setReady(true);
      });

    return () => {
      isMounted = false;
    };
  }, [exerciseId]);

  return { model, ready };
}
