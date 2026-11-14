import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicPlayer } from '@uno-ultimate/game-protocol';
import { Target, User } from 'lucide-react';

interface TargetedDrawFourModalProps {
  isOpen: boolean;
  eligiblePlayers: readonly PublicPlayer[];
  isLoading?: boolean;
  onSelectTarget: (targetPlayerId: string) => void;
}

export const TargetedDrawFourModal: React.FC<TargetedDrawFourModalProps> = ({
  isOpen,
  eligiblePlayers,
  isLoading = false,
  onSelectTarget,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="glass-panel w-full max-w-md p-6 rounded-3xl border border-purple-500/50 shadow-2xl relative overflow-hidden"
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-400 via-fuchsia-500 to-indigo-500" />

          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-400 mb-1">
              <Target className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-2xl text-white tracking-tight">
              Flex Wild Draw Four!
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Per official Mattel UNO Flex rules, choose ANY player to target with 4 penalty cards (they can challenge!):
            </p>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {eligiblePlayers.map((player) => (
              <button
                key={player.id}
                data-testid={`targeted-draw-four-target-${player.id}`}
                disabled={isLoading}
                onClick={() => onSelectTarget(player.id)}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 hover:border-purple-400/80 transition-all text-left group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 group-hover:bg-purple-500/20 text-slate-300 group-hover:text-purple-400 flex items-center justify-center font-bold transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-sm text-white group-hover:text-purple-300 transition-colors">
                      {player.username}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
                    </div>
                  </div>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 group-hover:bg-purple-500 text-purple-400 group-hover:text-white font-display font-bold text-xs transition-colors">
                  Target (+4)
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
