/**
 * PrivacyPage — view/change AI cloud-check consent and permanently delete the account.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getConsent, saveConsentLocal, clearConsent, CONSENT_VERSION } from '../utils/consent';
import { saveConsent, deleteMyAccount } from '../services/api';
import { clearOfflineData } from '../services/offlineQueue';

export default function PrivacyPage() {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const existing = getConsent(user?.uid);

  const [cloudAi, setCloudAi] = useState(existing ? existing.cloudAi : false);
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const home = role === 'doctor' ? '/doctor' : '/patient';

  const handleSave = async () => {
    const consent = { accepted: true, cloudAi, version: CONSENT_VERSION };
    saveConsentLocal(user.uid, consent);
    try {
      await saveConsent(consent);
      setStatusMsg('✓ Privacy choice saved');
    } catch {
      setStatusMsg('✓ Saved on this device (could not reach the server)');
    }
  };

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setBusy(true);
    setStatusMsg('');
    try {
      const res = await deleteMyAccount();
      if (!res.authDeleted && auth?.currentUser) {
        try {
          await deleteUser(auth.currentUser);
        } catch (err) {
          console.warn('Could not delete login (may need recent sign-in):', err.message);
        }
      }
      clearConsent(user.uid);
      clearOfflineData();
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      setStatusMsg(`✗ ${err.response?.data?.error || 'Could not delete your data'}`);
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <span className="dashboard-logo">🔒</span>
          <div>
            <h1>Privacy</h1>
            <p className="dashboard-subtitle">Control how your data is used</p>
          </div>
        </div>
        <div className="dashboard-actions">
          <button className="btn-secondary" onClick={() => navigate(home)}>← Back</button>
        </div>
      </header>

      {statusMsg && (
        <div className={`dashboard-alert ${statusMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
          {statusMsg}
        </div>
      )}

      <div className="dashboard-subcol">
        <section className="dashboard-card">
          <div className="card-header"><h2>What we store</h2></div>
          <ul className="consent-list">
            <li>Camera video is never recorded or saved.</li>
            <li>Only numbers are stored: rep counts, joint angles, quality scores, and your assigned exercises.</li>
            <li>With the AI form check on, one still image of your peak pose is sent to Google Gemini per verified rep. It is not stored by this app.</li>
            <li>Live coaching chat sends only numeric movement data (angles and rep counts, no video or images) to the AI model when cloud AI is consented.</li>
          </ul>
        </section>


        <section className="dashboard-card">
          <div className="card-header"><h2>AI form check</h2></div>
          <label className="consent-option">
            <input type="checkbox" checked={cloudAi} onChange={(e) => setCloudAi(e.target.checked)} />
            <span>Send one still image per verified rep to Google Gemini for form checking</span>
          </label>
          <button className="btn-assign-submit" onClick={handleSave}>Save choice</button>
        </section>

        <section className="dashboard-card danger-zone">
          <div className="card-header"><h2>Delete my account and data</h2></div>
          <p className="empty-hint">
            This permanently deletes your profile, sessions, rep logs and assignments
            {role === 'doctor' ? ', your custom exercises and programs, and unlinks your patients' : ''}. It cannot be undone.
            Type <strong>DELETE</strong> to confirm.
          </p>
          <div className="form-row">
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="danger-input"
            />
            <button className="btn-danger-solid" disabled={confirmText !== 'DELETE' || busy} onClick={handleDelete}>
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
