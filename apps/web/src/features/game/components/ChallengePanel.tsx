import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { PlayingCard } from './PlayingCard';
import { motion } from 'framer-motion';

export const ChallengePanel: React.FC = () => {
  const {
    gameState,
    isActionLoading,
    acceptWildDrawFour,
    challengeWildDrawFour,
  } = useGameStore();

  if (!gameState) return null;

  const { self, pendingActionState, inspectedChallengedHand } = gameState;
  const isTargeted = self?.isTargetedByWildDrawFour;

  // Find offender name
  const offender = pendingActionState
    ? gameState.players.find((p) => p.id === pendingActionState.playedByPlayerId)
    : null;
  const offenderName = offender?.username || 'Opponent';

  return (
    <div className="w-full max-w-xl mx-auto my-2">
      {/* Inspected Hand View (Visible only to challenger after challenge) */}
      {inspectedChallengedHand && inspectedChallengedHand.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-4 p-4 rounded-xl border border-amber-500/50 bg-slate-900/95 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Hand Inspection (Visible Only To You)
            </h4>
            <span className="text-xs text-slate-400">
              {inspectedChallengedHand.length} cards held
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3">
            Official Mattel 42001 verification: Inspected hand of {offenderName}.
          </p>
          <div className="flex flex-wrap gap-2 justify-center max-h-48 overflow-y-auto p-1 bg-slate-950/60 rounded-lg">
            {inspectedChallengedHand.map((card) => (
              <PlayingCard key={card.id} card={card} size="sm" />
            ))}
          </div>
        </motion.div>
      )}

      {/* Target Decision Box */}
      {isTargeted && pendingActionState && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border-2 border-rose-500/80 bg-gradient-to-b from-rose-950/90 via-slate-900/95 to-slate-950 shadow-2xl text-center backdrop-blur-md"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider mb-2">
            Wild Draw Four Played Against You
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white mb-2">
            {offenderName} played a Wild Draw Four!
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 mb-4 max-w-md mx-auto leading-relaxed">
            Per Mattel 42001 rules: If they played illegally (held a matching color card), they must draw 4. If they played legally, you must draw 6 cards (4 + 2 penalty) and lose your turn!
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={() => acceptWildDrawFour()}
              disabled={isActionLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-sm shadow-md disabled:opacity-50"
            >
              Accept (+4 Cards & Skip)
            </button>
            <button
              onClick={() => challengeWildDrawFour()}
              disabled={isActionLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-black text-white bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 active:scale-95 transition-all text-sm shadow-lg shadow-rose-900/40 ring-2 ring-rose-400 disabled:opacity-50"
            >
              ⚔️ Challenge Legality
            </button>
          </div>
        </motion.div>
      )}

      {/* Waiting Indicator for Other Players */}
      {!isTargeted && pendingActionState && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/30 text-center text-xs text-amber-200 animate-pulse">
          Waiting for victim to accept or challenge {offenderName}&apos;s Wild Draw Four...
        </div>
      )}
    </div>
  );
};
