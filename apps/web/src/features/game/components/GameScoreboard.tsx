import React, { useState } from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { motion, AnimatePresence } from 'framer-motion';

export const GameScoreboard: React.FC = () => {
  const { gameState } = useGameStore();
  const [isOpen, setIsOpen] = useState(false);

  if (!gameState) return null;

  const {
    players,
    roundNumber,
    targetScore,
    dealerIndex,
    currentTurnGuestId,
    turnDirection,
    self,
  } = gameState;

  return (
    <div className="relative z-20">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-semibold text-slate-200 transition-colors shadow-sm backdrop-blur-xs"
        aria-label="Toggle Scoreboard"
      >
        <span className="text-amber-400">🏆</span>
        <span>Round {roundNumber}</span>
        <span className="text-slate-500">|</span>
        <span className="text-slate-400">Target {targetScore}</span>
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown / Popover scoreboard */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl bg-slate-900/95 border border-slate-700/80 shadow-2xl p-4 backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Match Standings
                </h4>
                <div className="text-[11px] text-slate-500">
                  Target: {targetScore} pts • Direction: {turnDirection}
                </div>
              </div>
              <div className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                R{roundNumber}
              </div>
            </div>

            <div className="space-y-2">
              {players.map((player, idx) => {
                const isCurrentTurn = player.id === currentTurnGuestId;
                const isDealer = idx === dealerIndex;
                const isSelf = player.id === self.id;

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                      isCurrentTurn
                        ? 'bg-amber-500/15 border border-amber-500/30 text-white'
                        : isSelf
                        ? 'bg-slate-800/60 border border-slate-700/60 text-slate-200'
                        : 'bg-slate-950/40 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCurrentTurn && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      )}
                      <div className="truncate font-semibold flex items-center gap-1.5">
                        <span className="truncate">{player.username}</span>
                        {isSelf && (
                          <span className="text-[10px] text-slate-400 font-normal">
                            (you)
                          </span>
                        )}
                        {isDealer && (
                          <span className="text-[9px] px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                            D
                          </span>
                        )}
                        {player.hasDeclaredUno && !player.isEliminated && (
                          <span className="text-[9px] px-1 py-0.2 bg-rose-500/20 text-rose-300 rounded border border-rose-500/30 font-black">
                            UNO
                          </span>
                        )}
                        {player.isEliminated && (
                          <span className="text-[9px] px-1 py-0.2 bg-rose-950 text-rose-300 rounded border border-rose-700/60 font-black">
                            ELIMINATED
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 font-mono">
                      <span className="text-slate-400 text-[11px]">
                        {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
                      </span>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-amber-400 min-w-8 text-right">
                          {player.score} pts
                        </span>
                        {player.cumulativeScore !== undefined && (
                          <span className="text-[10px] text-slate-400 min-w-8 text-right">
                            Total: {player.cumulativeScore}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
