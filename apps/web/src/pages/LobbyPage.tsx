import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  LogOut,
  Play,
  CheckCircle2,
  Sparkles,
  Info,
} from 'lucide-react';
import { RoomMemberPublicDto } from '@uno-ultimate/shared';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { PlayerCard } from '../features/room/components/PlayerCard';
import { InviteLinkCard } from '../features/room/components/InviteLinkCard';

export const LobbyPage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const { guest } = useGuestStore();
  const {
    room,
    isLoading,
    error,
    isStarting,
    startingCountdown,
    joinRoom,
    leaveRoom,
    toggleReady,
    startGame,
    initSocketListeners,
  } = useRoomStore();

  const [confirmLeave, setConfirmLeave] = useState(false);

  // Initialize socket listeners on mount
  useEffect(() => {
    const cleanup = initSocketListeners();
    return () => cleanup();
  }, [initSocketListeners]);

  // Join or restore room state if not already set
  useEffect(() => {
    if (!roomCode) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (!room && guest) {
      joinRoom({ roomCode });
    }
  }, [roomCode, room, guest, joinRoom, navigate]);

  const isCurrentPlayerHost = !!(room && guest && room.hostGuestId === guest.id);
  const currentMember = room?.members.find((m: RoomMemberPublicDto) => m.guestId === guest?.id);
  const isCurrentPlayerReady = currentMember?.readyStatus || false;

  const handleLeave = async () => {
    await leaveRoom();
    navigate('/dashboard');
  };

  const handleReadyToggle = async () => {
    await toggleReady();
  };

  const handleStartGame = async () => {
    await startGame();
  };

  if (!guest) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400 text-xs">Authenticating guest...</p>
      </div>
    );
  }

  if (isLoading && !room) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-3 border-uno-red border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium">Entering lobby {roomCode}...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error || 'Room not found or no longer available.'}
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-6 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-white hover:bg-slate-700 transition-colors"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const nonHostMembers = room.members.filter((m: RoomMemberPublicDto) => m.guestId !== room.hostGuestId);
  const allPlayersReady = nonHostMembers.length > 0 && nonHostMembers.every((m: RoomMemberPublicDto) => m.readyStatus);
  const canStartMatch = isCurrentPlayerHost && room.members.length >= 2 && allPlayersReady;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Starting countdown overlay */}
      <AnimatePresence>
        {isStarting && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 rounded-3xl bg-gradient-to-r from-red-600 via-amber-500 to-blue-600 text-white text-center shadow-glow mb-6"
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-yellow-300" />
              <h2 className="font-display font-black text-2xl tracking-tight">Starting Game Lobby</h2>
            </div>
            <p className="text-sm text-white/90">
              Match countdown initiated ({startingCountdown}s). Card gameplay engine activates in Phase 3!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Room Code Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Lobby Active
            </span>
            <span className="text-xs text-slate-400 font-medium">Revision v{room.version}</span>
          </div>
          <h1 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight mt-1">
            Private Game Lobby
          </h1>
        </div>

        {/* Player count indicator */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-xs text-slate-300">
          <Users className="w-4 h-4 text-uno-blue" />
          <span className="font-bold font-mono text-white">
            {room.playerCount} / {room.maxPlayers}
          </span>
          <span className="text-slate-500">Players</span>
        </div>
      </div>

      {/* Invite Link & Code Card */}
      <InviteLinkCard roomCode={room.roomCode} />

      {/* Main Players Grid Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
            Connected Players
            <span className="text-xs font-normal text-slate-400 font-mono">
              ({room.playerCount} in room)
            </span>
          </h2>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Host transfers automatically if current host leaves
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {room.members.map((member: RoomMemberPublicDto) => (
            <PlayerCard
              key={member.id}
              member={member}
              isCurrentPlayer={member.guestId === guest.id}
              isHost={member.role === 'HOST'}
            />
          ))}
        </div>
      </div>

      {/* Player Actions & Host Controls Bar */}
      <div className="glass-panel p-5 sm:p-6 rounded-3xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {confirmLeave ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-rose-400 font-medium">Leave room?</span>
              <button
                onClick={handleLeave}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Yes, Leave
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="py-2.5 px-3 rounded-xl text-xs bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 bg-slate-900/80 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <LogOut className="w-4 h-4" />
              <span>Leave Room</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* Non-host Ready Toggle */}
          {!isCurrentPlayerHost && (
            <button
              onClick={handleReadyToggle}
              className={`py-3.5 px-6 rounded-xl font-display font-bold text-xs tracking-wide transition-all shadow-lg flex items-center justify-center gap-2 w-full sm:w-auto ${
                isCurrentPlayerReady
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-glow-green border border-emerald-400/40'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isCurrentPlayerReady ? 'Mark as Not Ready' : "I'm Ready!"}</span>
            </button>
          )}

          {/* Host Start Game Button */}
          {isCurrentPlayerHost && (
            <div className="relative group w-full sm:w-auto">
              <button
                onClick={handleStartGame}
                disabled={!canStartMatch}
                className={`py-3.5 px-7 rounded-xl font-display font-bold text-xs tracking-wide transition-all shadow-xl flex items-center justify-center gap-2 w-full sm:w-auto select-none ${
                  canStartMatch
                    ? 'bg-gradient-to-r from-uno-red via-rose-600 to-uno-yellow text-white shadow-glow hover:scale-[1.02] cursor-pointer'
                    : 'bg-slate-800/80 border border-slate-700 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Game</span>
              </button>

              {!canStartMatch && (
                <div className="text-[10px] text-center text-slate-500 mt-1">
                  {room.members.length < 2
                    ? 'Requires at least 2 players'
                    : 'Waiting for all players to be ready'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fair Play & Phase 2 Notice */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 text-xs text-slate-400">
        <Info className="w-4 h-4 text-uno-blue shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-200">Phase 2 Real-Time Presence</p>
          <p className="text-[11px] leading-relaxed">
            Lobby membership and ready statuses are synchronized via authoritative Socket.IO events and persisted in PostgreSQL.
            If a player accidentally closes their browser, a 30-second reconnection grace period holds their spot.
            Actual UNO card deals, deck shuffling, and play actions will activate in Phase 3.
          </p>
        </div>
      </div>
    </div>
  );
};
