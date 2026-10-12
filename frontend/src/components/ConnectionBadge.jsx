/**
 * Connection and Offline Sync Status Badge (Feature 33)
 * Displays online/offline status and pending sync queue count.
 */
import React, { useState, useEffect } from 'react';
import { queueSize, subscribeQueue } from '../services/offlineQueue';
import { flushOfflineQueue } from '../services/api';

export default function ConnectionBadge() {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [pending, setPending] = useState(() => queueSize());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setPending(queueSize());
      flushOfflineQueue().catch(() => {});
    };

    const handleOffline = () => {
      setIsOnline(false);
      setPending(queueSize());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribe = subscribeQueue((count) => setPending(count));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  return (
    <div className={`connection-badge ${isOnline ? 'is-online' : 'is-offline'}`} title={isOnline ? 'Connected to server' : 'Working offline — items queued'}>
      <span className="connection-dot">{isOnline ? '🟢' : '📴'}</span>
      <span className="connection-label">{isOnline ? 'Online' : 'Offline'}</span>
      {pending > 0 && (
        <span className="pending-badge" title="Changes pending synchronization">
          {pending} pending sync
        </span>
      )}
    </div>
  );
}
