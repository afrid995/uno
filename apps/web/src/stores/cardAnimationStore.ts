import { create } from 'zustand';
import { Card, CardAnimationEvent } from '@uno-ultimate/game-protocol';
import { soundService } from '../lib/sound-service';

export interface ActiveFlyingCard {
  id: string;
  type: 'PLAY' | 'DRAW';
  card?: Card;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delay: number;
  rotate: number;
}

interface CardAnimationState {
  flyingCards: ActiveFlyingCard[];
  processedAnimationIds: Set<string>;

  triggerAnimation: (event: CardAnimationEvent, selfId: string) => void;
  removeFlyingCard: (id: string) => void;
  clearAnimations: () => void;
}

function getElementCenter(
  selector: string,
  fallbackX: number,
  fallbackY: number
): { x: number; y: number } {
  if (typeof document === 'undefined') return { x: fallbackX, y: fallbackY };
  const el = document.querySelector(selector);
  if (!el) return { x: fallbackX, y: fallbackY };
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

export const useCardAnimationStore = create<CardAnimationState>((set, get) => ({
  flyingCards: [],
  processedAnimationIds: new Set<string>(),

  triggerAnimation: (event: CardAnimationEvent, selfId: string) => {
    // 1. Prevent duplicate animation execution
    if (get().processedAnimationIds.has(event.id)) {
      return;
    }

    const nextProcessed = new Set(get().processedAnimationIds);
    nextProcessed.add(event.id);

    // Keep processed IDs set bounded
    if (nextProcessed.size > 200) {
      const arr = Array.from(nextProcessed);
      nextProcessed.clear();
      arr.slice(arr.length - 100).forEach((id) => nextProcessed.add(id));
    }

    const isSelf = event.playerId === selfId;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    const drawPilePos = getElementCenter(
      '[data-testid="draw-pile-btn"], [data-testid="attack-launcher"]',
      windowWidth / 2 - 80,
      windowHeight / 2
    );

    const discardPilePos = getElementCenter(
      '[data-testid="discard-pile"]',
      windowWidth / 2 + 80,
      windowHeight / 2
    );

    const playerHandPos = getElementCenter(
      '[data-testid="player-hand"]',
      windowWidth / 2,
      windowHeight - 90
    );

    const opponentSeatPos = getElementCenter(
      `[data-testid="player-seat"][data-player-id="${event.playerId}"]`,
      windowWidth / 2,
      100
    );

    const newCards: ActiveFlyingCard[] = [];

    if (event.type === 'PLAY') {
      const startPos = isSelf ? playerHandPos : opponentSeatPos;
      const endPos = discardPilePos;

      // Restrained tactile sound cue
      const cardVal = event.card?.value;
      if (cardVal === 'skip' || cardVal === 'skip_everyone' || cardVal === 'wild_skip' || cardVal === 'flex_skip') {
        soundService.play('skip');
      } else if (cardVal === 'reverse' || cardVal === 'wild_reverse' || cardVal === 'flex_reverse') {
        soundService.play('reverse');
      } else if (cardVal === 'wild' || (typeof cardVal === 'string' && cardVal.startsWith('wild_'))) {
        soundService.play('wild_color');
      } else {
        soundService.play('card_play');
      }

      newCards.push({
        id: `${event.id}-0`,
        type: 'PLAY',
        card: event.card,
        startX: startPos.x,
        startY: startPos.y,
        endX: endPos.x,
        endY: endPos.y,
        delay: 0,
        rotate: (Math.random() - 0.5) * 20,
      });
    } else if (event.type === 'DRAW') {
      const startPos = drawPilePos;
      const endPos = isSelf ? playerHandPos : opponentSeatPos;
      const count = Math.min(Math.max(1, event.cardCount || 1), 16);

      if (count > 1) {
        soundService.play('draw_penalty');
      } else {
        soundService.play('card_draw');
      }

      for (let i = 0; i < count; i++) {
        newCards.push({
          id: `${event.id}-${i}`,
          type: 'DRAW',
          card: event.card,
          startX: startPos.x,
          startY: startPos.y,
          endX: endPos.x + (Math.random() - 0.5) * 30,
          endY: endPos.y,
          delay: i * 0.07,
          rotate: (Math.random() - 0.5) * 25,
        });
      }
    }

    set((state) => ({
      flyingCards: [...state.flyingCards, ...newCards],
      processedAnimationIds: nextProcessed,
    }));
  },

  removeFlyingCard: (id: string) => {
    set((state) => ({
      flyingCards: state.flyingCards.filter((c) => c.id !== id),
    }));
  },

  clearAnimations: () => {
    set({ flyingCards: [], processedAnimationIds: new Set<string>() });
  },
}));
