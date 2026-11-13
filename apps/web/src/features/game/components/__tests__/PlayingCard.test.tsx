import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard Component', () => {
  it('renders a face-down card with UNO logo', () => {
    render(<PlayingCard faceDown />);
    expect(screen.getByText('UNO')).toBeInTheDocument();
  });

  it('renders a number card with proper value and color styling', () => {
    const card: Card = {
      id: 'c1',
      color: 'red',
      type: 'number',
      value: '7',
      scoreValue: 7,
      variant: 'classic',
    };

    render(<PlayingCard card={card} isPlayable />);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);
  });

  it('renders an action card with correct symbol', () => {
    const skipCard: Card = {
      id: 'c2',
      color: 'blue',
      type: 'action',
      value: 'skip',
      scoreValue: 20,
      variant: 'classic',
    };

    render(<PlayingCard card={skipCard} />);
    expect(screen.getAllByText('⊘').length).toBeGreaterThan(0);
  });

  it('renders a wild card with WILD text', () => {
    const wildCard: Card = {
      id: 'c3',
      color: null,
      type: 'wild',
      value: 'wild',
      scoreValue: 50,
      variant: 'classic',
    };

    render(<PlayingCard card={wildCard} />);
    expect(screen.getAllByText('WILD').length).toBeGreaterThan(0);
  });

  it('renders a wild draw four card with +4 symbol', () => {
    const wdfCard: Card = {
      id: 'c4',
      color: null,
      type: 'wild',
      value: 'wild_draw_four',
      scoreValue: 50,
      variant: 'classic',
    };

    render(<PlayingCard card={wdfCard} />);
    expect(screen.getAllByText('+4').length).toBeGreaterThan(0);
  });

  it('fires onClick callback when playable', () => {
    const onClick = vi.fn();
    const card: Card = {
      id: 'c5',
      color: 'green',
      type: 'number',
      value: '3',
      scoreValue: 3,
      variant: 'classic',
    };

    render(<PlayingCard card={card} isPlayable onClick={onClick} />);
    const cardEl = screen.getAllByText('3')[0];
    fireEvent.click(cardEl);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onClick when not playable', () => {
    const onClick = vi.fn();
    const card: Card = {
      id: 'c6',
      color: 'yellow',
      type: 'number',
      value: '9',
      scoreValue: 9,
      variant: 'classic',
    };

    render(<PlayingCard card={card} isPlayable={false} onClick={onClick} />);
    const cardEl = screen.getAllByText('9')[0];
    fireEvent.click(cardEl);
    expect(onClick).not.toHaveBeenCalled();
  });
});
