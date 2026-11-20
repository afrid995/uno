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

  it('renders cards organized by color group and ascending value regardless of input array order', () => {
    const unsortedCards: Card[] = [
      { id: 'w1', color: null, type: 'wild', value: 'wild', scoreValue: 50, variant: 'classic' },
      { id: 'y9', color: 'yellow', type: 'number', value: '9', scoreValue: 9, variant: 'classic' },
      { id: 'b5', color: 'blue', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
      { id: 'r2', color: 'red', type: 'number', value: '2', scoreValue: 2, variant: 'classic' },
      { id: 'b1', color: 'blue', type: 'number', value: '1', scoreValue: 1, variant: 'classic' },
      { id: 'r0', color: 'red', type: 'number', value: '0', scoreValue: 0, variant: 'classic' },
    ];

    const onCardClick = vi.fn();
    const { container } = render(
      <PlayerHand
        hand={unsortedCards}
        playableCardIds={['r0', 'b1', 'w1']}
        isCurrentTurn={true}
        onCardClick={onCardClick}
      />
    );

    // Cards in DOM should follow: Red 0, Red 2, Blue 1, Blue 5, Yellow 9, Wild
    const renderedCards = container.querySelectorAll('[data-testid="playing-card"]');
    expect(renderedCards.length).toBe(6);
    expect(renderedCards[0].getAttribute('data-card-id')).toBe('r0');
    expect(renderedCards[1].getAttribute('data-card-id')).toBe('r2');
    expect(renderedCards[2].getAttribute('data-card-id')).toBe('b1');
    expect(renderedCards[3].getAttribute('data-card-id')).toBe('b5');
    expect(renderedCards[4].getAttribute('data-card-id')).toBe('y9');
    expect(renderedCards[5].getAttribute('data-card-id')).toBe('w1');
  });

  it('preserves duplicate cards and ensures correct playability for each card in sorted hand', () => {
    const duplicateCards: Card[] = [
      { id: 'r7_b', color: 'red', type: 'number', value: '7', scoreValue: 7, variant: 'classic' },
      { id: 'r7_a', color: 'red', type: 'number', value: '7', scoreValue: 7, variant: 'classic' },
    ];

    const onCardClick = vi.fn();
    const { container } = render(
      <PlayerHand
        hand={duplicateCards}
        playableCardIds={['r7_a']}
        isCurrentTurn={true}
        onCardClick={onCardClick}
      />
    );

    const cardElements = container.querySelectorAll('[data-testid="playing-card"]');
    expect(cardElements.length).toBe(2);
    // r7_a is sorted first (alphabetically by id) and is playable
    expect(cardElements[0].getAttribute('data-card-id')).toBe('r7_a');
    expect(cardElements[1].getAttribute('data-card-id')).toBe('r7_b');
    fireEvent.click(cardElements[0]);
    expect(onCardClick).toHaveBeenCalledWith(duplicateCards[1]); // r7_a

    // r7_b is unplayable, should not invoke click
    onCardClick.mockClear();
    fireEvent.click(cardElements[1]);
    expect(onCardClick).not.toHaveBeenCalled();
  });
});
