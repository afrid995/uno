import React from 'react';
import { Card } from '@uno-ultimate/game-protocol';
import { PlayingCard } from './PlayingCard';
import { motion } from 'framer-motion';

export interface PlayerHandProps {
  hand: readonly Card[];
  playableCardIds: readonly string[];
  isCurrentTurn: boolean;
  onCardClick: (card: Card) => void;
  className?: string;
}

export const PlayerHand: React.FC<PlayerHandProps> = ({
  hand,
  playableCardIds,
  isCurrentTurn,
  onCardClick,
  className = '',
}) => {
  return (
    <div className={`w-full overflow-x-auto pb-4 pt-2 px-4 no-scrollbar ${className}`}>
      <div className="flex items-center justify-center min-w-max mx-auto -space-x-3 sm:-space-x-5">
        {hand.map((card, index) => {
          const isPlayable = isCurrentTurn && playableCardIds.includes(card.id);

          return (
            <motion.div
              key={card.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: index * 0.03, duration: 0.2 }}
              className="relative z-10 hover:z-30 focus:z-30"
            >
              <PlayingCard
                card={card}
                isPlayable={isPlayable}
                size="md"
                onClick={() => onCardClick(card)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};
