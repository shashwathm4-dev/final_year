import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from '../components/ProtectedRoute';

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('Router & ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading indicator when auth is loading', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      role: null,
      loading: true,
    });

    render(
      <MemoryRouter initialEntries={['/patient']}>
        <ProtectedRoute allowedRoles={['patient']}>
          <div>Protected Patient Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('Loading...')).toBeTruthy();
    expect(screen.queryByText('Protected Patient Content')).toBeNull();
  });

  it('redirects to /login when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      role: null,
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/doctor']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <div>Doctor Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Login Page')).toBeTruthy();
    expect(screen.queryByText('Doctor Content')).toBeNull();
  });

  it('redirects patient to /patient when accessing doctor-only route', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'p123' },
      role: 'patient',
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/doctor']}>
        <Routes>
          <Route path="/patient" element={<div>Patient Dashboard</div>} />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <div>Doctor Dashboard</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Patient Dashboard')).toBeTruthy();
    expect(screen.queryByText('Doctor Dashboard')).toBeNull();
  });

  it('redirects doctor to /doctor when accessing patient-only route', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'd123' },
      role: 'doctor',
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/patient-only']}>
        <Routes>
          <Route path="/doctor" element={<div>Doctor Dashboard</div>} />
          <Route
            path="/patient-only"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <div>Patient Only Content</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Doctor Dashboard')).toBeTruthy();
  });

  it('allows access when user has matching role', () => {
    mockUseAuth.mockReturnValue({
      user: { uid: 'd123' },
      role: 'doctor',
      loading: false,
    });

    render(
      <MemoryRouter initialEntries={['/doctor']}>
        <Routes>
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <div>Welcome Doctor</div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Welcome Doctor')).toBeTruthy();
  });
});
