import React from 'react';
import { PublicPlayer } from '@uno-ultimate/game-protocol';
import { User, ShieldAlert, Award, WifiOff } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface PlayerSeatProps {
  player: PublicPlayer;
  isCurrentTurn: boolean;
  isVulnerableToUno?: boolean;
  onCatchUno?: () => void;
  className?: string;
  disconnectInfo?: { disconnectTimestamp: number; gracePeriodSeconds: number };
  compact?: boolean;
}

export const PlayerSeat: React.FC<PlayerSeatProps> = ({
  player,
  isCurrentTurn,
  isVulnerableToUno = false,
  onCatchUno,
  className = '',
  disconnectInfo,
  compact = false,
}) => {
  const isEliminated = !!player.isEliminated;

  const [secondsRemaining, setSecondsRemaining] = React.useState<number>(() => {
    if (!disconnectInfo) return 0;
    const elapsed = Math.floor((Date.now() - disconnectInfo.disconnectTimestamp) / 1000);
    return Math.max(0, disconnectInfo.gracePeriodSeconds - elapsed);
  });

  React.useEffect(() => {
    if (!disconnectInfo) return;
    const updateCountdown = () => {
      const elapsed = Math.floor((Date.now() - disconnectInfo.disconnectTimestamp) / 1000);
      const rem = Math.max(0, disconnectInfo.gracePeriodSeconds - elapsed);
      setSecondsRemaining(rem);
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [disconnectInfo]);

  if (compact) {
    return (
      <div
        data-testid="player-seat"
        data-player-id={player.id}
        data-is-eliminated={isEliminated}
        className={cn(
          'flex items-center gap-2 p-1.5 sm:p-2 rounded-xl transition-all duration-300 border select-none shrink-0',
          isEliminated
            ? 'bg-[#090c11]/80 border-rose-950/60 opacity-60'
            : isCurrentTurn
            ? 'border-amber-400/90 ring-1 ring-amber-400/40 shadow-brass bg-[#1a202d]'
            : 'bg-[#141924] border-white/[0.08] hover:border-white/[0.15]',
          className
        )}
      >
        {/* Avatar & Turn Indicator */}
        <div className="relative shrink-0">
          <Avatar
            className={cn(
              'w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs border-0',
              isEliminated
                ? 'bg-rose-950/60 text-rose-400/60 border border-rose-900/40'
                : isCurrentTurn
                ? 'bg-amber-400 text-slate-950 font-bold shadow-card'
                : 'bg-[#10141d] text-slate-300 border border-white/[0.08]'
            )}
          >
            <AvatarFallback className="bg-transparent font-display font-bold">
              <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </AvatarFallback>
          </Avatar>

          {/* Current turn dot */}
          {isCurrentTurn && !isEliminated && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400 border border-slate-950 shadow-sm" />
            </span>
          )}
        </div>

        {/* Username, Score & Card Count */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[11px] sm:text-xs font-bold text-slate-200 truncate max-w-[65px] sm:max-w-[85px]">
              {player.username}
            </p>
            {isCurrentTurn && !isEliminated && (
              <Badge
                data-testid="playing-badge"
                variant="brass"
                className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 font-display font-bold text-[8px] uppercase tracking-wider border-0"
              >
                TURN
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px]">
            <span className="text-slate-400 flex items-center gap-0.5 font-mono">
              <Award className="w-2.5 h-2.5 text-amber-400/80" />
              <span>{player.score}</span>
            </span>
            <span className="text-slate-600">•</span>
            {isEliminated ? (
              <span className="text-rose-400 font-bold">OUT</span>
            ) : (
              <span className="font-mono font-bold text-amber-300 flex items-center gap-0.5">
                <span className="w-2 h-2.5 rounded-xs bg-red-600 inline-block rotate-[-5deg]" />
                <span>{player.cardCount}</span>
              </span>
            )}
          </div>
        </div>

        {/* Status badges & UNO triggers */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {/* UNO Flex Power Card Badge */}
          {!isEliminated && player.powerCardStatus && (
            <Badge
              data-testid="power-card-badge"
              data-power-status={player.powerCardStatus}
              variant="secondary"
              className={cn(
                'px-1 py-0.5 rounded text-[8px] font-bold border',
                player.powerCardStatus === 'green_check'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/50'
              )}
            >
              {player.powerCardStatus === 'green_check' ? '⚡' : '✗'}
            </Badge>
          )}

          {/* UNO Teams Team Badge */}
          {player.teamId && (
            <Badge
              data-testid="player-team-badge"
              data-team-id={player.teamId}
              variant="secondary"
              className="px-1 py-0.5 rounded text-[8px] font-mono bg-blue-500/20 text-blue-300 border-blue-400/40"
            >
              {player.teamId.toUpperCase().replace('TEAM_', 'T')}
            </Badge>
          )}

          {/* UNO declared pill */}
          {!isEliminated && player.hasDeclaredUno && (
            <Badge variant="emerald" className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-emerald-500 text-slate-950 border-0">
              UNO!
            </Badge>
          )}

          {/* Catch UNO button */}
          {!isEliminated && isVulnerableToUno && onCatchUno && (
            <Button
              data-testid="catch-uno-btn"
              size="sm"
              variant="destructive"
              onClick={onCatchUno}
              className="h-6 px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-bold text-[9px] flex items-center gap-0.5 shadow-card border-red-400/50"
            >
              <ShieldAlert className="w-2.5 h-2.5" />
              <span>CATCH</span>
            </Button>
          )}

          {disconnectInfo && (
            <Badge
              data-testid="disconnected-badge"
              variant="destructive"
              className="px-1 py-0.5 rounded bg-rose-500/20 border-rose-500/60 text-rose-300 font-bold text-[8px] flex items-center gap-0.5 font-mono"
            >
              <WifiOff className="w-2 h-2" />
              <span>{secondsRemaining}s</span>
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="player-seat"
      data-player-id={player.id}
      data-is-eliminated={isEliminated}
      className={cn(
        'flex flex-col items-center p-2.5 rounded-2xl transition-all duration-300 border',
        isEliminated
          ? 'bg-[#090c11]/80 border-rose-950/60 opacity-60'
          : isCurrentTurn
          ? 'border-amber-400/80 ring-1 ring-amber-400/40 shadow-brass bg-[#1a202d] scale-105'
          : 'bg-[#141924] border-white/[0.08] hover:border-white/[0.15]',
        className
      )}
    >
      {/* Avatar & Turn Indicator */}
      <div className="relative mb-1.5">
        <Avatar
          className={cn(
            'w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center font-display font-bold text-sm sm:text-base border-0',
            isEliminated
              ? 'bg-rose-950/60 text-rose-400/60 border border-rose-900/40'
              : isCurrentTurn
              ? 'bg-amber-400 text-slate-950 font-bold shadow-card'
              : 'bg-[#10141d] text-slate-300 border border-white/[0.08]'
          )}
        >
          <AvatarFallback className="bg-transparent font-display font-bold">
            <User className="w-5 h-5" />
          </AvatarFallback>
        </Avatar>

        {/* Current turn dot */}
        {isCurrentTurn && !isEliminated && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400 border border-slate-950 shadow-sm" />
          </span>
        )}
      </div>

      {/* Username & Score */}
      <div className="text-center space-y-0.5">
        <p className="text-xs font-bold text-slate-200 truncate max-w-[100px] sm:max-w-[120px]">
          {player.username}
        </p>
        <p className="text-[10px] text-slate-400 font-medium flex items-center justify-center gap-1 font-mono">
          <Award className="w-3 h-3 text-amber-400/80" />
          <span>{player.score} pts</span>
        </p>
        {isCurrentTurn && !isEliminated && (
          <Badge
            data-testid="playing-badge"
            variant="brass"
            className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-display font-bold text-[9px] uppercase tracking-wider shadow-sm border-0"
          >
            PLAYING
          </Badge>
        )}
        {disconnectInfo && (
          <Badge
            data-testid="disconnected-badge"
            variant="destructive"
            className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-rose-500/20 border-rose-500/60 text-rose-300 font-bold text-[9px] uppercase tracking-wider font-mono"
          >
            <WifiOff className="w-2.5 h-2.5" />
            <span>DISCONNECTED ({secondsRemaining}s)</span>
          </Badge>
        )}
      </div>

      {/* Cards Remaining Fan / Count or Eliminated Badge */}
      {isEliminated ? (
        <Badge variant="destructive" className="mt-2 px-2.5 py-0.5 rounded-full bg-rose-950/90 border border-rose-700 text-[10px] font-bold text-rose-300 tracking-wider">
          ELIMINATED
        </Badge>
      ) : (
        <div className="mt-2 flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#090c11]/80 border border-slate-800 shadow-inner">
          <div className="w-3 h-4 rounded-xs bg-red-600 border border-red-300 rotate-[-10deg]" />
          <div className="w-3 h-4 rounded-xs bg-blue-600 border border-blue-300 rotate-[10deg] -ml-2" />
          <span className="text-xs font-bold text-white ml-1.5 font-mono">
            {player.cardCount}
          </span>
        </div>
      )}

      {/* Status Badges */}
      <div className="mt-1.5 flex flex-col gap-1 items-center">
        {/* UNO Teams Team Badge */}
        {player.teamId && (
          <Badge
            data-testid="player-team-badge"
            data-team-id={player.teamId}
            variant="secondary"
            className={cn(
              'px-2 py-0.5 rounded-full text-[9px] font-semibold border tracking-wider',
              player.teamId === 'team_1'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : player.teamId === 'team_2'
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                : player.teamId === 'team_3'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
            )}
          >
            {player.teamId.toUpperCase().replace('_', ' ')}
          </Badge>
        )}

        {/* UNO Teams Out of Cards / Waiting Badge */}
        {player.isOut && (
          <Badge
            data-testid="player-out-badge"
            variant="brass"
            className="px-2 py-0.5 rounded-full bg-amber-500/20 border-amber-500/40 text-[9px] font-semibold text-amber-300 tracking-wider"
          >
            WAITING FOR PARTNER
          </Badge>
        )}

        {/* UNO Flex Power Card Badge */}
        {!isEliminated && player.powerCardStatus && (
          <Badge
            data-testid="power-card-badge"
            data-power-status={player.powerCardStatus}
            variant="secondary"
            className={cn(
              'px-2 py-0.5 rounded-full text-[9px] font-semibold border flex items-center gap-1 shadow-sm',
              player.powerCardStatus === 'green_check'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/50'
            )}
            title={`Power Card: ${player.powerCardStatus === 'green_check' ? 'Green Side (Active)' : 'Red Side (Inactive)'}`}
          >
            <span>{player.powerCardStatus === 'green_check' ? '✓' : '✗'}</span>
            <span>POWER</span>
          </Badge>
        )}

        {!isEliminated && player.hasDeclaredUno && (
          <Badge variant="emerald" className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-emerald-500 text-slate-950 tracking-wider shadow-sm border-0">
            UNO!
          </Badge>
        )}

        {/* Catch Missed UNO Button */}
        {!isEliminated && isVulnerableToUno && onCatchUno && (
          <Button
            data-testid="catch-uno-btn"
            size="sm"
            variant="destructive"
            onClick={onCatchUno}
            className="mt-1 h-7 px-3 py-1 rounded-lg text-[10px] font-bold bg-red-600 hover:bg-red-500 text-white flex items-center gap-1 shadow-card border border-red-400/50"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>Catch UNO</span>
          </Button>
        )}
      </div>
    </div>
  );
};
