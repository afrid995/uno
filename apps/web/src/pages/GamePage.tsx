import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { useChatStore } from '../stores/chatStore';
import { GameBoard } from '../features/game/components/GameBoard';
import { NetworkRecoveryOverlay } from '../features/game/components/NetworkRecoveryOverlay';
import { CardAnimationOverlay } from '../features/game/components/CardAnimationOverlay';
import { ChatPanel } from '../features/chat/ChatPanel';
import { ChatToggleButton } from '../features/chat/ChatToggleButton';
import { AudioSettingsControl } from '../components/common/AudioSettingsControl';
import { LogOut, Copy, Check } from 'lucide-react';

const getVariantTitle = (variant?: string): string => {
  switch (variant) {
    case 'uno_flip':
      return 'UNO FLIP';
    case 'uno_show_em_no_mercy':
      return "UNO SHOW 'EM NO MERCY";
    case 'uno_all_wild':
      return 'UNO ALL WILD';
    case 'uno_flex':
      return 'UNO FLEX';
    case 'uno_teams':
      return 'UNO TEAMS';
    case 'uno_attack':
      return 'UNO ATTACK';
    default:
      return 'CLASSIC UNO';
  }
};

export const GamePage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { guest } = useGuestStore();
  const { leaveRoom } = useRoomStore();
  const { initGameListeners, gameState } = useGameStore();
  const { initChatListeners } = useChatStore();

  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!roomCode) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (!guest) {
      navigate('/', { replace: true });
      return;
    }

    const cleanupGame = initGameListeners(roomCode);
    const cleanupChat = initChatListeners(roomCode);
    return () => {
      cleanupGame();
      cleanupChat();
      useGameStore.getState().reset();
      useChatStore.getState().reset();
    };
  }, [roomCode, guest, initGameListeners, initChatListeners, navigate]);

  const handleLeave = async () => {
    useGameStore.getState().reset();
    useChatStore.getState().reset();
    await leaveRoom();
    navigate('/dashboard');
  };

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col justify-between safe-p py-1 sm:py-2 select-none overflow-hidden">
      {/* Top Header Row */}
      <header className="w-full max-w-7xl mx-auto px-2 sm:px-4 flex items-center justify-between py-1.5 border-b border-white/[0.08] mb-0.5 sm:mb-1 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="font-display font-bold text-sm tracking-wide text-white">
              {getVariantTitle(gameState?.variant)}
            </span>
          </div>

          {/* Room Code Badge */}
          {roomCode && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-white/[0.08] hover:border-white/[0.15] text-xs text-slate-300 transition-colors cursor-pointer"
              title="Click to copy Room Code"
            >
              <span className="text-[10px] text-slate-400 uppercase font-mono">Room:</span>
              <span className="font-mono font-bold text-amber-300">{roomCode}</span>
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400 ml-0.5" />
              ) : (
                <Copy className="w-3 h-3 text-slate-400 ml-0.5" />
              )}
            </button>
          )}

          {gameState && (
            <span className="hidden sm:inline-block text-xs text-slate-400 font-mono">
              Round {gameState.roundNumber}
            </span>
          )}
        </div>

        {/* Right side controls: Audio Settings, Chat Toggle & Leave Match */}
        <div className="flex items-center gap-2">
          <AudioSettingsControl />
          <ChatToggleButton />

          {confirmLeave ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400 font-medium hidden sm:inline">
                Forfeit & leave?
              </span>
              <button
                onClick={handleLeave}
                className="py-1 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-sm"
              >
                Yes, Leave
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="py-1 px-2.5 rounded-lg text-xs bg-surface-panel text-slate-300 hover:text-white border border-white/[0.06] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="py-1 px-2.5 rounded-lg text-xs text-slate-400 hover:text-rose-400 bg-surface-card hover:bg-rose-500/10 border border-white/[0.08] hover:border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Leave Match</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Game Board */}
      <main className="w-full flex-1 flex flex-col justify-center min-h-0 overflow-hidden">
        <GameBoard />
      </main>

      {/* Network Recovery & Reconnection Overlay */}
      <NetworkRecoveryOverlay />

      {/* Floating Card Animation Layer */}
      <CardAnimationOverlay />

      {/* Floating Real-Time Chat Panel */}
      <ChatPanel />
    </div>
  );
};
