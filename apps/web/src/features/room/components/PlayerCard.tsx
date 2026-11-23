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
      className={`relative p-4 sm:p-4.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4 ${
        isCurrentPlayer
          ? 'bg-surface-card border-white/[0.15] shadow-card'
          : 'bg-surface-panel border-white/[0.06] hover:border-white/[0.1]'
      } ${isDisconnected ? 'opacity-50 border-rose-900/40' : ''}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar initial badge */}
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center font-display font-black text-sm select-none shrink-0 ${
            isHost
              ? 'bg-surface-elevated text-amber-300 border border-amber-400/40 shadow-brass'
              : isCurrentPlayer
              ? 'bg-surface-elevated text-white border border-white/[0.15]'
              : 'bg-surface-panel text-slate-300 border border-white/[0.06]'
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
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/[0.08] text-slate-200 border border-white/[0.1] shrink-0">
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
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Room Leader
          </span>
        ) : member.readyStatus ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-surface-panel text-slate-400 border border-white/[0.06]">
            <CircleDashed className="w-3.5 h-3.5 text-slate-500" />
            Not Ready
          </span>
        )}
      </div>
    </div>
  );
};
