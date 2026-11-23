import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Loader2, PlusCircle } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose }) => {
  const [maxPlayers, setMaxPlayers] = useState<number>(ROOM_RULES.DEFAULT_MAX_PLAYERS);
  const [variant, setVariant] = useState<'classic' | 'uno_flip' | 'uno_show_em_no_mercy' | 'uno_all_wild' | 'uno_flex' | 'uno_teams' | 'uno_attack'>('classic');
  const [attackCustomizableCount, setAttackCustomizableCount] = useState<1 | 3>(3);
  const { createRoom, isLoading, error, clearError } = useRoomStore();
  const navigate = useNavigate();

  const handleSelectVariant = (newVariant: 'classic' | 'uno_flip' | 'uno_show_em_no_mercy' | 'uno_all_wild' | 'uno_flex' | 'uno_teams' | 'uno_attack') => {
    setVariant(newVariant);
    if (newVariant === 'uno_show_em_no_mercy' && maxPlayers > 6) {
      setMaxPlayers(6);
    } else if (newVariant === 'uno_flex' && maxPlayers > 8) {
      setMaxPlayers(8);
    } else if (newVariant === 'uno_teams' && (maxPlayers < 4 || maxPlayers > 8 || maxPlayers % 2 !== 0)) {
      setMaxPlayers(4);
    }
  };

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const payload = variant !== 'classic'
      ? {
          maxPlayers,
          settings: {
            variant,
            ...(variant === 'uno_attack' ? { attackCustomizableCount } : {}),
          },
        }
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
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2 }}
          className="bg-surface-card w-full max-w-xl max-h-[90vh] p-6 sm:p-7 rounded-2xl border border-white/[0.08] shadow-modal relative overflow-y-auto overflow-x-hidden"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white">Create Private Room</h3>
                <p className="text-xs text-slate-400">Select variant rules and host your table</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-surface-elevated transition-colors border border-transparent hover:border-white/[0.06]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-5">
            {/* Game Variant Selector */}
            <div className="space-y-2.5">
              <label className="font-medium text-slate-300 flex items-center justify-between text-xs">
                <span>Select Game Variant</span>
                <span className="font-mono text-xs text-amber-400 font-bold uppercase">
                  {variant === 'classic'
                    ? 'Classic UNO'
                    : variant === 'uno_flip'
                    ? 'UNO Flip!'
                    : variant === 'uno_show_em_no_mercy'
                    ? "UNO Show 'em No Mercy"
                    : variant === 'uno_flex'
                    ? 'UNO Flex'
                    : variant === 'uno_teams'
                    ? 'UNO Teams'
                    : variant === 'uno_attack'
                    ? 'UNO Attack'
                    : 'UNO All Wild'}
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  data-testid="variant-select-classic"
                  onClick={() => handleSelectVariant('classic')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'classic'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
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
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_flip'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    UNO Flip!
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Dual-sided cards, Light &amp; Dark sides, Flip mechanic.
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-no-mercy"
                  onClick={() => handleSelectVariant('uno_show_em_no_mercy')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_show_em_no_mercy'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    No Mercy
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-300 font-mono border border-rose-500/30">168C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel HWV18 rules (168 cards, stacking, 7-0 swaps, 25-card mercy).
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-all-wild"
                  onClick={() => handleSelectVariant('uno_all_wild')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_all_wild'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    All Wild
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel HHL33 rules (112 cards, every card wild, targeted draw 2, forced swap).
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-uno-flex"
                  onClick={() => handleSelectVariant('uno_flex')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_flex'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    UNO Flex
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel HNB00 rules (112 cards, Power Cards, flex sides, flip mechanic).
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-uno-teams"
                  onClick={() => handleSelectVariant('uno_teams')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_teams'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    UNO Teams
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-300 font-mono border border-blue-500/30">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel HXT58 rules (112 cards, 2–4 teams of 2, passing symbol, Wild Team Play).
                  </div>
                </button>

                <button
                  type="button"
                  data-testid="variant-select-uno-attack"
                  onClick={() => handleSelectVariant('uno_attack')}
                  className={`p-3.5 rounded-xl text-left border transition-all cursor-pointer ${
                    variant === 'uno_attack'
                      ? 'bg-surface-elevated border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                      : 'bg-surface-panel border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                  }`}
                >
                  <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                    UNO Attack
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-rose-500/20 text-rose-300 font-mono border border-rose-500/30">112C</span>
                  </div>
                  <div className="text-[11px] text-slate-400 leading-tight">
                    Mattel GTX66 rules (112 cards, virtual launcher, Hit 2, Wild Hit 4, Discard All).
                  </div>
                </button>
              </div>
            </div>

            {/* UNO Attack Customizable Cards Option */}
            {variant === 'uno_attack' && (
              <div className="space-y-2 p-3 rounded-xl bg-surface-panel border border-white/[0.06]">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-medium text-slate-300">
                    Wild Customizable Cards (GTX66)
                  </label>
                  <span className="font-mono text-xs text-amber-400 font-bold">
                    {attackCustomizableCount === 1 ? '1 Card (110 Total Cards)' : '3 Cards (112 Total Cards)'}
                  </span>
                </div>
                <div className="flex gap-2">
                  {([1, 3] as const).map((count) => (
                    <button
                      key={count}
                      type="button"
                      data-testid={`customizable-count-${count}`}
                      onClick={() => setAttackCustomizableCount(count)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        attackCustomizableCount === count
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400/80 shadow-brass'
                          : 'bg-surface-elevated text-slate-400 border-white/[0.06] hover:border-white/[0.12] hover:text-white'
                      }`}
                    >
                      {count === 1 ? '1 Card (110 Cards)' : '3 Cards (112 Cards)'}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500">
                  Official Mattel GTX66 rules strictly permit including 1 Wild Customizable card or all 3 cards.
                </p>
              </div>
            )}

            {/* Max Players Selector */}
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <label className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Player Capacity</span>
                </label>
                <span className="font-mono text-xs text-amber-400 font-bold">
                  {maxPlayers} Players
                </span>
              </div>

              <div className="flex items-center justify-between gap-1.5">
                {(variant === 'uno_show_em_no_mercy'
                  ? [2, 3, 4, 5, 6]
                  : variant === 'uno_flex'
                  ? [2, 3, 4, 6, 8]
                  : variant === 'uno_teams'
                  ? [4, 6, 8]
                  : [2, 4, 6, 8, 10]
                ).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPlayers(num)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold font-display border transition-all cursor-pointer ${
                      maxPlayers === num
                        ? 'bg-surface-elevated text-amber-300 border-amber-400 shadow-brass ring-1 ring-amber-400/20'
                        : 'bg-surface-panel text-slate-400 border-white/[0.06] hover:border-white/[0.12] hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                {variant === 'uno_show_em_no_mercy'
                  ? 'UNO Show ’em No Mercy strictly supports 2 to 6 players.'
                  : variant === 'uno_flex'
                  ? 'UNO Flex supports 2 to 8 players (8 Power Cards).'
                  : variant === 'uno_teams'
                  ? 'UNO Teams strictly requires 4, 6, or 8 players (teams of 2).'
                  : variant === 'uno_all_wild'
                  ? 'UNO All Wild supports 2 to 10 players (default 6).'
                  : 'Mattel standard rooms support 2 to 10 players (default 6).'}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-surface-elevated border border-white/[0.08] hover:bg-surface-highlight transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="confirm-create-room-btn"
                disabled={isLoading}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-display text-white bg-red-600 hover:bg-red-500 active:bg-red-700 border border-red-500/30 shadow-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Room</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
