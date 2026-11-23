import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, PlusCircle } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#141924] w-full max-w-xl max-h-[90vh] p-6 sm:p-7 rounded-2xl border-white/[0.08] shadow-modal overflow-y-auto overflow-x-hidden">
        <DialogHeader className="mb-2 text-left">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="font-display font-bold text-xl text-white">
                Create Private Room
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400 mt-0.5">
                Select variant rules and host your table
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-5">
          {/* Game Variant Selector */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <Label className="font-medium text-slate-300 normal-case tracking-normal">
                Select Game Variant
              </Label>
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
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-testid="variant-select-classic"
                onClick={() => handleSelectVariant('classic')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'classic'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
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
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'uno_flip'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  UNO Flip!
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-purple-500/20 text-purple-300 font-mono border-purple-500/30">112C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Dual-sided cards, Light &amp; Dark sides, Flip mechanic.
                </div>
              </button>

              <button
                type="button"
                data-testid="variant-select-no-mercy"
                onClick={() => handleSelectVariant('uno_show_em_no_mercy')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'uno_show_em_no_mercy'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  No Mercy
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-rose-500/20 text-rose-300 font-mono border-rose-500/30">168C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Mattel HWV18 rules (168 cards, stacking, 7-0 swaps, 25-card mercy).
                </div>
              </button>

              <button
                type="button"
                data-testid="variant-select-all-wild"
                onClick={() => handleSelectVariant('uno_all_wild')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'uno_all_wild'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  All Wild
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-indigo-500/20 text-indigo-300 font-mono border-indigo-500/30">112C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Mattel HHL33 rules (112 cards, every card wild, targeted draw 2, forced swap).
                </div>
              </button>

              <button
                type="button"
                data-testid="variant-select-uno-flex"
                onClick={() => handleSelectVariant('uno_flex')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'uno_flex'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  UNO Flex
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-emerald-500/20 text-emerald-300 font-mono border-emerald-500/30">112C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Mattel HNB00 rules (112 cards, Power Cards, flex sides, flip mechanic).
                </div>
              </button>

              <button
                type="button"
                data-testid="variant-select-uno-teams"
                onClick={() => handleSelectVariant('uno_teams')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer',
                  variant === 'uno_teams'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  UNO Teams
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-blue-500/20 text-blue-300 font-mono border-blue-500/30">112C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Mattel HXT58 rules (112 cards, 2–4 teams of 2, passing symbol, Wild Team Play).
                </div>
              </button>

              <button
                type="button"
                data-testid="variant-select-uno-attack"
                onClick={() => handleSelectVariant('uno_attack')}
                className={cn(
                  'p-3.5 rounded-xl text-left border transition-all cursor-pointer sm:col-span-2',
                  variant === 'uno_attack'
                    ? 'bg-[#1a202d] border-amber-400 text-white shadow-brass ring-1 ring-amber-400/30'
                    : 'bg-[#10141d] border-white/[0.06] text-slate-400 hover:border-white/[0.12] hover:text-white'
                )}
              >
                <div className="font-bold font-display text-sm text-white mb-0.5 flex items-center gap-1.5">
                  UNO Attack
                  <Badge variant="secondary" className="px-1.5 py-0 text-[9px] bg-rose-500/20 text-rose-300 font-mono border-rose-500/30">112C</Badge>
                </div>
                <div className="text-[11px] text-slate-400 leading-tight">
                  Mattel GTX66 rules (112 cards, virtual launcher, Hit 2, Wild Hit 4, Discard All).
                </div>
              </button>
            </div>
          </div>

          {/* UNO Attack Customizable Cards Option */}
          {variant === 'uno_attack' && (
            <div className="space-y-2 p-3 rounded-xl bg-[#10141d] border border-white/[0.06]">
              <div className="flex justify-between items-center text-xs">
                <Label className="font-medium text-slate-300 normal-case tracking-normal">
                  Wild Customizable Cards (GTX66)
                </Label>
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
                    className={cn(
                      'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer',
                      attackCustomizableCount === count
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/80 shadow-brass'
                        : 'bg-[#1a202d] text-slate-400 border-white/[0.06] hover:border-white/[0.12] hover:text-white'
                    )}
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
              <Label className="font-medium text-slate-300 flex items-center gap-1.5 normal-case tracking-normal">
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span>Player Capacity</span>
              </Label>
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
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-bold font-display border transition-all cursor-pointer',
                    maxPlayers === num
                      ? 'bg-[#1a202d] text-amber-300 border-amber-400 shadow-brass ring-1 ring-amber-400/20'
                      : 'bg-[#10141d] text-slate-400 border-white/[0.06] hover:border-white/[0.12] hover:text-white'
                  )}
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
            <Alert variant="destructive" className="py-2.5 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
              <AlertDescription className="text-xs text-rose-300">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-[#1a202d] border-white/[0.08]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              data-testid="confirm-create-room-btn"
              disabled={isLoading}
              variant="default"
              className="flex-1 py-3 rounded-xl text-xs font-bold font-display text-white bg-red-600 hover:bg-red-500 active:bg-red-700 border-red-500/30 shadow-sm gap-2"
            >
              {isLoading ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Room</span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
