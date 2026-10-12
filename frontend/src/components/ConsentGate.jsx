/**
 * ConsentGate — shows a privacy consent screen before the camera session opens.
 * Remembers the choice (local + backend) and only asks again if the consent version changes.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getConsent, saveConsentLocal, CONSENT_VERSION } from '../utils/consent';
import { fetchConsent, saveConsent } from '../services/api';

export default function ConsentGate({ children }) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('checking'); // checking | needed | ok
  const [cloudAi, setCloudAi] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) return;
      if (getConsent(user.uid)) {
        setStatus('ok');
        return;
      }
      const remote = await fetchConsent();
      if (cancelled) return;
      if (remote && remote.accepted && remote.version === CONSENT_VERSION) {
        saveConsentLocal(user.uid, remote);
        setStatus('ok');
      } else {
        setStatus('needed');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleAccept = () => {
    const consent = { accepted: true, cloudAi, version: CONSENT_VERSION };
    saveConsentLocal(user.uid, consent);
    saveConsent(consent).catch(() => {});
    setStatus('ok');
  };

  const handleDecline = () => {
    navigate(role === 'doctor' ? '/doctor' : '/patient', { replace: true });
  };

  if (status === 'ok') return children;

  if (status === 'checking') {
    return (
      <div className="auth-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="session-summary-overlay">
      <div className="session-summary consent-card">
        <div className="summary-header">
          <h2>🔒 Your privacy</h2>
          <p className="exercise-name">Please review before using the camera</p>
        </div>

        <ul className="consent-list">
          <li>Your camera video is processed <strong>on your device</strong> to track your joints. It is never recorded or saved.</li>
          <li>We store only numbers: rep counts, joint angles and quality scores.</li>
          <li>You can delete your account and all data at any time from the Privacy page.</li>
        </ul>

        <label className="consent-option">
          <input type="checkbox" checked={cloudAi} onChange={(e) => setCloudAi(e.target.checked)} />
          <span>
            <strong>Allow AI form check (optional)</strong>
            <br />
            One still image of your peak pose is sent to Google Gemini to check your form. It is not stored by this app.
            Leave unticked to use on-device checks only — no image will leave your device.
          </span>
        </label>

        <div className="consent-actions">
          <button className="btn btn-primary btn-glow" onClick={handleAccept}>I agree — continue</button>
          <button className="btn btn-secondary" onClick={handleDecline}>No thanks</button>
        </div>
      </div>
    </div>
  );
}
