import React from 'react';
import { Card, PublicPlayer } from '@uno-ultimate/game-protocol';
import { User, Award } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { soundService } from '../../../lib/sound-service';

export interface LocalPlayerProfileProps {
  self: {
    id: string;
    hand: readonly Card[];
    playableCardIds?: readonly string[];
    isCurrentTurn?: boolean;
    canDraw?: boolean;
    canCallUno?: boolean;
    isEliminated?: boolean;
  };
  selfPublic?: PublicPlayer;
  isMyTurn: boolean;
  className?: string;
}

export const LocalPlayerProfile: React.FC<LocalPlayerProfileProps> = ({
  self,
  selfPublic,
  isMyTurn,
  className = '',
}) => {
  const isEliminated = !!self.isEliminated || !!selfPublic?.isEliminated;
  const username = selfPublic?.username || 'You';
  const score = selfPublic?.score ?? 0;
  const cardCount = self.hand.length;

  const prevIsMyTurn = React.useRef(isMyTurn);
  React.useEffect(() => {
    if (!prevIsMyTurn.current && isMyTurn && !isEliminated) {
      soundService.play('turn_alert');
    }
    prevIsMyTurn.current = isMyTurn;
  }, [isMyTurn, isEliminated]);

  return (
    <div
      data-testid="local-player-profile"
      data-player-id={self.id}
      data-is-turn={isMyTurn}
      className={cn(
        'relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border transition-all duration-300 shadow-modal select-none',
        isEliminated
          ? 'bg-[#090c11]/80 border-rose-950/70 opacity-60'
          : isMyTurn
          ? 'bg-[#1a202d] border-amber-400/80 ring-1 ring-amber-400/40 shadow-brass scale-102 sm:scale-105'
          : 'bg-[#141924] border-white/[0.08] hover:border-white/[0.15]',
        className
      )}
    >
      {/* Avatar with Turn Ring */}
      <div className="relative shrink-0">
        <Avatar
          className={cn(
            'w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-display font-bold text-xs sm:text-sm border-0',
            isEliminated
              ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40'
              : isMyTurn
              ? 'bg-amber-400 text-slate-950 shadow-card'
              : 'bg-[#10141d] text-slate-300 border border-white/[0.08]'
          )}
        >
          <AvatarFallback className="bg-transparent font-display font-bold">
            <User className="w-4 h-4 sm:w-5 sm:h-5" />
          </AvatarFallback>
        </Avatar>

        {/* Turn Dot indicator */}
        {isMyTurn && !isEliminated && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400 border border-slate-950 shadow-sm" />
          </span>
        )}
      </div>

      {/* Profile Details: Username, Score & Turn Badge */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[80px] sm:max-w-[120px]">
            {username}
          </span>
          <span className="text-[10px] text-amber-400 font-mono font-semibold">(You)</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-0.5 font-mono">
            <Award className="w-3 h-3 text-amber-400/90" />
            <span>{score} pts</span>
          </span>

          <span>•</span>

          <span className="font-mono font-bold text-slate-200">
            {cardCount} {cardCount === 1 ? 'card' : 'cards'}
          </span>
        </div>
      </div>

      {/* Turn Status Pill */}
      <div className="ml-auto pl-1">
        {isMyTurn && !isEliminated ? (
          <Badge
            data-testid="local-turn-badge"
            variant="brass"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-display font-bold text-[10px] sm:text-xs uppercase tracking-wider shadow-sm border-0"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
            <span>YOUR TURN</span>
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="px-2 py-0.5 rounded-lg bg-[#10141d] border-white/[0.06] text-slate-400 text-[10px] font-mono"
          >
            WAITING
          </Badge>
        )}
      </div>

      {/* Badges: UNO, Team, Power */}
      <div className="hidden sm:flex items-center gap-1.5 ml-1">
        {selfPublic?.hasDeclaredUno && !isEliminated && (
          <Badge variant="emerald" className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500 text-slate-950 tracking-wider shadow-sm border-0">
            UNO!
          </Badge>
        )}

        {selfPublic?.teamId && (
          <Badge
            data-testid="local-team-badge"
            variant="secondary"
            className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 border-blue-400/40"
          >
            {selfPublic.teamId.toUpperCase().replace('_', ' ')}
          </Badge>
        )}

        {selfPublic?.powerCardStatus && !isEliminated && (
          <Badge
            data-testid="local-power-badge"
            variant="secondary"
            className={cn(
              'px-1.5 py-0.5 rounded text-[9px] font-mono border',
              selfPublic.powerCardStatus === 'green_check'
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                : 'bg-rose-500/30 text-rose-300 border-rose-400'
            )}
          >
            {selfPublic.powerCardStatus === 'green_check' ? '✓ POWER' : '✗ USED'}
          </Badge>
        )}
      </div>
    </div>
  );
};
