import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@uno-ultimate/game-protocol';
import { ArrowLeftRight, Users, Share2 } from 'lucide-react';
import { PlayingCard } from './PlayingCard';

export interface TeamPassModalProps {
  isOpen: boolean;
  mode: 'INITIAL_PASS' | 'PASSING_SYMBOL' | 'HAND_SPLIT';
  hand: readonly Card[];
  cardsCountToPass?: number;
  isLoading?: boolean;
  onSubmitPass: (cardIds: string[]) => void;
}

export const TeamPassModal: React.FC<TeamPassModalProps> = ({
  isOpen,
  mode,
  hand,
  cardsCountToPass = 1,
  isLoading = false,
  onSubmitPass,
}) => {
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleSelectCard = (cardId: string) => {
    if (cardsCountToPass === 1) {
      setSelectedCardIds([cardId]);
      return;
    }

    if (selectedCardIds.includes(cardId)) {
      setSelectedCardIds(selectedCardIds.filter((id) => id !== cardId));
    } else {
      if (selectedCardIds.length < cardsCountToPass) {
        setSelectedCardIds([...selectedCardIds, cardId]);
      }
    }
  };

  const handleConfirm = () => {
    if (selectedCardIds.length === cardsCountToPass) {
      onSubmitPass(selectedCardIds);
      setSelectedCardIds([]);
    }
  };

  const title =
    mode === 'INITIAL_PASS'
      ? 'Initial Team Card Pass'
      : mode === 'PASSING_SYMBOL'
      ? 'Passing Symbol Card Swap'
      : 'Partner Hand-Off Split';

  const subtitle =
    mode === 'INITIAL_PASS'
      ? 'Per official Mattel UNO Teams (HXT58) rules, pass 1 card to your teammate before regular play begins.'
      : mode === 'PASSING_SYMBOL'
      ? 'A card with the Passing Symbol was played. Both you and your teammate pass 1 card to each other.'
      : `You emptied your hand! Select ${cardsCountToPass} ${cardsCountToPass === 1 ? 'card' : 'cards'} from your hand to pass to your teammate.`;

  const isSubmitDisabled = isLoading || selectedCardIds.length !== cardsCountToPass;

  return (
    <AnimatePresence>
      <div
        data-testid="team-pass-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-lg p-6 rounded-2xl bg-surface-card border border-white/[0.08] shadow-modal relative"
        >
          <div className="text-center space-y-2 mb-5">
            <div className="inline-flex p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 mb-1">
              {mode === 'INITIAL_PASS' ? (
                <Users className="w-7 h-7" />
              ) : mode === 'PASSING_SYMBOL' ? (
                <ArrowLeftRight className="w-7 h-7" />
              ) : (
                <Share2 className="w-7 h-7" />
              )}
            </div>
            <h3 className="font-display font-bold text-xl text-white tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {subtitle}
            </p>
          </div>

          <div className="text-center text-xs font-mono font-bold text-cyan-300 mb-3">
            Selected {selectedCardIds.length} of {cardsCountToPass} cards
          </div>

          {/* Cards to choose from */}
          <div className="flex flex-wrap justify-center gap-2 max-h-60 overflow-y-auto p-2 bg-surface-panel rounded-xl border border-white/[0.06]">
            {hand.map((card) => {
              const isSelected = selectedCardIds.includes(card.id);
              return (
                <div
                  key={card.id}
                  data-testid={`team-pass-card-${card.id}`}
                  onClick={() => toggleSelectCard(card.id)}
                  className={`cursor-pointer transition-all rounded-xl transform ${
                    isSelected
                      ? 'ring-2 ring-cyan-400 scale-105 shadow-card'
                      : 'hover:scale-102 opacity-90 hover:opacity-100'
                  }`}
                >
                  <PlayingCard card={card} size="sm" isPlayable={false} />
                </div>
              );
            })}
          </div>

          {/* Submit button */}
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              data-testid="confirm-team-pass-btn"
              disabled={isSubmitDisabled}
              onClick={handleConfirm}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold font-display text-white bg-blue-600 hover:bg-blue-500 shadow-card disabled:opacity-40 transition-all cursor-pointer"
            >
              {isLoading
                ? 'Passing...'
                : `Pass ${cardsCountToPass} ${cardsCountToPass === 1 ? 'Card' : 'Cards'} to Partner`}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
