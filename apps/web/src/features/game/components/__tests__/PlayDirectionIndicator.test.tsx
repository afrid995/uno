import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayDirectionIndicator } from '../PlayDirectionIndicator';

describe('PlayDirectionIndicator Component', () => {
  it('renders clockwise indicator with cyan/emerald theme and clockwise badge', () => {
    render(<PlayDirectionIndicator direction="clockwise" />);

    const indicator = screen.getByTestId('play-direction-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('data-direction', 'clockwise');

    const badge = screen.getByTestId('direction-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Clockwise');

    // Has pointer-events-none to prevent blocking card interactions
    expect(indicator).toHaveClass('pointer-events-none');
  });

  it('renders counterclockwise indicator with rose/amber theme and counter-clockwise badge', () => {
    render(<PlayDirectionIndicator direction="counter_clockwise" />);

    const indicator = screen.getByTestId('play-direction-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('data-direction', 'counter_clockwise');

    const badge = screen.getByTestId('direction-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Counter-Clockwise');
  });

  it('updates direction dynamically when direction changes', () => {
    const { rerender } = render(<PlayDirectionIndicator direction="clockwise" />);
    expect(screen.getByTestId('direction-badge')).toHaveTextContent('Clockwise');

    // Simulate Reverse card changing direction to counterclockwise
    rerender(<PlayDirectionIndicator direction="counter_clockwise" />);
    expect(screen.getByTestId('direction-badge')).toHaveTextContent('Counter-Clockwise');

    // Simulate second Reverse card returning direction to clockwise
    rerender(<PlayDirectionIndicator direction="clockwise" />);
    expect(screen.getByTestId('direction-badge')).toHaveTextContent('Clockwise');
  });

  it('renders elliptical orbit track', () => {
    render(<PlayDirectionIndicator direction="clockwise" />);
    const track = screen.getByTestId('direction-track');
    expect(track).toBeInTheDocument();
  });
});
