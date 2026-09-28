/**
 * LoginPage — Distinct Patient and Doctor Logins with immediate direct routing.
 */
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If redirected from signup, pre-select the registered role and show success
  const registeredRole = location.state?.registeredRole || null;
  const justRegistered = location.state?.registered || false;

  const [activeRole, setActiveRole] = useState(registeredRole || 'patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(justRegistered ? '✓ Account created successfully! Please sign in.' : '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // Pass activeRole so AuthContext updates role immediately without waiting for network/Firestore
      await signIn(email, password, activeRole);
      
      // Direct navigation to the respective dashboard immediately
      if (activeRole === 'doctor') {
        navigate('/doctor', { replace: true });
      } else {
        navigate('/patient', { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else if (err.code === 'auth/configuration-not-found') {
        setError('Firebase Authentication is not enabled yet in your Firebase Console. Please go to Firebase Console > Authentication > Sign-in method, and enable "Email/Password".');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">{activeRole === 'doctor' ? '🩺' : '🏃‍♂️'}</div>
          <h1>AI Physiotherapy Assistant</h1>
          <p className="auth-subtitle">
            Sign in to your account
          </p>
        </div>

        {/* 2-Role Login Selection Tabs */}
        <div className="login-role-tabs">
          <button
            type="button"
            className={`login-role-tab ${activeRole === 'patient' ? 'active patient-active' : ''}`}
            onClick={() => {
              setActiveRole('patient');
              setError('');
              setSuccess('');
            }}
          >
            <span className="tab-icon">🏃‍♂️</span>
            <span className="tab-title">Patient Login</span>
          </button>
          <button
            type="button"
            className={`login-role-tab ${activeRole === 'doctor' ? 'active doctor-active' : ''}`}
            onClick={() => {
              setActiveRole('doctor');
              setError('');
              setSuccess('');
            }}
          >
            <span className="tab-icon">🩺</span>
            <span className="tab-title">Doctor Login</span>
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {success && <div className="auth-success">{success}</div>}
          {error && <div className="auth-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="login-email">
              {activeRole === 'doctor' ? 'Doctor Work Email' : 'Patient Email'}
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={activeRole === 'doctor' ? 'doctor@clinic.com' : 'patient@example.com'}
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className={`btn-auth-submit ${activeRole === 'doctor' ? 'btn-doctor' : ''}`}
            disabled={loading}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="loading-spinner small" />
                Signing in...
              </span>
            ) : (
              `Sign In as ${activeRole === 'doctor' ? 'Doctor' : 'Patient'} →`
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Don't have an account?{' '}
            <Link to="/signup" className="auth-link">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
