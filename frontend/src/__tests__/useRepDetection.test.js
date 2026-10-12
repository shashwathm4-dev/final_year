import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useRepDetection from '../hooks/useRepDetection';

const config = {
  startAngleThreshold: 18,
  peakAngleThreshold: 45,
  returnAngleThreshold: 28,
};

function feed(result, angles) {
  angles.forEach((angle, i) => {
    act(() => {
      result.current.addFrame({ angle, timestamp: i * 200, confidence: 0.9 });
    });
  });
}

describe('useRepDetection state machine', () => {
  it('starts IDLE with zero reps', () => {
    const { result } = renderHook(() => useRepDetection(config, vi.fn()));
    expect(result.current.state).toBe('IDLE');
    expect(result.current.repCount).toBe(0);
  });

  it('counts one rep for a full up-and-down cycle and reports the peak', () => {
    const onRep = vi.fn();
    const { result } = renderHook(() => useRepDetection(config, onRep));
    feed(result, [5, 20, 35, 50, 60, 55, 40, 30, 25]);
    expect(result.current.repCount).toBe(1);
    expect(onRep).toHaveBeenCalledTimes(1);
    expect(onRep.mock.calls[0][0].repNumber).toBe(1);
    expect(onRep.mock.calls[0][0].peakAngle).toBe(60);
    expect(result.current.state).toBe('IDLE');
  });

  it('does not count a movement that never reaches the peak threshold', () => {
    const onRep = vi.fn();
    const { result } = renderHook(() => useRepDetection(config, onRep));
    feed(result, [5, 20, 30, 35, 25, 5, 2]);
    expect(result.current.repCount).toBe(0);
    expect(onRep).not.toHaveBeenCalled();
  });

  it('counts two consecutive reps', () => {
    const onRep = vi.fn();
    const { result } = renderHook(() => useRepDetection(config, onRep));
    const rep = [5, 20, 35, 50, 55, 40, 25];
    feed(result, [...rep, ...rep]);
    expect(result.current.repCount).toBe(2);
  });

  it('reset() clears the count', () => {
    const { result } = renderHook(() => useRepDetection(config, vi.fn()));
    feed(result, [5, 20, 35, 50, 55, 40, 25]);
    expect(result.current.repCount).toBe(1);
    act(() => result.current.reset());
    expect(result.current.repCount).toBe(0);
    expect(result.current.state).toBe('IDLE');
  });
});
