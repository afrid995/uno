import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/gameStore';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { GameBoard } from '../features/game/components/GameBoard';
import { LogOut, Copy, Check } from 'lucide-react';

export const GamePage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { guest } = useGuestStore();
  const { leaveRoom } = useRoomStore();
  const { initGameListeners, gameState } = useGameStore();

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

    const cleanup = initGameListeners(roomCode);
    return () => {
      cleanup();
      useGameStore.getState().reset();
    };
  }, [roomCode, guest, initGameListeners, navigate]);

  const handleLeave = async () => {
    useGameStore.getState().reset();
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
    <div className="w-full flex-1 flex flex-col justify-between py-2">
      {/* Top Header Row */}
      <header className="w-full max-w-7xl mx-auto px-4 flex items-center justify-between py-1 border-b border-slate-800/80 mb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-display font-black text-sm tracking-wide text-white">
              CLASSIC UNO
            </span>
          </div>

          {/* Room Code Badge */}
          {roomCode && (
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 transition-colors"
              title="Click to copy Room Code"
            >
              <span className="text-[10px] text-slate-500 uppercase font-mono">Room:</span>
              <span className="font-mono font-bold text-amber-400">{roomCode}</span>
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

        {/* Leave Match Control */}
        <div>
          {confirmLeave ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-400 font-medium hidden sm:inline">
                Forfeit & leave?
              </span>
              <button
                onClick={handleLeave}
                className="py-1 px-3 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors"
              >
                Yes, Leave
              </button>
              <button
                onClick={() => setConfirmLeave(false)}
                className="py-1 px-2.5 rounded-lg text-xs bg-slate-800 text-slate-300 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmLeave(true)}
              className="py-1 px-2.5 rounded-lg text-xs text-slate-400 hover:text-rose-400 bg-slate-900/60 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Leave Match</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Game Board */}
      <main className="w-full flex-1 flex flex-col justify-center">
        <GameBoard />
      </main>
    </div>
  );
};
