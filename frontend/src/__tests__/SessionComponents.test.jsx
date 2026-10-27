import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import SessionComments from '../components/SessionComments';
import SessionSummary from '../components/SessionSummary';
import * as api from '../services/api';

vi.mock('../services/api', () => ({
  getSessionComments: vi.fn().mockResolvedValue([]),
  postSessionComment: vi.fn(),
  markCommentsRead: vi.fn().mockResolvedValue({}),
  getCoachingSummary: vi.fn().mockResolvedValue(null),
}));

describe('Real-time Polling & Summary Components', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('SessionComments polls every 15s and cleans up interval on unmount', async () => {
    const { unmount } = render(<SessionComments sessionId="s1" myRole="patient" />);
    expect(api.getSessionComments).toHaveBeenCalledTimes(1);

    // Advance 15s
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    expect(api.getSessionComments).toHaveBeenCalledTimes(2);

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(api.getSessionComments).toHaveBeenCalledTimes(2); // no more calls after unmount
  });

  it('SessionSummary calculates stats and calls localCoach if offline or API returns null', async () => {
    const reps = [
      { repNumber: 1, correct: true, qualityScore: 80, verdictSource: 'vlm' },
      { repNumber: 2, correct: false, issue: 'Knee valgus', qualityScore: 60, verdictSource: 'local' },
    ];

    render(
      <SessionSummary
        sessionId="s1"
        repHistory={reps}
        exerciseConfig={{ id: 'squat', displayName: 'Squat' }}
        onClose={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    // Initial render shows stats
    expect(screen.getByText('50%')).toBeTruthy();

    // Advance timer past 600ms
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(api.getCoachingSummary).toHaveBeenCalledWith('s1', false);
  });
});
