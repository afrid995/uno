import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CardAnimationOverlay } from '../CardAnimationOverlay';
import { useCardAnimationStore } from '../../../../stores/cardAnimationStore';
import { Card, CardAnimationEvent } from '@uno-ultimate/game-protocol';

describe('Card Movement Animations', () => {
  beforeEach(() => {
    act(() => {
      useCardAnimationStore.getState().clearAnimations();
    });
    vi.clearAllMocks();
  });

  describe('useCardAnimationStore', () => {
    const sampleCard: Card = {
      id: 'card_red_7',
      color: 'red',
      type: 'number',
      value: '7',
      scoreValue: 7,
      variant: 'classic',
    };

    it('starts with empty flying cards', () => {
      const state = useCardAnimationStore.getState();
      expect(state.flyingCards).toEqual([]);
      expect(state.processedAnimationIds.size).toBe(0);
    });

    it('triggers a PLAY animation for the active player', () => {
      const playEvent: CardAnimationEvent = {
        id: 'match-1-play-1',
        type: 'PLAY',
        playerId: 'p1',
        card: sampleCard,
        cardCount: 1,
        sequenceNumber: 1,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(playEvent, 'p1');
      });

      const cards = useCardAnimationStore.getState().flyingCards;
      expect(cards.length).toBe(1);
      expect(cards[0].type).toBe('PLAY');
      expect(cards[0].card).toEqual(sampleCard);
      expect(cards[0].delay).toBe(0);
      expect(useCardAnimationStore.getState().processedAnimationIds.has('match-1-play-1')).toBe(true);
    });

    it('triggers a staggered multi-card DRAW animation for penalty draws', () => {
      const drawEvent: CardAnimationEvent = {
        id: 'match-1-draw-penalty-4',
        type: 'DRAW',
        playerId: 'p2',
        cardCount: 4,
        sequenceNumber: 2,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(drawEvent, 'p1');
      });

      const cards = useCardAnimationStore.getState().flyingCards;
      expect(cards.length).toBe(4);
      cards.forEach((card, index) => {
        expect(card.type).toBe('DRAW');
        expect(card.id).toBe(`match-1-draw-penalty-4-${index}`);
        expect(card.delay).toBeCloseTo(index * 0.07, 3);
      });
    });

    it('deduplicates identical animation events received multiple times', () => {
      const event: CardAnimationEvent = {
        id: 'match-1-duplicate-check',
        type: 'PLAY',
        playerId: 'p1',
        card: sampleCard,
        cardCount: 1,
        sequenceNumber: 3,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(event, 'p1');
      });
      expect(useCardAnimationStore.getState().flyingCards.length).toBe(1);

      // Re-trigger with same ID
      act(() => {
        useCardAnimationStore.getState().triggerAnimation(event, 'p1');
      });
      expect(useCardAnimationStore.getState().flyingCards.length).toBe(1);
    });

    it('removes a flying card when animation is finished', () => {
      const playEvent: CardAnimationEvent = {
        id: 'match-1-removal-test',
        type: 'PLAY',
        playerId: 'p1',
        card: sampleCard,
        cardCount: 1,
        sequenceNumber: 4,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(playEvent, 'p1');
      });

      const cardId = useCardAnimationStore.getState().flyingCards[0].id;
      act(() => {
        useCardAnimationStore.getState().removeFlyingCard(cardId);
      });

      expect(useCardAnimationStore.getState().flyingCards.length).toBe(0);
    });
  });

  describe('CardAnimationOverlay Component', () => {
    it('renders overlay container without crashing when empty', () => {
      render(<CardAnimationOverlay />);
      expect(screen.getByTestId('card-animation-overlay')).toBeInTheDocument();
      expect(screen.queryByTestId('flying-card')).toBeNull();
    });

    it('renders flying card element when card is in flight', () => {
      const event: CardAnimationEvent = {
        id: 'overlay-test-play',
        type: 'PLAY',
        playerId: 'p1',
        card: {
          id: 'card_blue_skip',
          color: 'blue',
          type: 'action',
          value: 'skip',
          scoreValue: 20,
          variant: 'classic',
        },
        cardCount: 1,
        sequenceNumber: 5,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(event, 'p1');
      });

      render(<CardAnimationOverlay />);
      const flyingCard = screen.getByTestId('flying-card');
      expect(flyingCard).toBeInTheDocument();
      expect(flyingCard).toHaveAttribute('data-animation-type', 'PLAY');
    });

    it('renders face-down cards during draw animation', () => {
      const drawEvent: CardAnimationEvent = {
        id: 'overlay-test-draw',
        type: 'DRAW',
        playerId: 'p1',
        cardCount: 2,
        sequenceNumber: 6,
      };

      act(() => {
        useCardAnimationStore.getState().triggerAnimation(drawEvent, 'p1');
      });

      render(<CardAnimationOverlay />);
      const flyingCards = screen.getAllByTestId('flying-card');
      expect(flyingCards.length).toBe(2);
      expect(screen.getAllByText('UNO').length).toBeGreaterThan(0);
    });
  });
});
