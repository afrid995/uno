import React from 'react';
import { Crown, CheckCircle2, CircleDashed, Wifi, WifiOff } from 'lucide-react';
import { RoomMemberPublicDto } from '@uno-ultimate/shared';

interface PlayerCardProps {
  member: RoomMemberPublicDto;
  isCurrentPlayer: boolean;
  isHost: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ member, isCurrentPlayer, isHost }) => {
  const isDisconnected = member.connectionStatus === 'DISCONNECTED';

  return (
    <div
      className={`relative p-4 sm:p-5 rounded-2xl border transition-all duration-300 flex items-center justify-between gap-4 ${
        isCurrentPlayer
          ? 'bg-slate-900/90 border-slate-700 shadow-lg ring-1 ring-uno-blue/30'
          : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700/60'
      } ${isDisconnected ? 'opacity-60 border-rose-900/50' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar initial badge */}
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center font-display font-black text-base select-none shrink-0 ${
            isHost
              ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-glow-yellow'
              : isCurrentPlayer
              ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-glow-blue'
              : 'bg-slate-800 text-slate-300'
          }`}
        >
          {member.username.charAt(0).toUpperCase()}
        </div>

        {/* Username & tags */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-sm text-white truncate max-w-[140px] sm:max-w-[200px]">
              {member.username}
            </span>

            {isCurrentPlayer && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-uno-blue/20 text-uno-blue border border-uno-blue/30 shrink-0">
                You
              </span>
            )}

            {isHost && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
                <Crown className="w-3 h-3 text-amber-400" />
                Host
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
            {isDisconnected ? (
              <span className="text-rose-400 flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                Disconnected (reconnecting...)
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-400" />
                Connected
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ready Status Indicator */}
      <div className="shrink-0 flex items-center">
        {isHost ? (
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Room Leader
          </span>
        ) : member.readyStatus ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-glow-green">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-xl bg-slate-800/80 text-slate-400 border border-slate-700/60">
            <CircleDashed className="w-3.5 h-3.5 animate-pulse" />
            Not Ready
          </span>
        )}
      </div>
    </div>
  );
};
