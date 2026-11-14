import React from 'react';
import { PublicPlayer } from '@uno-ultimate/game-protocol';
import { User, ShieldAlert, Award } from 'lucide-react';

export interface PlayerSeatProps {
  player: PublicPlayer;
  isCurrentTurn: boolean;
  isVulnerableToUno?: boolean;
  onCatchUno?: () => void;
  className?: string;
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  isCurrentTurn,
  isVulnerableToUno = false,
  onCatchUno,
  className = '',
}) => {
  const isEliminated = !!player.isEliminated;

  return (
    <div
      data-testid="player-seat"
      data-player-id={player.id}
      data-is-eliminated={isEliminated}
      className={`flex flex-col items-center p-2.5 rounded-2xl transition-all duration-300 ${
        isEliminated
          ? 'bg-slate-950/70 border-rose-950/60 opacity-60'
          : isCurrentTurn
          ? 'border-amber-400/80 ring-2 ring-amber-400/50 shadow-glow-amber bg-slate-800/90 scale-105'
          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
      } border ${className}`}
    >
      {/* Avatar & Turn Indicator */}
      <div className="relative mb-1.5">
        <div
          className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-display font-black text-sm sm:text-base ${
            isEliminated
              ? 'bg-rose-950/60 text-rose-400/60 border border-rose-900/40'
              : isCurrentTurn
              ? 'bg-gradient-to-tr from-amber-500 to-yellow-300 text-slate-950 shadow-md'
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}
        >
          <User className="w-5 h-5" />
        </div>

        {/* Current turn pulsing dot */}
        {isCurrentTurn && !isEliminated && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-400 border border-slate-950" />
          </span>
        )}
      </div>

      {/* Username & Score */}
      <div className="text-center space-y-0.5">
        <p className="text-xs font-bold text-slate-200 truncate max-w-[100px] sm:max-w-[120px]">
          {player.username}
        </p>
        <p className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1">
          <Award className="w-3 h-3 text-amber-400/80" />
          <span>{player.score} pts</span>
        </p>
      </div>

      {/* Cards Remaining Fan / Count or Eliminated Badge */}
      {isEliminated ? (
        <div className="mt-2 px-2.5 py-0.5 rounded-full bg-rose-950/90 border border-rose-700 text-[10px] font-black text-rose-300 tracking-wider">
          ELIMINATED
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-800 shadow-inner">
          <div className="w-3 h-4 rounded-xs bg-uno-red border border-red-300 rotate-[-10deg]" />
          <div className="w-3 h-4 rounded-xs bg-uno-blue border border-blue-300 rotate-[10deg] -ml-2" />
          <span className="text-xs font-black text-white ml-1.5">
            {player.cardCount}
          </span>
        </div>
      )}

      {/* Status Badges */}
      <div className="mt-1.5 flex flex-col gap-1 items-center">
        {/* UNO Flex Power Card Badge */}
        {!isEliminated && player.powerCardStatus && (
          <div
            data-testid="power-card-badge"
            data-power-status={player.powerCardStatus}
            className={`px-2 py-0.5 rounded-full text-[9px] font-black border flex items-center gap-1 shadow-sm ${
              player.powerCardStatus === 'green_check'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-emerald-500/20'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/50 shadow-rose-500/20'
            }`}
            title={`Power Card: ${player.powerCardStatus === 'green_check' ? 'Green Side (Active)' : 'Red Side (Inactive)'}`}
          >
            <span>{player.powerCardStatus === 'green_check' ? '✓' : '✗'}</span>
            <span>POWER</span>
          </div>
        )}

        {!isEliminated && player.hasDeclaredUno && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-500 text-slate-950 tracking-wider shadow-sm animate-pulse">
            UNO!
          </span>
        )}

        {/* Catch Missed UNO Button */}
        {!isEliminated && isVulnerableToUno && onCatchUno && (
          <button
            data-testid="catch-uno-btn"
            onClick={onCatchUno}
            className="mt-1 px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1 shadow-glow-red animate-bounce cursor-pointer border border-rose-400/40"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>CATCH UNO!</span>
          </button>
        )}
      </div>
    </div>
  );
};
