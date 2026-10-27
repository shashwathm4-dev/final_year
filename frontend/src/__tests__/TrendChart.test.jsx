import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TrendChart from '../components/charts/TrendChart';

describe('TrendChart component', () => {
  it('renders "Not enough data yet" when series is empty or has only nulls', () => {
    const { rerender } = render(<TrendChart series={[]} />);
    // Empty series returns null
    expect(screen.queryByRole('img')).toBeNull();

    rerender(<TrendChart series={[{ name: 'Accuracy', color: '#00ff00', values: [null, null] }]} />);
    expect(screen.getByText('Not enough data yet')).toBeTruthy();
  });

  it('renders polyline with point count matching non-null data', () => {
    const series = [
      { name: 'ROM', color: '#06b6d4', values: [60, 75, 80] },
    ];
    const { container } = render(<TrendChart series={series} labels={['D1', 'D2', 'D3']} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeTruthy();
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(3);
  });

  it('skips null and non-finite values without emitting NaN in SVG attributes', () => {
    const series = [
      { name: 'ROM', color: '#06b6d4', values: [60, null, NaN, Infinity, 80] },
    ];
    const { container } = render(<TrendChart series={series} />);
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeTruthy();
    const pointsAttr = polyline.getAttribute('points');
    expect(pointsAttr).not.toContain('NaN');
    expect(pointsAttr).not.toContain('Infinity');
    // Only 2 valid points
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
  });

  it('renders referenceLines properly', () => {
    const series = [{ name: 'ROM', color: '#06b6d4', values: [70, 80] }];
    const referenceLines = [{ value: 75, label: 'Target 75°', color: '#fbbf24' }];
    render(<TrendChart series={series} referenceLines={referenceLines} />);
    expect(screen.getByText('Target 75°')).toBeTruthy();
  });
});
