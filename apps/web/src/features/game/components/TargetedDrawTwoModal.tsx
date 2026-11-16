import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicPlayer } from '@uno-ultimate/game-protocol';
import { Target, User } from 'lucide-react';

interface TargetedDrawTwoModalProps {
  isOpen: boolean;
  eligiblePlayers: readonly PublicPlayer[];
  isLoading?: boolean;
  onSelectTarget: (targetPlayerId: string) => void;
}

export const TargetedDrawTwoModal: React.FC<TargetedDrawTwoModalProps> = ({
  isOpen,
  eligiblePlayers,
  isLoading = false,
  onSelectTarget,
}) => {
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelect = (playerId: string) => {
    if (isLoading) return;
    setActiveTargetId(playerId);
    onSelectTarget(playerId);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="glass-panel w-full max-w-md p-6 rounded-3xl border border-cyan-500/50 shadow-2xl relative overflow-hidden"
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-500" />

          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 mb-1">
              <Target className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-2xl text-white tracking-tight">
              Targeted Draw Two!
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Per official Mattel UNO All Wild (HHL33) rules, choose any player to draw 2 cards from the draw pile:
            </p>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {eligiblePlayers.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
                No eligible opponents available to target.
              </div>
            ) : (
              eligiblePlayers.map((player) => (
                <button
                  key={player.id}
                  data-testid={`targeted-draw-target-${player.id}`}
                  disabled={isLoading}
                  onClick={() => handleSelect(player.id)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 hover:border-cyan-400/80 transition-all text-left group cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 group-hover:bg-cyan-500/20 text-slate-300 group-hover:text-cyan-400 flex items-center justify-center font-bold transition-colors">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-display font-bold text-sm text-white group-hover:text-cyan-300 transition-colors">
                        {player.username}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
                      </div>
                    </div>
                  </div>

                  <div className="px-3 py-1.5 rounded-xl bg-cyan-500/10 group-hover:bg-cyan-500 text-cyan-400 group-hover:text-slate-950 font-display font-bold text-xs transition-colors flex items-center gap-1.5">
                    {isLoading && activeTargetId === player.id ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                        <span>Targeting...</span>
                      </>
                    ) : (
                      <span>Target (+2)</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
