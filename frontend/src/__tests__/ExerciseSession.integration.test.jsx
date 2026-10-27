import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExerciseSession from '../components/ExerciseSession';
import * as api from '../services/api';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'pat1' }, role: 'patient' }),
}));

vi.mock('react-router-dom', () => ({
  useParams: () => ({ exerciseId: 'squat' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    startSession: vi.fn(),
    logRep: vi.fn(),
    endSession: vi.fn(),
    verifyRep: vi.fn(),
    getExercise: vi.fn(),
    logRepPlayback: vi.fn(),
    getCoachingSummary: vi.fn(),
    getPersonalization: vi.fn().mockResolvedValue({}),
    getRepModel: vi.fn().mockResolvedValue(null),
  };
});

// Mock child components that rely on WebGL / MediaPipe / Canvas
vi.mock('../hooks/usePoseLandmarker', () => ({
  default: () => ({
    detectForVideo: vi.fn(),
    isLoading: false,
    error: null,
    isReady: true,
  }),
}));

vi.mock('../hooks/useVoiceCoach', () => ({
  default: () => ({
    speak: vi.fn(),
    enabled: true,
    supported: true,
    toggle: vi.fn(),
  }),
}));

vi.mock('../components/PoseCamera', () => ({
  default: () => <div data-testid="pose-camera">PoseCamera Mock</div>,
}));

vi.mock('../components/SessionSummary', () => ({
  default: ({ repHistory, onClose }) => (
    <div data-testid="session-summary">
      <span>Summary Loaded</span>
      <span>Total: {repHistory?.length || 0}</span>
      <button onClick={onClose}>Done</button>
    </div>
  ),
}));

describe('ExerciseSession Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.startSession.mockResolvedValue({ sessionId: 'session-123' });
    api.endSession.mockResolvedValue({
      status: 'completed',
      progression: { action: 'increase', message: 'Target increased!' },
    });
  });

  it('initializes session and transitions through Start and Stop flows', async () => {
    render(<ExerciseSession />);

    // Check "Skip position check" so Start Session button is enabled in test environment
    const skipCheckbox = screen.getByLabelText(/skip position check/i);
    fireEvent.click(skipCheckbox);

    // Wait for adaptive config to resolve and button to be enabled
    await waitFor(() => {
      const startBtn = screen.getByRole('button', { name: /start session/i });
      expect(startBtn.disabled).toBe(false);
    });

    const startBtn = screen.getByRole('button', { name: /start session/i });
    fireEvent.click(startBtn);

    // Verify End Session button appears
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /end session/i })).toBeTruthy();
    });

    // Click End Session
    const endBtn = screen.getByRole('button', { name: /end session/i });
    fireEvent.click(endBtn);

    // Verify endSession was called
    await waitFor(() => {
      expect(api.endSession).toHaveBeenCalledWith({
        sessionId: 'session-123',
        totalReps: 0,
        correctReps: 0,
      });
    });

    // Verify summary is rendered
    expect(screen.getByTestId('session-summary')).toBeTruthy();
  });

  it('handles offline mode gracefully when endSession is rejected', async () => {
    api.startSession.mockResolvedValue({ sessionId: 'local_12345' });
    api.endSession.mockRejectedValue(new Error('Network offline'));

    render(<ExerciseSession />);

    const skipCheckbox = screen.getByLabelText(/skip position check/i);
    fireEvent.click(skipCheckbox);

    await waitFor(() => {
      const startBtn = screen.getByRole('button', { name: /start session/i });
      expect(startBtn.disabled).toBe(false);
    });

    const startBtn = screen.getByRole('button', { name: /start session/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /end session/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /end session/i }));

    // Does not crash, still presents summary
    await waitFor(() => {
      expect(screen.getByTestId('session-summary')).toBeTruthy();
    });
  });
});
