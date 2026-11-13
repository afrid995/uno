import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, AlertCircle, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { USERNAME_RULES, RoomMetadataResponse } from '@uno-ultimate/shared';
import { useGuestStore } from '../stores/guestStore';
import { useRoomStore } from '../stores/roomStore';
import { apiRequest } from '../services/apiClient';

export const JoinInvitePage: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();

  const { guest, createGuest, isResuming } = useGuestStore();
  const { joinRoom, isLoading: isJoiningRoom, error: roomError } = useRoomStore();

  const [username, setUsername] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [checkingRoom, setCheckingRoom] = useState(true);
  const [roomMetadata, setRoomMetadata] = useState<RoomMetadataResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cleanRoomCode = (roomCode || '').trim().toUpperCase();

  // Step 1: Pre-check room existence
  useEffect(() => {
    let isMounted = true;
    async function checkRoom() {
      if (!cleanRoomCode) {
        navigate('/', { replace: true });
        return;
      }

      try {
        const res = await apiRequest<RoomMetadataResponse>(`/api/rooms/${cleanRoomCode}`);
        if (isMounted) {
          if (res.success && res.data) {
            setRoomMetadata(res.data);
          } else {
            setRoomMetadata({ exists: false, error: 'Room not found' });
          }
          setCheckingRoom(false);
        }
      } catch {
        if (isMounted) {
          setRoomMetadata({ exists: false, error: 'Unable to verify room' });
          setCheckingRoom(false);
        }
      }
    }

    checkRoom();
    return () => {
      isMounted = false;
    };
  }, [cleanRoomCode, navigate]);

  // Step 2: If guest session already exists, join immediately
  useEffect(() => {
    if (!checkingRoom && guest && roomMetadata?.exists && !roomMetadata.isFull) {
      joinRoom({ roomCode: cleanRoomCode }).then((success) => {
        if (success) {
          navigate(`/room/${cleanRoomCode}`, { replace: true });
        }
      });
    }
  }, [checkingRoom, guest, roomMetadata, cleanRoomCode, joinRoom, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();

    if (!trimmed) {
      setLocalError('Please choose a username to join.');
      return false;
    }
    if (trimmed.length < USERNAME_RULES.MIN_LENGTH || trimmed.length > USERNAME_RULES.MAX_LENGTH) {
      setLocalError(`Username must be between ${USERNAME_RULES.MIN_LENGTH} and ${USERNAME_RULES.MAX_LENGTH} characters.`);
      return false;
    }

    setIsSubmitting(true);
    setLocalError(null);

    try {
      const created = await createGuest(trimmed);
      if (created) {
        const joined = await joinRoom({ roomCode: cleanRoomCode });
        if (joined) {
          navigate(`/room/${cleanRoomCode}`, { replace: true });
        }
      }
    } catch {
      setLocalError('Failed to join room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isResuming || checkingRoom) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-3">
        <div className="w-10 h-10 border-3 border-uno-red border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Inspecting invitation...</p>
      </div>
    );
  }

  if (!roomMetadata?.exists) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-xl text-white">Invalid or Expired Invitation</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            The private room code <code className="text-uno-yellow font-mono">{cleanRoomCode}</code> does not exist, has expired, or has finished.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  if (roomMetadata.isFull) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <div className="glass-panel p-8 rounded-3xl border border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="font-display font-bold text-xl text-white">Room is Full</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            This private room has reached its maximum capacity of {roomMetadata.maxPlayers} players.
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

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
              {cleanRoomCode}
            </span>{' '}
            ({roomMetadata.playerCount}/{roomMetadata.maxPlayers} players)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
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
        </form>
      </motion.div>
    </div>
  );
};
