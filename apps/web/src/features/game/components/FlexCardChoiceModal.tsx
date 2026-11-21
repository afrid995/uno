import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@uno-ultimate/game-protocol';
import { Zap, CheckCircle2, X } from 'lucide-react';
import { PlayingCard } from './PlayingCard';

interface FlexCardChoiceModalProps {
  isOpen: boolean;
  card: Card | null;
  isLoading?: boolean;
  onChooseRegular: () => void;
  onChooseFlex: () => void;
  onClose: () => void;
}

export const FlexCardChoiceModal: React.FC<FlexCardChoiceModalProps> = ({
  isOpen,
  card,
  isLoading = false,
  onChooseRegular,
  onChooseFlex,
  onClose,
}) => {
  if (!isOpen || !card) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-md p-6 rounded-2xl bg-surface-card border border-white/[0.08] shadow-modal relative"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white bg-surface-panel hover:bg-surface-elevated border border-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-1">
              <Zap className="w-7 h-7" />
            </div>
            <h3 className="font-display font-bold text-xl text-white tracking-tight">
              Play Regular or Flex?
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Your Power Card is active! Choose how you would like to play this card:
            </p>
          </div>

          {/* Card preview */}
          <div className="flex justify-center mb-6">
            <PlayingCard card={card} size="lg" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Regular mode button */}
            <button
              data-testid="flex-choice-regular"
              disabled={isLoading}
              onClick={onChooseRegular}
              className="p-4 rounded-xl bg-surface-panel hover:bg-surface-elevated border border-white/[0.08] hover:border-white/[0.15] text-left transition-all group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-slate-400 group-hover:text-white" />
                <span className="font-display font-bold text-sm text-white">Play Regular</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-tight">
                Use regular color/action. Power Card stays <strong className="text-emerald-400">Green</strong>.
              </p>
            </button>

            {/* Flex mode button */}
            <button
              data-testid="flex-choice-flex"
              disabled={isLoading}
              onClick={onChooseFlex}
              className="p-4 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-500/60 hover:border-emerald-400 text-left transition-all shadow-card group cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-emerald-400 group-hover:text-emerald-300" />
                <span className="font-display font-bold text-sm text-emerald-300">Play Flex</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-tight">
                Use flex color/action. Power Card flips to <strong className="text-rose-400">Red (Used)</strong>.
              </p>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
