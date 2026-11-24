import React from 'react';
import { Crown, CheckCircle2, CircleDashed, Wifi, WifiOff } from 'lucide-react';
import { RoomMemberPublicDto } from '@uno-ultimate/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PlayerCardProps {
  member: RoomMemberPublicDto;
  isCurrentPlayer: boolean;
  isHost: boolean;
}

export const PlayerCard: React.FC<PlayerCardProps> = ({ member, isCurrentPlayer, isHost }) => {
  const isDisconnected = member.connectionStatus === 'DISCONNECTED';
  const initial = member.username.charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        'relative p-4 sm:p-4.5 rounded-xl border transition-all duration-200 flex items-center justify-between gap-4',
        isCurrentPlayer
          ? 'bg-[#151a24] border-white/[0.15] shadow-card'
          : 'bg-[#10141d] border-white/[0.06] hover:border-white/[0.1]',
        isDisconnected && 'opacity-50 border-rose-900/40'
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar initial badge */}
        <Avatar
          className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm select-none shrink-0 border',
            isHost
              ? 'bg-[#1a202d] text-amber-300 border-amber-400/40 shadow-brass'
              : isCurrentPlayer
              ? 'bg-[#1a202d] text-white border-white/[0.15]'
              : 'bg-[#10141d] text-slate-300 border-white/[0.06]'
          )}
        >
          <AvatarFallback className="bg-transparent font-display font-bold">
            {initial}
          </AvatarFallback>
        </Avatar>

        {/* Username & tags */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-sm text-white truncate max-w-[140px] sm:max-w-[200px]">
              {member.username}
            </span>

            {isCurrentPlayer && (
              <Badge variant="outline" className="px-1.5 py-0.5 text-[10px] font-semibold bg-white/[0.08] text-slate-200 border-white/[0.1] shrink-0">
                You
              </Badge>
            )}

            {isHost && (
              <Badge variant="brass" className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold shrink-0">
                <Crown className="w-3 h-3 text-amber-400" />
                Host
              </Badge>
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
          <Badge variant="brass" className="text-xs font-semibold px-2.5 py-1 rounded-lg">
            Room Leader
          </Badge>
        ) : member.readyStatus ? (
          <Badge variant="emerald" className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Ready
          </Badge>
        ) : (
          <Badge variant="secondary" className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-[#10141d] text-slate-400 border-white/[0.06]">
            <CircleDashed className="w-3.5 h-3.5 text-slate-500" />
            Not Ready
          </Badge>
        )}
      </div>
    </div>
  );
};
