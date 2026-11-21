import React from 'react';
import { Card, PublicPlayer } from '@uno-ultimate/game-protocol';
import { User, Award } from 'lucide-react';

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

  return (
    <div
      data-testid="local-player-profile"
      data-player-id={self.id}
      data-is-turn={isMyTurn}
      className={`relative flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl border transition-all duration-300 shadow-modal select-none ${
        isEliminated
          ? 'bg-surface-canvas/80 border-rose-950/70 opacity-60'
          : isMyTurn
          ? 'bg-surface-elevated border-amber-400/80 ring-1 ring-amber-400/40 shadow-brass scale-102 sm:scale-105'
          : 'bg-surface-card border-white/[0.08] hover:border-white/[0.15]'
      } ${className}`}
    >
      {/* Avatar with Turn Ring */}
      <div className="relative shrink-0">
        <div
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center font-display font-bold text-xs sm:text-sm ${
            isEliminated
              ? 'bg-rose-950/60 text-rose-400 border border-rose-900/40'
              : isMyTurn
              ? 'bg-amber-400 text-slate-950 shadow-card animate-pulse'
              : 'bg-surface-panel text-slate-300 border border-white/[0.08]'
          }`}
        >
          <User className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>

        {/* Turn Dot indicator */}
        {isMyTurn && !isEliminated && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border border-slate-950" />
          </span>
        )}
      </div>

      {/* Profile Details: Username, Score & Turn Badge */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-xs sm:text-sm font-bold text-white truncate max-w-[80px] sm:max-w-[120px]">
            {username}
          </span>
          <span className="text-[10px] text-amber-400/90 font-mono font-semibold">(You)</span>
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
          <div
            data-testid="local-turn-badge"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-display font-bold text-[10px] sm:text-xs uppercase tracking-wider shadow-card animate-pulse"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
            <span>YOUR TURN</span>
          </div>
        ) : (
          <div className="px-2 py-0.5 rounded-lg bg-surface-panel border border-white/[0.06] text-slate-400 text-[10px] font-mono">
            WAITING
          </div>
        )}
      </div>

      {/* Badges: UNO, Team, Power */}
      <div className="hidden sm:flex items-center gap-1.5 ml-1">
        {selfPublic?.hasDeclaredUno && !isEliminated && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500 text-slate-950 tracking-wider shadow-sm animate-pulse">
            UNO!
          </span>
        )}

        {selfPublic?.teamId && (
          <span
            data-testid="local-team-badge"
            className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-400/40"
          >
            {selfPublic.teamId.toUpperCase().replace('_', ' ')}
          </span>
        )}

        {selfPublic?.powerCardStatus && !isEliminated && (
          <span
            data-testid="local-power-badge"
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
              selfPublic.powerCardStatus === 'green_check'
                ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                : 'bg-rose-500/30 text-rose-300 border-rose-400'
            }`}
          >
            {selfPublic.powerCardStatus === 'green_check' ? '✓ POWER' : '✗ USED'}
          </span>
        )}
      </div>
    </div>
  );
};
