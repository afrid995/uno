import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGameStore } from '../../../stores/gameStore';
import { motion, AnimatePresence } from 'framer-motion';

export const MatchResultModal: React.FC = () => {
  const navigate = useNavigate();
  const { roomCode } = useParams<{ roomCode: string }>();
  const { showMatchResultModal, matchWinnerData, gameState } = useGameStore();

  const isVisible = showMatchResultModal || gameState?.status === 'COMPLETED';
  if (!isVisible || !gameState) return null;

  const winner = matchWinnerData || gameState.winner;
  const winnerName = winner?.username || 'Champion';

  // Sort players by cumulative score descending
  const sortedPlayers = [...gameState.players].sort((a, b) => b.score - a.score);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          data-testid="match-result-modal"
          initial={{ opacity: 0, scale: 0.85, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 30 }}
          className="w-full max-w-lg rounded-3xl border-2 border-amber-400 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden"
        >
          {/* Decorative background glow */}
          <div className="absolute -top-20 -left-20 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />

          {/* Trophy Icon */}
          <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 flex items-center justify-center text-4xl shadow-xl shadow-amber-500/30 ring-4 ring-amber-400/30">
            🏆
          </div>

          <div className="inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-widest mb-2">
            Match Finished
          </div>

          <h2 className="text-3xl font-black text-white tracking-tight mb-2">
            {winnerName} is the Champion!
          </h2>

          <p className="text-sm text-slate-300 mb-6 max-w-sm mx-auto">
            Surpassed the official Mattel target of {gameState.targetScore} points across {gameState.roundNumber} rounds of Classic UNO!
          </p>

          {/* Leaderboard */}
          <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 mb-6 space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left mb-3">
              Final Standings
            </h4>
            {sortedPlayers.map((p, idx) => {
              const isWinner = idx === 0;
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;

              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-2.5 rounded-xl text-sm ${
                    isWinner
                      ? 'bg-amber-500/15 border border-amber-500/40 font-bold text-amber-300'
                      : 'bg-slate-900/50 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-bold min-w-6">{medal}</span>
                    <span className="truncate">
                      {p.username} {p.id === gameState.self.id && '(you)'}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-white">
                    {p.score} pts
                  </span>
                </div>
              );
            })}
          </div>

          {/* Navigation buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {roomCode && (
              <button
                onClick={() => navigate(`/lobby/${roomCode}`)}
                className="flex-1 py-3 px-6 rounded-xl font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 active:scale-95 transition-all text-sm shadow-lg shadow-amber-400/20"
              >
                Back to Lobby
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="py-3 px-6 rounded-xl font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 active:scale-95 transition-all text-sm"
            >
              Main Menu
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
