import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, AlertCircle, Loader2, Sparkles, ArrowRight, RefreshCw, Play, KeyRound } from 'lucide-react';
import { USERNAME_RULES, RoomMetadataResponse } from '@uno-ultimate/shared';
import { useGuestStore } from '../stores/guestStore';
import { useRoomStore } from '../stores/roomStore';
import { apiRequest } from '../services/apiClient';

export const JoinInvitePage: React.FC = () => {
  const { roomCode: paramRoomCode } = useParams<{ roomCode?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryRoomCode = searchParams.get('room') || searchParams.get('code') || '';
  const initialCode = (paramRoomCode || queryRoomCode || '').trim().toUpperCase();

  const [activeRoomCode, setActiveRoomCode] = useState<string>(initialCode);
  const [manualInputCode, setManualInputCode] = useState('');
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(!initialCode);

  const { guest, createGuest, isResuming, logout } = useGuestStore();
  const { joinRoom, isLoading: isJoiningRoom, error: roomError, clearError: clearRoomError } = useRoomStore();

  const [username, setUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [checkingRoom, setCheckingRoom] = useState(Boolean(initialCode));
  const [roomMetadata, setRoomMetadata] = useState<RoomMetadataResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedAutoJoin, setHasAttemptedAutoJoin] = useState(false);
  const [autoJoinError, setAutoJoinError] = useState<string | null>(null);

  // Sync if URL param changes
  useEffect(() => {
    const nextCode = (paramRoomCode || queryRoomCode || '').trim().toUpperCase();
    if (nextCode && nextCode !== activeRoomCode) {
      setActiveRoomCode(nextCode);
      setIsManualEntryOpen(false);
      setHasAttemptedAutoJoin(false);
      setAutoJoinError(null);
    }
  }, [paramRoomCode, queryRoomCode, activeRoomCode]);

  // Step 1: Pre-check room existence & metadata
  const verifyRoom = useCallback(async (codeToVerify: string) => {
    if (!codeToVerify) {
      setRoomMetadata(null);
      setCheckingRoom(false);
      return;
    }

    setCheckingRoom(true);
    setLocalError(null);
    clearRoomError();

    try {
      const res = await apiRequest<RoomMetadataResponse>(`/api/rooms/${codeToVerify}`);
      if (res.success && res.data) {
        setRoomMetadata(res.data);
      } else {
        setRoomMetadata({ exists: false, error: res.error?.message || 'Room not found' });
      }
    } catch {
      setRoomMetadata({ exists: false, error: 'Unable to verify room' });
    } finally {
      setCheckingRoom(false);
    }
  }, [clearRoomError]);

  useEffect(() => {
    if (activeRoomCode) {
      verifyRoom(activeRoomCode);
    } else {
      setCheckingRoom(false);
    }
  }, [activeRoomCode, verifyRoom]);

  // Step 2: Auto-join for already authenticated guest
  const performJoin = useCallback(async (code: string) => {
    setAutoJoinError(null);
    const joined = await joinRoom({ roomCode: code });
    if (joined) {
      navigate(`/room/${code}`, { replace: true });
    } else {
      const latestError = useRoomStore.getState().error;
      setAutoJoinError(latestError || 'Failed to join room. Please try again.');
    }
  }, [joinRoom, navigate]);

  useEffect(() => {
    if (
      !isResuming &&
      !checkingRoom &&
      guest &&
      roomMetadata?.exists &&
      roomMetadata?.status === 'WAITING' &&
      !roomMetadata.isFull &&
      !hasAttemptedAutoJoin &&
      activeRoomCode
    ) {
      setHasAttemptedAutoJoin(true);
      performJoin(activeRoomCode);
    }
  }, [
    isResuming,
    checkingRoom,
    guest,
    roomMetadata,
    hasAttemptedAutoJoin,
    activeRoomCode,
    performJoin,
  ]);

  // Handle manual code submission
  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualInputCode.trim().toUpperCase();
    if (!clean) {
      setLocalError('Please enter a 6-character room code.');
      return;
    }
    setLocalError(null);
    setIsManualEntryOpen(false);
    setActiveRoomCode(clean);
    setHasAttemptedAutoJoin(false);
    setAutoJoinError(null);
    navigate(`/join/${clean}`, { replace: true });
  };

  // Handle new guest creation and room join
  const handleNewGuestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();

    if (!trimmed) {
      setLocalError('Please choose a username to join.');
      return;
    }
    if (trimmed.length < USERNAME_RULES.MIN_LENGTH || trimmed.length > USERNAME_RULES.MAX_LENGTH) {
      setLocalError(`Username must be between ${USERNAME_RULES.MIN_LENGTH} and ${USERNAME_RULES.MAX_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    setLocalError(null);
    setAutoJoinError(null);

    try {
      const created = await createGuest(trimmed);
      if (created) {
        const joined = await joinRoom({ roomCode: activeRoomCode });
        if (joined) {
          navigate(`/room/${activeRoomCode}`, { replace: true });
        } else {
          const err = useRoomStore.getState().error;
          setLocalError(err || 'Failed to join room.');
        }
      } else {
        const guestErr = useGuestStore.getState().error;
        setLocalError(guestErr || 'Failed to create guest identity.');
      }
    } catch {
      setLocalError('Failed to join room. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // State: Loading / Checking
  if (isResuming || checkingRoom) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-3 border-uno-red border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">
          {activeRoomCode ? `Inspecting room ${activeRoomCode}...` : 'Inspecting invitation...'}
        </p>
      </div>
    );
  }

  // State: Manual Room Code Entry (when no roomCode was provided or user clicked "Enter Code Manually")
  if (isManualEntryOpen || !activeRoomCode) {
    return (
      <div className="w-full max-w-md mx-auto py-12 px-4">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-red via-uno-yellow to-uno-blue" />

          <div className="text-center mb-6 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-uno-blue/10 border border-uno-blue/30 text-uno-blue mx-auto flex items-center justify-center">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="font-display font-black text-2xl text-white">Enter Room Code</h2>
            <p className="text-xs text-slate-400">
              Enter the 6-character room code from your friend or host to join their lobby.
            </p>
          </div>

          <form onSubmit={handleManualCodeSubmit} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="manual-room-code" className="block text-xs font-medium text-slate-300">
                Room Code
              </label>
              <input
                id="manual-room-code"
                type="text"
                value={manualInputCode}
                onChange={(e) => {
                  setManualInputCode(e.target.value.toUpperCase());
                  if (localError) setLocalError(null);
                }}
                placeholder="e.g. AB12CD"
                maxLength={6}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 font-mono text-center tracking-widest text-lg font-bold focus:outline-none focus:border-uno-yellow focus:ring-2 focus:ring-uno-yellow/40 uppercase"
              />

              {localError && (
                <p className="text-xs text-rose-400 pt-1 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{localError}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-6 rounded-xl font-display font-bold text-sm text-white bg-gradient-to-r from-uno-blue to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-glow transition-all flex items-center justify-center gap-2"
            >
              <span>Continue to Room</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Back to Home
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // State: Invalid or Expired Room
  if (!roomMetadata?.exists || roomMetadata?.isExpired) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-xl text-white">Invalid or Expired Invitation</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            The private room code <code className="text-uno-yellow font-mono font-bold">{activeRoomCode}</code> does not exist, has expired, or is no longer available.
          </p>
          <div className="pt-2 space-y-2">
            <button
              onClick={() => {
                setManualInputCode('');
                setIsManualEntryOpen(true);
              }}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-uno-blue/20 hover:bg-uno-blue/30 text-uno-blue border border-uno-blue/40 transition-colors flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Enter Code Manually</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Go to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // State: Match in Progress
  if (roomMetadata.status === 'IN_GAME') {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
            <Play className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-xl text-white">Match Already in Progress</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Room <code className="text-uno-yellow font-mono font-bold">{activeRoomCode}</code> is currently playing a match. New players cannot join once a game has started. Please wait for the match to finish or ask the host for a rematch link.
          </p>
          <div className="pt-2 space-y-2">
            <button
              onClick={() => verifyRoom(activeRoomCode)}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Check Again</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Return to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // State: Room is Full
  if (roomMetadata.isFull) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-xl text-white">Room is Full</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            This private room has reached its maximum capacity of {roomMetadata.maxPlayers} players.
          </p>
          <div className="pt-2 space-y-2">
            <button
              onClick={() => {
                setManualInputCode('');
                setIsManualEntryOpen(true);
              }}
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-uno-blue/20 hover:bg-uno-blue/30 text-uno-blue border border-uno-blue/40 transition-colors flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" />
              <span>Join Another Room</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
            >
              Return to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // State: Existing Guest Auto-Joining / Join Failed
  if (guest) {
    const errorMsg = autoJoinError || roomError;

    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 rounded-3xl border border-slate-700/80 shadow-2xl space-y-5 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-green via-uno-yellow to-uno-blue" />

          {isJoiningRoom && !errorMsg ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-uno-green/10 border border-uno-green/30 text-uno-green mx-auto flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <h2 className="font-display font-bold text-xl text-white">Entering Room...</h2>
              <p className="text-xs text-slate-300">
                Joining room <span className="font-mono font-bold text-uno-yellow">{activeRoomCode}</span> as{' '}
                <span className="font-bold text-white">{guest.username}</span>.
              </p>
            </>
          ) : errorMsg ? (
            <>
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h2 className="font-display font-bold text-xl text-white">Could Not Join Room</h2>
              <p className="text-xs text-rose-300 leading-relaxed">{errorMsg}</p>
              <div className="pt-2 space-y-2">
                <button
                  onClick={() => performJoin(activeRoomCode)}
                  disabled={isJoiningRoom}
                  className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-uno-green to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-glow transition-all flex items-center justify-center gap-2"
                >
                  {isJoiningRoom ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>Try Again</span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setHasAttemptedAutoJoin(false);
                    setAutoJoinError(null);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Join as Different Player
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Return to Home
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-12 h-12 rounded-2xl bg-uno-blue/10 border border-uno-blue/30 text-uno-blue mx-auto flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="font-display font-bold text-xl text-white">Ready to Join</h2>
              <p className="text-xs text-slate-300">
                You are joining room <span className="font-mono font-bold text-uno-yellow">{activeRoomCode}</span> as{' '}
                <span className="font-bold text-white">{guest.username}</span>.
              </p>
              <button
                onClick={() => performJoin(activeRoomCode)}
                className="w-full py-3.5 px-6 rounded-xl font-display font-bold text-sm text-white bg-gradient-to-r from-uno-green to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-glow transition-all flex items-center justify-center gap-2"
              >
                <span>Enter Game Lobby</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // State: New Guest Session Creation Form (username input)
  const displayError = localError || roomError;

  return (
    <div className="w-full max-w-md mx-auto py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-red via-uno-yellow to-uno-blue" />

        <div className="text-center mb-6 space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-uno-blue/10 text-uno-blue border border-uno-blue/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Private Room Invitation</span>
          </div>

          <h2 className="font-display font-black text-2xl text-white">Join UNO Lobby</h2>
          <p className="text-xs text-slate-400">
            You were invited to room{' '}
            <span className="font-mono font-bold text-uno-yellow text-sm tracking-wider">
              {activeRoomCode}
            </span>{' '}
            ({roomMetadata.playerCount}/{roomMetadata.maxPlayers} players)
          </p>
        </div>

        <form onSubmit={handleNewGuestSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="invite-username" className="block text-xs font-medium text-slate-300">
              Choose your player name
            </label>
            <input
              id="invite-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (localError) setLocalError(null);
              }}
              placeholder="e.g. CardPro, Alex"
              maxLength={USERNAME_RULES.MAX_LENGTH}
              autoFocus
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-uno-yellow focus:ring-2 focus:ring-uno-yellow/40 text-sm"
            />

            {displayError && (
              <p className="text-xs text-rose-400 pt-1 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{displayError}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || isJoiningRoom}
            className="w-full py-3.5 px-6 rounded-xl font-display font-bold text-sm text-white bg-gradient-to-r from-uno-red to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting || isJoiningRoom ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Entering Room...</span>
              </>
            ) : (
              <>
                <span>Join Game</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setManualInputCode('');
              setIsManualEntryOpen(true);
            }}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            Enter a different code
          </button>
        </form>
      </motion.div>
    </div>
  );
};
