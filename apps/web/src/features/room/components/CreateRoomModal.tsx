import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Sparkles, Loader2, PlusCircle } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose }) => {
  const [maxPlayers, setMaxPlayers] = useState<number>(ROOM_RULES.DEFAULT_MAX_PLAYERS);
  const [variant, setVariant] = useState<'classic' | 'uno_flip' | 'uno_show_em_no_mercy'>('classic');
  const { createRoom, isLoading, error, clearError } = useRoomStore();
  const navigate = useNavigate();

  const handleSelectVariant = (newVariant: 'classic' | 'uno_flip' | 'uno_show_em_no_mercy') => {
    setVariant(newVariant);
    if (newVariant === 'uno_show_em_no_mercy' && maxPlayers > 6) {
      setMaxPlayers(6);
    }
  };

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const payload = variant !== 'classic'
      ? { maxPlayers, settings: { variant } }
      : { maxPlayers };
    const success = await createRoom(payload);
    if (success) {
      const room = useRoomStore.getState().room;
      if (room) {
        onClose();
        navigate(`/room/${room.roomCode}`);
      }
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="glass-panel w-full max-w-md p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-2xl relative overflow-hidden"
        >
          {/* Header Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-red via-uno-yellow to-uno-blue" />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-uno-red/10 border border-uno-red/30 flex items-center justify-center text-uno-red">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white">Create Private Room</h3>
                <p className="text-xs text-slate-400">Host a game with your friends</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            {/* Game Variant Selector */}
            <div className="space-y-3">
              <label className="font-medium text-slate-300 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-uno-yellow" />
                  Game Variant
                </span>
                <span className="font-mono text-xs text-amber-400 font-bold uppercase">
                  {variant === 'classic'
                    ? 'Classic UNO'
                    : variant === 'uno_flip'
                    ? 'UNO Flip!'
                    : "UNO Show 'em No Mercy"}
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  data-testid="variant-select-classic"
                  onClick={() => handleSelectVariant('classic')}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    variant === 'classic'
                      ? 'bg-gradient-to-br from-uno-red/20 to-uno-yellow/10 border-uno-red text-white shadow-glow'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5">Classic UNO</div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Official Mattel 42001 rules (108 cards, single-sided).
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-uno-flip"
                  onClick={() => handleSelectVariant('uno_flip')}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    variant === 'uno_flip'
                      ? 'bg-gradient-to-br from-purple-600/30 to-teal-500/20 border-purple-400 text-white shadow-glow'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    UNO Flip!
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/30 text-purple-300 font-mono">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Dual-sided cards, Light &amp; Dark sides, Flip mechanic.
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-no-mercy"
                  onClick={() => handleSelectVariant('uno_show_em_no_mercy')}
                  className={`p-3 rounded-2xl text-left border transition-all ${
                    variant === 'uno_show_em_no_mercy'
                      ? 'bg-gradient-to-br from-rose-700/30 to-orange-600/20 border-rose-500 text-white shadow-glow'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    No Mercy
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/30 text-rose-300 font-mono">NEW</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel HWV18 rules (168 cards, stacking, 7-0 swaps, 25-card mercy).
                  </div>
                </button>
              </div>
            </div>

            {/* Max Players Selector */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <label className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-uno-yellow" />
                  Player Capacity
                </label>
                <span className="font-mono text-sm text-uno-yellow font-bold">
                  {maxPlayers} Players
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                {(variant === 'uno_show_em_no_mercy' ? [2, 3, 4, 5, 6] : [2, 4, 6, 8, 10]).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPlayers(num)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-display border transition-all ${
                      maxPlayers === num
                        ? 'bg-uno-red text-white border-uno-red shadow-glow'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                {variant === 'uno_show_em_no_mercy'
                  ? 'UNO Show ’em No Mercy strictly supports 2 to 6 players.'
                  : 'Mattel standard rooms support 2 to 10 players (default 6).'}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="confirm-create-room-btn"
                disabled={isLoading}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-display text-white bg-gradient-to-r from-uno-red to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Create Room</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
