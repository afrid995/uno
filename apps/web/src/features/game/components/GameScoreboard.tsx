import React, { useState } from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { Trophy, ChevronDown } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141924] hover:bg-[#1a202d] border-white/[0.08] text-xs font-semibold text-slate-200 shadow-card backdrop-blur-xs"
            aria-label="Toggle Scoreboard"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Round {roundNumber}</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">Target {targetScore}</span>
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 text-slate-400 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          className="w-72 sm:w-80 rounded-xl bg-[#141924] border-white/[0.08] shadow-modal p-4 backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-2 mb-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-display">
                Match Standings
              </h4>
              <div className="text-[11px] text-slate-400 font-mono">
                Target: {targetScore} pts • Direction: {turnDirection}
              </div>
            </div>
            <Badge variant="brass" className="text-xs font-mono font-bold">
              R{roundNumber}
            </Badge>
          </div>

          <div className="space-y-2">
            {players.map((player, idx) => {
              const isCurrentTurn = player.id === currentTurnGuestId;
              const isDealer = idx === dealerIndex;
              const isSelf = player.id === self.id;

              return (
                <div
                  key={player.id}
                  className={cn(
                    'flex items-center justify-between p-2 rounded-lg text-xs',
                    isCurrentTurn
                      ? 'bg-amber-400/15 border border-amber-400/40 text-white shadow-brass'
                      : isSelf
                      ? 'bg-[#10141d] border border-white/[0.08] text-slate-200'
                      : 'bg-[#090c11] text-slate-300 border border-white/[0.04]'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCurrentTurn && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    )}
                    <div className="truncate font-semibold flex items-center gap-1.5">
                      <span className="truncate">{player.username}</span>
                      {isSelf && (
                        <span className="text-[10px] text-amber-400/90 font-mono">
                          (you)
                        </span>
                      )}
                      {isDealer && (
                        <span className="text-[9px] px-1 py-0.2 bg-blue-500/20 text-blue-300 rounded border border-blue-500/30 font-mono">
                          D
                        </span>
                      )}
                      {player.hasDeclaredUno && !player.isEliminated && (
                        <span className="text-[9px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 font-mono font-bold">
                          UNO
                        </span>
                      )}
                      {player.isEliminated && (
                        <span className="text-[9px] px-1 py-0.2 bg-rose-950 text-rose-300 rounded border border-rose-700/60 font-mono font-bold">
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
                      {player.cumulativeScore !== undefined && player.cumulativeScore > 0 && player.cumulativeScore > player.score && (
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
        </PopoverContent>
      </Popover>
    </div>
  );
};
