/**
 * ProtectedRoute — Guards routes by auth state and role.
 * Redirects unauthenticated users to /login.
 * Redirects role mismatches to the correct dashboard.
 */
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect to the correct dashboard
    if (role === 'doctor') {
      return <Navigate to="/doctor" replace />;
    }
    return <Navigate to="/patient" replace />;
  }

  return children;
}
