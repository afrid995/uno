import React from 'react';
import { motion } from 'framer-motion';
import { Flame, ShieldAlert, Layers } from 'lucide-react';
import { PublicPendingStack } from '@uno-ultimate/game-protocol';

interface StackPenaltyBannerProps {
  pendingStack: PublicPendingStack;
  isTarget: boolean;
  canStack: boolean;
  targetUsername: string;
  isLoading?: boolean;
  onAcceptPenalty: () => void;
}

export const StackPenaltyBanner: React.FC<StackPenaltyBannerProps> = ({
  pendingStack,
  isTarget,
  canStack,
  targetUsername,
  isLoading = false,
  onAcceptPenalty,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      className={`mx-auto max-w-xl w-full p-4 rounded-2xl border shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 z-30 ${
        isTarget
          ? 'bg-rose-950/90 border-rose-500/80 text-white ring-2 ring-rose-500/50 shadow-glow-red'
          : 'bg-slate-900/90 border-amber-500/50 text-slate-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold ${
            isTarget ? 'bg-rose-600 text-white animate-bounce' : 'bg-amber-500/20 text-amber-400'
          }`}
        >
          {isTarget ? <Flame className="w-7 h-7" /> : <Layers className="w-6 h-6" />}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-display font-black text-sm tracking-wide uppercase text-amber-400">
              Stack Attack
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-black bg-rose-600 text-white shadow-sm">
              +{pendingStack.accumulatedPenalty} CARDS
            </span>
          </div>

          <p className="text-xs text-slate-300 mt-0.5">
            {isTarget ? (
              canStack ? (
                <>Play an equal or higher Draw card (<strong>+{pendingStack.lastStackedValue}+</strong>) to stack, or take the penalty:</>
              ) : (
                <>No eligible Draw card to stack! You must accept the penalty cards.</>
              )
            ) : (
              <>Waiting for <strong>{targetUsername}</strong> to stack (+{pendingStack.lastStackedValue}+) or take the penalty...</>
            )}
          </p>
        </div>
      </div>

      {isTarget && (
        <button
          data-testid="accept-stack-penalty-btn"
          disabled={isLoading}
          onClick={onAcceptPenalty}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 font-display font-bold text-xs uppercase tracking-wider text-white shadow-lg border border-rose-400 flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Accept (+{pendingStack.accumulatedPenalty})</span>
        </button>
      )}
    </motion.div>
  );
};
