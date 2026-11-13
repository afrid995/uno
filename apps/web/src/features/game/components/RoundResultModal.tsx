import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { motion, AnimatePresence } from 'framer-motion';

export const RoundResultModal: React.FC = () => {
  const {
    showRoundResultModal,
    roundWinnerData,
    gameState,
    isActionLoading,
    startNextRound,
    dismissRoundModal,
  } = useGameStore();

  const isVisible = showRoundResultModal || gameState?.status === 'ROUND_OVER';
  if (!isVisible || !gameState) return null;

  const winnerName = roundWinnerData?.username || gameState.roundWinner?.username || 'Winner';
  const winnerScore = roundWinnerData?.score ?? gameState.roundWinner?.score ?? 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          data-testid="round-result-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-3xl shadow-lg shadow-amber-500/20">
            🎉
          </div>

          <h2 className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">
            Round {gameState.roundNumber} Complete
          </h2>
          <h3 className="text-2xl font-black text-white mb-2">
            {winnerName} Wins the Round!
          </h3>
          <p className="text-sm text-slate-300 mb-6">
            Scored <span className="font-bold text-amber-400 font-mono">+{winnerScore}</span> points from opponents&apos; remaining cards (target: {gameState.targetScore} pts).
          </p>

          {/* Standings table */}
          <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800 mb-6 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left mb-2">
              Cumulative Match Standings
            </h4>
            {gameState.players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-slate-900/60"
              >
                <span className="font-semibold text-slate-200 truncate">
                  {p.username} {p.id === gameState.self.id && '(you)'}
                </span>
                <span className="font-mono font-bold text-amber-400">
                  {p.score} / {gameState.targetScore} pts
                </span>
              </div>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              data-testid="start-next-round-btn"
              onClick={() => startNextRound()}
              disabled={isActionLoading}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 active:scale-95 transition-all text-sm shadow-lg shadow-amber-400/20 disabled:opacity-50"
            >
              {isActionLoading ? 'Dealing Next Round...' : 'Start Next Round'}
            </button>
            <button
              onClick={() => dismissRoundModal()}
              className="py-3 px-4 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-sm"
            >
              View Table
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
