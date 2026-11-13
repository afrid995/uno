import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerHand } from '../PlayerHand';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayerHand Component', () => {
  const sampleCards: Card[] = [
    { id: 'c1', color: 'red', type: 'number', value: '1', scoreValue: 1, variant: 'classic' },
    { id: 'c2', color: 'blue', type: 'number', value: '2', scoreValue: 2, variant: 'classic' },
    { id: 'c3', color: 'yellow', type: 'action', value: 'reverse', scoreValue: 20, variant: 'classic' },
  ];

  it('renders all cards passed in hand', () => {
    const onCardClick = vi.fn();
    render(
      <PlayerHand
        hand={sampleCards}
        playableCardIds={['c1']}
        isCurrentTurn={true}
        onCardClick={onCardClick}
      />
    );

    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('⇄').length).toBeGreaterThan(0);
  });

  it('allows clicking playable card on current turn', () => {
    const onCardClick = vi.fn();
    render(
      <PlayerHand
        hand={sampleCards}
        playableCardIds={['c1']}
        isCurrentTurn={true}
        onCardClick={onCardClick}
      />
    );

    const playableCard = screen.getAllByText('1')[0];
    fireEvent.click(playableCard);
    expect(onCardClick).toHaveBeenCalledWith(sampleCards[0]);
  });

  it('does not trigger onCardClick for unplayable card', () => {
    const onCardClick = vi.fn();
    render(
      <PlayerHand
        hand={sampleCards}
        playableCardIds={['c1']}
        isCurrentTurn={true}
        onCardClick={onCardClick}
      />
    );

    const unplayableCard = screen.getAllByText('2')[0];
    fireEvent.click(unplayableCard);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
