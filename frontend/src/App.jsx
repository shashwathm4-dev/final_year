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
import ProgramBuilder from './pages/ProgramBuilder';
import ClinicPage from './pages/ClinicPage';
import ProtectedRoute from './components/ProtectedRoute';
import ExerciseSession from './components/ExerciseSession';
import ConsentGate from './components/ConsentGate';
import PrivacyPage from './pages/PrivacyPage';
import OfflineBanner from './components/OfflineBanner';
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
      <OfflineBanner />
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
        <Route
          path="/programs"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <ProgramBuilder />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clinic"
          element={
            <ProtectedRoute allowedRoles={['doctor']}>
              <ClinicPage />
            </ProtectedRoute>
          }
        />


        {/* Session route — both roles can access */}
        <Route
          path="/session/:exerciseId"
          element={
            <ProtectedRoute allowedRoles={['patient', 'doctor']}>
              <ConsentGate>
                <ExerciseSession />
              </ConsentGate>
            </ProtectedRoute>
          }
        />

        {/* Privacy page — both roles */}
        <Route
          path="/privacy"
          element={
            <ProtectedRoute allowedRoles={['patient', 'doctor']}>
              <PrivacyPage />
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
