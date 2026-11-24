import React, { useMemo } from 'react';
import { Card } from '@uno-ultimate/game-protocol';
import { PlayingCard } from './PlayingCard';
import { motion, useReducedMotion } from 'framer-motion';
import { sortPlayerHand } from '../utils/cardSorting';
import { MOTION_DURATIONS } from '../../../lib/game-motion';

export interface PlayerHandProps {
  hand: readonly Card[];
  playableCardIds: readonly string[];
  isCurrentTurn: boolean;
  onCardClick: (card: Card) => void;
  className?: string;
  cardSize?: 'sm' | 'md' | 'lg';
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
  hand,
  playableCardIds,
  isCurrentTurn,
  onCardClick,
  className = '',
  cardSize = 'md',
}) => {
  const sortedHand = useMemo(() => sortPlayerHand(hand), [hand]);
  const shouldReduceMotion = useReducedMotion();

  // Pointer drag vs tap discrimination to prevent accidental card plays while scrolling on touch devices
  const pointerStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = React.useRef(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    const x = e.clientX ?? 0;
    const y = e.clientY ?? 0;
    pointerStartRef.current = { x, y };
    isDraggingRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const clientX = e.clientX ?? 0;
    const clientY = e.clientY ?? 0;
    const dx = Math.abs(clientX - pointerStartRef.current.x);
    const dy = Math.abs(clientY - pointerStartRef.current.y);
    if (dx > 8 || dy > 8) {
      isDraggingRef.current = true;
    }
  };

  const handlePointerUp = () => {
    pointerStartRef.current = null;
    // Suppress synthetic click right after drag; reset drag flag on next tick
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 60);
  };

  const handleCardClickSafe = (card: Card) => {
    if (isDraggingRef.current) {
      // User was scrolling the hand horizontally, suppress accidental click
      return;
    }
    onCardClick(card);
  };

  // Dynamic spacing based on hand size to support large hands (e.g. 20+ cards in No Mercy)
  const overlapClass =
    sortedHand.length <= 4
      ? '-space-x-2 sm:-space-x-3'
      : sortedHand.length <= 7
      ? '-space-x-4 sm:-space-x-5'
      : sortedHand.length <= 13
      ? '-space-x-6 sm:-space-x-7'
      : '-space-x-7 sm:-space-x-9';

  return (
    <div
      data-testid="player-hand"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative w-full overflow-x-auto pb-3 pt-1 sm:pt-2 px-2 sm:px-4 no-scrollbar overscroll-contain touch-pan-x ${className}`}
    >
      <div className={`flex items-center justify-center min-w-max mx-auto ${overlapClass}`}>
        {sortedHand.map((card, index) => {
          const isPlayable = isCurrentTurn && playableCardIds.includes(card.id);
          const duration = shouldReduceMotion ? MOTION_DURATIONS.reduced : 0.2;
          const delay = shouldReduceMotion ? 0 : Math.min(index * 0.015, 0.15);

          return (
            <motion.div
              key={card.id}
              initial={shouldReduceMotion ? false : { y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay, duration, ease: [0.25, 1, 0.5, 1] }}
              className="relative z-10 hover:z-30 focus:z-30 active:z-30 shrink-0"
            >
              <PlayingCard
                card={card}
                isPlayable={isPlayable}
                size={cardSize}
                onClick={() => handleCardClickSafe(card)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
