/**
 * OfflineBanner — shows offline / pending-sync status, syncs the queue when the network returns,
 * and offers an "Install app" button when the browser allows it.
 */
import { useEffect, useState } from 'react';
import { flushOfflineQueue } from '../services/api';
import { queueSize, subscribeQueue } from '../services/offlineQueue';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(queueSize());
  const [installEvent, setInstallEvent] = useState(null);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      flushOfflineQueue();
    };
    const goOffline = () => setOnline(false);
    const onInstallPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => setInstallEvent(null);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    const unsubscribe = subscribeQueue(setPending);
    flushOfflineQueue();
    const timer = setInterval(() => {
      if (queueSize() > 0) flushOfflineQueue();
    }, 20000);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  };

  return (
    <>
      {(!online || pending > 0) && (
        <div className="offline-banner">
          {!online ? '📴 You are offline.' : '🔄 Syncing…'}
          {pending > 0 ? ` ${pending} item(s) waiting to sync.` : ''}
        </div>
      )}
      {installEvent && (
        <button className="install-btn" onClick={handleInstall}>
          ⬇ Install app
        </button>
      )}
    </>
  );
}
