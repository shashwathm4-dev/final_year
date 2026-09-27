/**
 * App — Root component with React Router routing.
 * Routes: /login, /signup, /patient, /doctor, /session/:exerciseId
 */
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import PatientDashboard from './pages/PatientDashboard';
import DoctorDashboard from './pages/DoctorDashboard';
import ExerciseBuilder from './pages/ExerciseBuilder';
import ProtectedRoute from './components/ProtectedRoute';
import ExerciseSession from './components/ExerciseSession';
import './App.css';

function RootRedirect() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === 'doctor') return <Navigate to="/doctor" replace />;
  return <Navigate to="/patient" replace />;
}

export default function App() {
  return (
    <div className="app">
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* Patient routes */}
        <Route
          path="/patient"
          element={
            <ProtectedRoute allowedRoles={['patient']}>
              <PatientDashboard />
            </ProtectedRoute>
          }
        />

        {/* Doctor routes */}
        <Route
          path="/doctor"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <DoctorDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/builder"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <ExerciseBuilder />
            </ProtectedRoute>
          }
        />


        {/* Session route — both roles can access */}
        <Route
          path="/session/:exerciseId"
          element={
            <ProtectedRoute allowedRoles={['patient', 'doctor']}>
              <ExerciseSession />
            </ProtectedRoute>
          }
        />

        {/* Root redirect */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
