import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PublicPlayer } from '@uno-ultimate/game-protocol';
import { ArrowLeftRight, User } from 'lucide-react';

interface ForcedSwapModalProps {
  isOpen: boolean;
  eligiblePlayers: readonly PublicPlayer[];
  isLoading?: boolean;
  onSelectTarget: (targetPlayerId: string) => void;
}

export const ForcedSwapModal: React.FC<ForcedSwapModalProps> = ({
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
          className="glass-panel w-full max-w-md p-6 rounded-3xl border border-emerald-500/50 shadow-2xl relative overflow-hidden"
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500" />

          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-1">
              <ArrowLeftRight className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-2xl text-white tracking-tight">
              Wild Forced Swap!
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Per official Mattel UNO All Wild (HHL33) rules, choose which player to swap your entire hand with:
            </p>
          </div>

          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {eligiblePlayers.map((player) => (
              <button
                key={player.id}
                data-testid={`forced-swap-target-${player.id}`}
                disabled={isLoading}
                onClick={() => onSelectTarget(player.id)}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-700/80 hover:border-emerald-400/80 transition-all text-left group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 group-hover:bg-emerald-500/20 text-slate-300 group-hover:text-emerald-400 flex items-center justify-center font-bold transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-sm text-white group-hover:text-emerald-300 transition-colors">
                      {player.username}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
                    </div>
                  </div>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 group-hover:bg-emerald-500 text-emerald-400 group-hover:text-slate-950 font-display font-bold text-xs transition-colors">
                  Swap Hand
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
