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
      data-testid="stack-penalty-banner"
      initial={{ opacity: 0, scale: 0.95, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      className={`mx-auto max-w-xl w-full p-4 rounded-2xl border shadow-modal backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4 z-30 ${
        isTarget
          ? 'bg-surface-card border-rose-500/80 text-white shadow-card'
          : 'bg-surface-card border-amber-400/50 text-slate-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 font-bold ${
            isTarget ? 'bg-red-600 text-white shadow-card' : 'bg-surface-panel text-amber-400 border border-white/[0.08]'
          }`}
        >
          {isTarget ? <Flame className="w-6 h-6" /> : <Layers className="w-6 h-6" />}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-sm tracking-wide uppercase text-amber-300">
              Stack Attack
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-red-600 text-white shadow-card">
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
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 font-display font-bold text-xs uppercase tracking-wider text-white shadow-card border border-red-400/50 flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Accepting...</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4" />
              <span>Accept (+{pendingStack.accumulatedPenalty})</span>
            </>
          )}
        </button>
      )}
    </motion.div>
  );
};
