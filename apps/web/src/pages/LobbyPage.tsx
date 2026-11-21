import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  LogOut,
  Play,
  CheckCircle2,
  Info,
  Loader2,
} from 'lucide-react';
import { RoomMemberPublicDto } from '@uno-ultimate/shared';
import { SOCKET_EVENTS } from '@uno-ultimate/game-protocol';
import { socketManager } from '../services/socketClient';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { useGameStore } from '../stores/gameStore';
import { PlayerCard } from '../features/room/components/PlayerCard';
import { InviteLinkCard } from '../features/room/components/InviteLinkCard';
import { useChatStore } from '../stores/chatStore';
import { ChatPanel } from '../features/chat/ChatPanel';
import { ChatToggleButton } from '../features/chat/ChatToggleButton';

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

  // Reset game store on entering lobby to guarantee fresh state
  useEffect(() => {
    useGameStore.getState().reset();
  }, []);

  // Initialize socket listeners on mount
  useEffect(() => {
    const cleanup = initSocketListeners();
    return () => cleanup();
  }, [initSocketListeners]);

  // Initialize chat listeners for the lobby
  useEffect(() => {
    if (!roomCode) return;
    const cleanupChat = useChatStore.getState().initChatListeners(roomCode);
    return () => {
      cleanupChat();
    };
  }, [roomCode]);

  // Navigate to game if room status is already IN_GAME
  useEffect(() => {
    if (room?.status === 'IN_GAME' && roomCode) {
      navigate(`/game/${roomCode}`, { replace: true });
    }
  }, [room?.status, roomCode, navigate]);

  // Listen for game:started socket event to navigate to game table
  useEffect(() => {
    const socket = socketManager.getSocket();
    const handleGameStarted = (payload?: { matchId?: string; roomCode?: string }) => {
      // Diagnostic timing
      const clickTimeStr = sessionStorage.getItem('uno_start_game_click_time');
      if (clickTimeStr) {
        const elapsedMs = Date.now() - parseInt(clickTimeStr, 10);
        // eslint-disable-next-line no-console
        console.info(`[UNO Client] Game started received in ${elapsedMs}ms after host click`, {
          matchId: payload?.matchId,
          roomCode,
          elapsedMs,
        });
        sessionStorage.removeItem('uno_start_game_click_time');
      }
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
    sessionStorage.setItem('uno_start_game_click_time', Date.now().toString());
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
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="p-6 rounded-2xl bg-surface-card border border-amber-500/40 text-white text-center shadow-brass mb-6"
          >
            <div className="flex items-center justify-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
              <h2 className="font-display font-bold text-xl sm:text-2xl text-amber-200 tracking-tight">Starting Game Match</h2>
            </div>
            <p className="text-sm text-slate-300 max-w-lg mx-auto">
              Match countdown initiated ({startingCountdown}s). Preparing the {roomVariant === 'uno_show_em_no_mercy' ? '168-card' : roomVariant === 'uno_all_wild' ? '112-card all-wild' : roomVariant === 'uno_flex' ? '112-card flex' : roomVariant === 'uno_teams' ? '112-card teams' : roomVariant === 'uno_attack' ? `${Number((room.settings as Record<string, unknown>)?.attackCustomizableCount) === 1 ? '110-card' : '112-card'} attack` : roomVariant === 'uno_flip' ? '112-card dual-sided' : '108-card'} deck and dealing hands...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Banner & Room Code Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Lobby Active
            </span>
            <span className="text-xs text-slate-500 font-mono">v{room.version}</span>
          </div>
          <h1 className="font-display font-bold text-2xl sm:text-3xl text-slate-100 tracking-tight mt-1.5">
            Private Game Lobby
          </h1>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2">
          <ChatToggleButton />

          {/* Player count indicator */}
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-card border border-white/[0.08] text-xs text-slate-300">
            <Users className="w-4 h-4 text-slate-400" />
            <span className="font-bold font-mono text-white">
              {room.playerCount} / {room.maxPlayers}
            </span>
            <span className="text-slate-400">Players</span>
          </div>
        </div>
      </div>

      {/* Game Variant Banner / Selector */}
      <div className="p-4 rounded-2xl bg-surface-card border border-white/[0.08] shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs tracking-wider ${
            roomVariant === 'uno_show_em_no_mercy'
              ? 'bg-rose-950/70 text-rose-300 border border-rose-700/50'
              : roomVariant === 'uno_all_wild'
              ? 'bg-purple-950/70 text-purple-300 border border-purple-700/50'
              : roomVariant === 'uno_flex'
              ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/50'
              : roomVariant === 'uno_teams'
              ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-700/50'
              : roomVariant === 'uno_attack'
              ? 'bg-red-950/70 text-red-300 border border-red-700/50'
              : roomVariant === 'uno_flip'
              ? 'bg-indigo-950/70 text-indigo-300 border border-indigo-700/50'
              : 'bg-red-950/70 text-red-300 border border-red-700/50'
          }`}>
            {roomVariant === 'uno_show_em_no_mercy' ? 'MERCY' : roomVariant === 'uno_all_wild' ? 'WILD' : roomVariant === 'uno_flex' ? 'FLEX' : roomVariant === 'uno_teams' ? 'TEAMS' : roomVariant === 'uno_attack' ? 'ATTACK' : roomVariant === 'uno_flip' ? 'FLIP' : 'UNO'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-100 font-display">
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
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md ${
                roomVariant === 'uno_show_em_no_mercy'
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-700/60'
                  : roomVariant === 'uno_all_wild'
                  ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                  : roomVariant === 'uno_flex'
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                  : roomVariant === 'uno_teams'
                  ? 'bg-cyan-900/60 text-cyan-300 border border-cyan-700/50'
                  : roomVariant === 'uno_attack'
                  ? 'bg-red-900/60 text-red-300 border border-red-700/50'
                  : roomVariant === 'uno_flip'
                  ? 'bg-indigo-900/60 text-indigo-300 border border-indigo-700/50'
                  : 'bg-red-950/60 text-red-300 border border-red-800/50'
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
                  ? `${Number((room.settings as Record<string, unknown>)?.attackCustomizableCount) === 1 ? 110 : 112} CARDS • LAUNCHER`
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
          <div className="flex items-center gap-1.5 self-stretch sm:self-auto flex-wrap">
            <span className="text-xs text-slate-400 mr-1 hidden sm:inline">Change:</span>
            <button
              type="button"
              data-testid="lobby-toggle-classic"
              disabled={roomVariant === 'classic'}
              onClick={() => updateSettings({ variant: 'classic' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'classic'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-flip"
              disabled={roomVariant === 'uno_flip'}
              onClick={() => updateSettings({ variant: 'uno_flip' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_flip'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              UNO Flip!
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-no-mercy"
              disabled={roomVariant === 'uno_show_em_no_mercy'}
              onClick={() => updateSettings({ variant: 'uno_show_em_no_mercy' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_show_em_no_mercy'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              No Mercy
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-all-wild"
              disabled={roomVariant === 'uno_all_wild'}
              onClick={() => updateSettings({ variant: 'uno_all_wild' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_all_wild'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              All Wild
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-flex"
              disabled={roomVariant === 'uno_flex'}
              onClick={() => updateSettings({ variant: 'uno_flex' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_flex'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              UNO Flex
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-teams"
              disabled={roomVariant === 'uno_teams'}
              onClick={() => updateSettings({ variant: 'uno_teams' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_teams'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
              }`}
            >
              UNO Teams
            </button>
            <button
              type="button"
              data-testid="lobby-toggle-attack"
              disabled={roomVariant === 'uno_attack'}
              onClick={() => updateSettings({ variant: 'uno_attack' })}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                roomVariant === 'uno_attack'
                  ? 'bg-amber-400/15 border border-amber-400/80 text-amber-300 shadow-brass'
                  : 'bg-surface-panel text-slate-400 hover:text-white hover:bg-surface-elevated border border-white/[0.06]'
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
      <div className="p-5 sm:p-6 rounded-2xl bg-surface-card border border-white/[0.08] shadow-card flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {confirmLeave ? (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-rose-400 font-medium">Leave room?</span>
              <button
                onClick={handleLeave}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors shadow-card"
              >
                Yes, Leave
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="py-2.5 px-3 rounded-xl text-xs bg-surface-panel text-slate-300 hover:text-white border border-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-400 bg-surface-panel hover:bg-rose-500/10 border border-white/[0.06] hover:border-rose-500/30 transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
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
              className={`py-3.5 px-6 rounded-xl font-display font-bold text-xs tracking-wide transition-all shadow-card flex items-center justify-center gap-2 w-full sm:w-auto ${
                isCurrentPlayerReady
                  ? 'bg-surface-panel text-slate-300 hover:bg-surface-elevated border border-white/[0.1]'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/30'
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
                disabled={!canStartMatch || isStarting}
                className={`py-3.5 px-7 rounded-xl font-display font-bold text-xs tracking-wide transition-all shadow-card flex items-center justify-center gap-2 w-full sm:w-auto select-none ${
                  isStarting
                    ? 'bg-surface-panel text-amber-400 border border-amber-500/40 cursor-wait'
                    : canStartMatch
                    ? 'bg-red-600 hover:bg-red-500 text-white border border-red-500/50 hover:border-red-400 cursor-pointer active:scale-[0.98]'
                    : 'bg-surface-panel/80 border border-white/[0.06] text-slate-500 cursor-not-allowed'
                }`}
              >
                {isStarting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Starting Game...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Game</span>
                  </>
                )}
              </button>

              {!canStartMatch && !isStarting && (
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
      <div className="p-4 rounded-2xl bg-surface-card border border-white/[0.06] flex items-start gap-3 text-xs text-slate-400">
        <Info className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-200">
            {roomVariant === 'uno_flip' ? 'Server-Authoritative UNO Flip!' : 'Server-Authoritative Classic UNO'}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-400">
            {roomVariant === 'uno_flip'
              ? 'Official Mattel GDR44 rules: 112 dual-sided cards, Light & Dark sides, Flip card, Draw 1 / Draw 5, Skip Everyone, Wild Draw Two / Wild Draw Color challenges, and 2-card missed UNO penalties.'
              : 'Official Mattel 42001 rules: 108-card deck, non-wild starting card enforcement, UNO declarations & 4-card challenge penalties, Wild Draw Four challenge/accept lifecycles, and multi-round scoring to 500 points.'}
          </p>
        </div>
      </div>

      {/* Floating Chat Panel */}
      <ChatPanel />
    </div>
  );
};
