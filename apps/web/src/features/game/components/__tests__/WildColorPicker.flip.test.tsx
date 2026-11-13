import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WildColorPicker } from '../WildColorPicker';

describe('WildColorPicker Component — UNO Flip Dual-Side Colors', () => {
  it('renders 4 Dark Side colors (Pink, Teal, Orange, Purple) when activeSide="DARK"', () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();

    render(
      <WildColorPicker
        isOpen={true}
        activeSide="DARK"
        onSelectColor={handleSelect}
        onClose={handleClose}
      />
    );

    expect(screen.getByTestId('wild-color-pink')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-teal')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-orange')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-purple')).toBeInTheDocument();

    // Red/Blue should NOT be present on Dark Side
    expect(screen.queryByTestId('wild-color-red')).not.toBeInTheDocument();
    expect(screen.queryByTestId('wild-color-blue')).not.toBeInTheDocument();

    // Selecting pink triggers callback with 'pink'
    fireEvent.click(screen.getByTestId('wild-color-pink'));
    expect(handleSelect).toHaveBeenCalledWith('pink');
  });

  it('renders 4 Light Side colors (Red, Yellow, Green, Blue) when activeSide="LIGHT"', () => {
    const handleSelect = vi.fn();
    const handleClose = vi.fn();

    render(
      <WildColorPicker
        isOpen={true}
        activeSide="LIGHT"
        onSelectColor={handleSelect}
        onClose={handleClose}
      />
    );

    expect(screen.getByTestId('wild-color-red')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-yellow')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-green')).toBeInTheDocument();
    expect(screen.getByTestId('wild-color-blue')).toBeInTheDocument();

    // Pink should NOT be present on Light Side
    expect(screen.queryByTestId('wild-color-pink')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('wild-color-red'));
    expect(handleSelect).toHaveBeenCalledWith('red');
  });
});
