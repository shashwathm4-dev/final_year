import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AdherencePanel from '../components/doctor/AdherencePanel';
import PatientTrends from '../components/doctor/PatientTrends';
import SessionPlayback from '../components/doctor/SessionPlayback';
import * as api from '../services/api';

vi.mock('../../services/api', () => ({
  getAdherence: vi.fn(),
  getPatientTrends: vi.fn(),
  getSession: vi.fn(),
  getRepPlayback: vi.fn(),
}));

// Also mock relative path from components/doctor
vi.mock('../services/api', () => ({
  getAdherence: vi.fn(),
  getPatientTrends: vi.fn(),
  getSession: vi.fn(),
  getRepPlayback: vi.fn(),
}));

describe('Doctor Dashboard Panels & Visualizations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AdherencePanel', () => {
    it('handles empty patients list gracefully', async () => {
      api.getAdherence.mockResolvedValue({
        totals: { at_risk: 0, behind: 0, on_track: 0, no_plan: 0 },
        patients: [],
      });

      render(<AdherencePanel onOpenPatient={vi.fn()} />);

      expect(screen.getByText('Calculating adherence...')).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByText('No patients linked yet.')).toBeTruthy();
      });
      expect(screen.getByText('0 patients')).toBeTruthy();
    });

    it('renders patient adherence rows and responds to click', async () => {
      const onOpenPatient = vi.fn();
      api.getAdherence.mockResolvedValue({
        totals: { at_risk: 1, behind: 0, on_track: 1, no_plan: 0 },
        patients: [
          {
            patientId: 'p1',
            fullName: 'Jane Doe',
            weeklyPct: 85,
            status: 'on_track',
            alerts: ['Missed weekend session'],
          },
        ],
      });

      render(<AdherencePanel onOpenPatient={onOpenPatient} />);

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeTruthy();
      });

      expect(screen.getByText(/85%/)).toBeTruthy();
      expect(screen.getByText(/Missed weekend session/)).toBeTruthy();

      fireEvent.click(screen.getByText('Jane Doe'));
      expect(onOpenPatient).toHaveBeenCalledWith('p1');
    });

    it('renders error state on API failure', async () => {
      api.getAdherence.mockRejectedValue(new Error('Network error'));

      render(<AdherencePanel onOpenPatient={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Could not load adherence data')).toBeTruthy();
      });
    });
  });

  describe('PatientTrends', () => {
    it('returns empty when patient prop has no uid', () => {
      const { container } = render(<PatientTrends patient={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('displays message when patient has no sessions yet', async () => {
      api.getPatientTrends.mockResolvedValue({
        exercises: [],
        totals: { sessions: 0, reps: 0 },
      });

      render(<PatientTrends patient={{ uid: 'p1' }} />);

      await waitFor(() => {
        expect(screen.getByText('Trends appear after the patient completes a session.')).toBeTruthy();
      });
    });

    it('renders exercise trend cards when data is available', async () => {
      api.getPatientTrends.mockResolvedValue({
        exercises: [
          {
            exerciseId: 'squat',
            displayName: 'Squat',
            direction: 'improving',
            sessionsCount: 5,
            avgQuality: 88,
            history: [
              { date: '2026-10-20', avgQuality: 70, repCount: 10 },
              { date: '2026-10-22', avgQuality: 88, repCount: 12 },
            ],
          },
        ],
        totals: { sessions: 5, reps: 60 },
        commonMistakes: [],
      });

      render(<PatientTrends patient={{ uid: 'p1' }} />);

      await waitFor(() => {
        expect(screen.getByText(/squat/i)).toBeTruthy();
      });

      expect(screen.getByText(/5 sessions · 60 reps/)).toBeTruthy();
      expect(screen.getByText(/Improving/)).toBeTruthy();
    });
  });

  describe('SessionPlayback', () => {
    it('displays notice when session has no recorded reps with playback', async () => {
      api.getSession.mockResolvedValue({ reps: [{ repNumber: 1, hasPlayback: false }] });

      render(<SessionPlayback sessionId="s1" onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('No playback was recorded for this session.')).toBeTruthy();
      });
    });
  });
});
