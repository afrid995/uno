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
import { SOCKET_EVENTS } from '@uno-ultimate/game-protocol';
import { socketManager } from '../services/socketClient';
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
    updateSettings,
    startGame,
    initSocketListeners,
  } = useRoomStore();

  const [confirmLeave, setConfirmLeave] = useState(false);

  // Initialize socket listeners on mount
  useEffect(() => {
    const cleanup = initSocketListeners();
    return () => cleanup();
  }, [initSocketListeners]);

  // Navigate to game if room status is already IN_GAME
  useEffect(() => {
    if (room?.status === 'IN_GAME' && roomCode) {
      navigate(`/game/${roomCode}`, { replace: true });
    }
  }, [room?.status, roomCode, navigate]);

  // Listen for game:started socket event to navigate to game table
  useEffect(() => {
    const socket = socketManager.getSocket();
    const handleGameStarted = () => {
      if (roomCode) {
        navigate(`/game/${roomCode}`);
      }
    };

    socket.on(SOCKET_EVENTS.GAME_STARTED, handleGameStarted);
    return () => {
      socket.off(SOCKET_EVENTS.GAME_STARTED, handleGameStarted);
    };
  }, [roomCode, navigate]);

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
  const roomVariant = ((room.settings as Record<string, unknown>)?.variant as string) || 'classic';

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Starting countdown overlay */}
      <AnimatePresence>
        {isStarting && (
          <motion.div
            data-testid="starting-countdown-banner"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 rounded-3xl bg-gradient-to-r from-red-600 via-amber-500 to-blue-600 text-white text-center shadow-glow mb-6"
          >
            <div className="flex items-center justify-center gap-2 mb-1">
              <Sparkles className="w-5 h-5 text-yellow-300" />
              <h2 className="font-display font-black text-2xl tracking-tight">Starting Game Match</h2>
            </div>
            <p className="text-sm text-white/90">
              Match countdown initiated ({startingCountdown}s). Preparing the {roomVariant === 'uno_show_em_no_mercy' ? '168-card' : roomVariant === 'uno_all_wild' ? '112-card all-wild' : roomVariant === 'uno_flex' ? '112-card flex' : roomVariant === 'uno_teams' ? '112-card teams' : roomVariant === 'uno_attack' ? '112-card attack' : roomVariant === 'uno_flip' ? '112-card dual-sided' : '108-card'} deck and dealing hands...
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

      {/* Game Variant Banner / Selector */}
      <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
            roomVariant === 'uno_show_em_no_mercy'
              ? 'bg-rose-950/60 text-rose-400 border border-rose-600/40'
              : roomVariant === 'uno_all_wild'
              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
              : roomVariant === 'uno_flex'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : roomVariant === 'uno_teams'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
              : roomVariant === 'uno_attack'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              : roomVariant === 'uno_flip'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
              : 'bg-uno-red/20 text-uno-red border border-uno-red/30'
          }`}>
            {roomVariant === 'uno_show_em_no_mercy' ? 'MERCY' : roomVariant === 'uno_all_wild' ? 'WILD' : roomVariant === 'uno_flex' ? 'FLEX' : roomVariant === 'uno_teams' ? 'TEAMS' : roomVariant === 'uno_attack' ? 'ATTACK' : roomVariant === 'uno_flip' ? 'FLIP' : 'UNO'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white font-display">
                {roomVariant === 'uno_show_em_no_mercy'
                  ? "UNO Show 'em No Mercy"
                  : roomVariant === 'uno_all_wild'
                  ? 'UNO All Wild'
                  : roomVariant === 'uno_flex'
                  ? 'UNO Flex'
                  : roomVariant === 'uno_teams'
                  ? 'UNO Teams'
                  : roomVariant === 'uno_attack'
                  ? 'UNO Attack'
                  : roomVariant === 'uno_flip'
                  ? 'UNO Flip!'
                  : 'Classic UNO'}
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                roomVariant === 'uno_show_em_no_mercy'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
                  : roomVariant === 'uno_all_wild'
                  ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50'
                  : roomVariant === 'uno_flex'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                  : roomVariant === 'uno_teams'
                  ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                  : roomVariant === 'uno_attack'
                  ? 'bg-rose-900/60 text-rose-300 border border-rose-700/50'
                  : roomVariant === 'uno_flip'
                  ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                  : 'bg-red-950/60 text-rose-300 border border-rose-800/50'
              }`}>
                {roomVariant === 'uno_show_em_no_mercy'
                  ? '168 CARDS • MAX 6'
                  : roomVariant === 'uno_all_wild'
                  ? '112 CARDS • ALL WILD'
                  : roomVariant === 'uno_flex'
                  ? '112 CARDS • 8 POWER'
                  : roomVariant === 'uno_teams'
                  ? '112 CARDS • 2–4 TEAMS'
                  : roomVariant === 'uno_attack'
                  ? '112 CARDS • LAUNCHER'
                  : roomVariant === 'uno_flip'
                  ? '112 DUAL-SIDED CARDS'
                  : '108 CARDS'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {roomVariant === 'uno_show_em_no_mercy'
                ? 'Official Mattel HWV18 rules, Stacking (+2 to +10), 7-0 swaps, 25-card Mercy Rule elimination.'
                : roomVariant === 'uno_all_wild'
                ? 'Official Mattel HHL33 rules, 100% wild cards, Targeted Draw 2, Forced Swap.'
                : roomVariant === 'uno_flex'
                ? 'Official Mattel HNB00 rules, Power Cards, flex sides, flip mechanic, targeted draws.'
                : roomVariant === 'uno_teams'
                ? 'Official Mattel HXT58 rules, 2v2 partnership, passing symbols, Wild Team Play, 500-pt team target.'
                : roomVariant === 'uno_attack'
                ? 'Official Mattel GTX66 rules, virtual card launcher, Hit 2, Wild Hit 4, Wild Attack-Attack, Discard All.'
                : roomVariant === 'uno_flip'
                ? 'Light Side vs Dark Side, Flip card, Draw 1 / Draw 5, Skip Everyone.'
                : 'Official Mattel 42001 rules, Wild Draw Four, 4-card UNO challenge penalty.'}
            </p>
          </div>
        </div>

        {isCurrentPlayerHost && (
          <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
            <span className="text-xs text-slate-400 mr-1 hidden sm:inline">Change:</span>
            <button
              type="button"
              data-testid="lobby-toggle-classic"
              disabled={roomVariant === 'classic'}
              onClick={() => updateSettings({ variant: 'classic' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'classic'
                  ? 'bg-uno-red text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-flip"
              disabled={roomVariant === 'uno_flip'}
              onClick={() => updateSettings({ variant: 'uno_flip' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_flip'
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              UNO Flip!
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-no-mercy"
              disabled={roomVariant === 'uno_show_em_no_mercy'}
              onClick={() => updateSettings({ variant: 'uno_show_em_no_mercy' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_show_em_no_mercy'
                  ? 'bg-gradient-to-r from-rose-700 to-red-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              No Mercy
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-all-wild"
              disabled={roomVariant === 'uno_all_wild'}
              onClick={() => updateSettings({ variant: 'uno_all_wild' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_all_wild'
                  ? 'bg-gradient-to-r from-indigo-700 to-fuchsia-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              All Wild
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-flex"
              disabled={roomVariant === 'uno_flex'}
              onClick={() => updateSettings({ variant: 'uno_flex' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_flex'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              UNO Flex
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-teams"
              disabled={roomVariant === 'uno_teams'}
              onClick={() => updateSettings({ variant: 'uno_teams' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_teams'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              UNO Teams
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-attack"
              disabled={roomVariant === 'uno_attack'}
              onClick={() => updateSettings({ variant: 'uno_attack' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                roomVariant === 'uno_attack'
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-glow'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              UNO Attack
            </button>
          </div>
        )}
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
              data-testid="ready-toggle-btn"
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
                data-testid="start-game-btn"
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

      {/* Fair Play & Official Rules Notice */}
      <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-start gap-3 text-xs text-slate-400">
        <Info className="w-4 h-4 text-uno-blue shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-200">
            {roomVariant === 'uno_flip' ? 'Server-Authoritative UNO Flip!' : 'Server-Authoritative Classic UNO'}
          </p>
          <p className="text-[11px] leading-relaxed">
            {roomVariant === 'uno_flip'
              ? 'Official Mattel GDR44 rules: 112 dual-sided cards, Light & Dark sides, Flip card, Draw 1 / Draw 5, Skip Everyone, Wild Draw Two / Wild Draw Color challenges, and 2-card missed UNO penalties.'
              : 'Official Mattel 42001 rules: 108-card deck, non-wild starting card enforcement, UNO declarations & 4-card challenge penalties, Wild Draw Four challenge/accept lifecycles, and multi-round scoring to 500 points.'}
          </p>
        </div>
      </div>
    </div>
  );
};
