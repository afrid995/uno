import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard Component — UNO Flip Extensions', () => {
  it('renders Dark Side colors and symbols accurately', () => {
    const darkDrawFive: Card = {
      id: 'flip_c_010',
      color: 'pink',
      value: 'draw_five',
      type: 'action',
      scoreValue: 20,
      variant: 'uno_flip',
      currentSide: 'DARK',
    };

    const { rerender } = render(<PlayingCard card={darkDrawFive} />);
    const cardEl = screen.getByTestId('playing-card');
    expect(cardEl).toHaveAttribute('data-card-color', 'pink');
    expect(cardEl).toHaveAttribute('data-card-value', 'draw_five');
    expect(cardEl).toHaveAttribute('data-card-side', 'DARK');
    expect(screen.getAllByText('+5').length).toBeGreaterThanOrEqual(1);

    // Test Skip Everyone
    const darkSkipEveryone: Card = {
      id: 'flip_c_020',
      color: 'teal',
      value: 'skip_everyone',
      type: 'action',
      scoreValue: 20,
      variant: 'uno_flip',
      currentSide: 'DARK',
    };
    rerender(<PlayingCard card={darkSkipEveryone} />);
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-color', 'teal');
    expect(screen.getAllByText('⊘👥').length).toBeGreaterThanOrEqual(1);

    // Test Flip Card
    const flipCard: Card = {
      id: 'flip_c_030',
      color: 'orange',
      value: 'flip',
      type: 'action',
      scoreValue: 20,
      variant: 'uno_flip',
      currentSide: 'DARK',
    };
    rerender(<PlayingCard card={flipCard} />);
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-value', 'flip');
    expect(screen.getAllByText('FLIP').length).toBeGreaterThanOrEqual(1);

    // Test Wild Draw Color
    const darkWildDrawColor: Card = {
      id: 'flip_c_040',
      color: null,
      value: 'wild_draw_color',
      type: 'wild',
      scoreValue: 60,
      variant: 'uno_flip',
      currentSide: 'DARK',
    };
    rerender(<PlayingCard card={darkWildDrawColor} />);
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-color', 'wild');
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-value', 'wild_draw_color');
  });

  it('renders Light Side Draw One and Wild Draw Two correctly', () => {
    const lightDrawOne: Card = {
      id: 'flip_c_005',
      color: 'red',
      value: 'draw_one',
      type: 'action',
      scoreValue: 20,
      variant: 'uno_flip',
      currentSide: 'LIGHT',
    };

    const { rerender } = render(<PlayingCard card={lightDrawOne} />);
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-side', 'LIGHT');
    expect(screen.getAllByText('+1').length).toBeGreaterThanOrEqual(1);

    const lightWildDrawTwo: Card = {
      id: 'flip_c_050',
      color: null,
      value: 'wild_draw_two',
      type: 'wild',
      scoreValue: 50,
      variant: 'uno_flip',
      currentSide: 'LIGHT',
    };
    rerender(<PlayingCard card={lightWildDrawTwo} />);
    expect(screen.getByTestId('playing-card')).toHaveAttribute('data-card-value', 'wild_draw_two');
  });
});
