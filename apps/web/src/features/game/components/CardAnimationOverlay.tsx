import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useCardAnimationStore } from '../../../stores/cardAnimationStore';
import { PlayingCard } from './PlayingCard';

export const CardAnimationOverlay: React.FC = () => {
  const { flyingCards, removeFlyingCard } = useCardAnimationStore();
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      data-testid="card-animation-overlay"
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      aria-hidden="true"
    >
      <AnimatePresence>
        {flyingCards.map((flying) => {
          const duration = shouldReduceMotion ? 0.05 : 0.35;
          const delay = shouldReduceMotion ? 0 : flying.delay;

          return (
            <motion.div
              key={flying.id}
              data-testid="flying-card"
              data-animation-type={flying.type}
              initial={{
                x: flying.startX,
                y: flying.startY,
                scale: 0.8,
                rotate: flying.rotate,
                opacity: 0.9,
              }}
              animate={{
                x: flying.endX,
                y: flying.endY,
                scale: flying.type === 'PLAY' ? 1.05 : 0.95,
                rotate: flying.rotate * 0.3,
                opacity: 1,
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration,
                delay,
                ease: [0.25, 1, 0.5, 1],
              }}
              onAnimationComplete={() => removeFlyingCard(flying.id)}
              className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 shadow-2xl pointer-events-none"
            >
              {flying.type === 'PLAY' && flying.card ? (
                <PlayingCard card={flying.card} size="md" className="shadow-2xl" />
              ) : (
                <PlayingCard faceDown size="md" className="shadow-2xl" />
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
