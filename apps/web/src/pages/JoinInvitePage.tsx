import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, AlertCircle, ArrowRight, RefreshCw, Play, KeyRound } from 'lucide-react';
import { USERNAME_RULES, RoomMetadataResponse } from '@uno-ultimate/shared';
import { useGuestStore } from '../stores/guestStore';
import { useRoomStore } from '../stores/roomStore';
import { apiRequest } from '../services/apiClient';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

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
        <Spinner size="lg" className="text-amber-400" />
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
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="p-6 sm:p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card relative">
            <div className="text-center mb-6 space-y-2">
              <div className="w-11 h-11 rounded-xl bg-[#1a202d] border border-white/[0.08] text-slate-300 mx-auto flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-amber-400" />
              </div>
              <h2 className="font-display font-bold text-2xl text-slate-100">Enter Room Code</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter the 6-character room code from your host to enter their private waiting lounge.
              </p>
            </div>

            <form onSubmit={handleManualCodeSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="manual-room-code" className="block text-xs font-medium text-slate-300 normal-case tracking-normal">
                  Room Code
                </Label>
                <Input
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
                  className="h-12 text-center text-lg font-mono uppercase tracking-[0.2em] font-bold bg-[#10141d] border-white/[0.08] text-amber-300 placeholder:text-slate-600 focus-visible:ring-amber-400/80"
                />

                {localError && (
                  <Alert variant="destructive" className="py-2 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <AlertDescription className="text-xs text-rose-300">
                      {localError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <Button
                type="submit"
                variant="default"
                size="lg"
                className="w-full rounded-xl font-display font-bold text-sm text-white bg-red-600 hover:bg-red-500 shadow-sm border border-red-500/30 gap-2"
              >
                <span>Continue to Room</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="w-full text-xs font-semibold text-slate-400 hover:text-white"
              >
                Back to Home
              </Button>
            </form>
          </Card>
        </motion.div>
      </div>
    );
  }

  // State: Invalid or Expired Room
  if (!roomMetadata?.exists || roomMetadata?.isExpired) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card space-y-4">
            <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-xl text-slate-100">Invalid or Expired Invitation</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              The private room code <code className="text-amber-300 font-mono font-bold">{activeRoomCode}</code> does not exist, has expired, or is no longer available.
            </p>
            <div className="pt-2 space-y-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setManualInputCode('');
                  setIsManualEntryOpen(true);
                }}
                className="w-full py-3 rounded-xl text-xs font-bold bg-[#10141d] hover:bg-[#1a202d] text-slate-200 border-white/[0.08] gap-2"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Enter Code Manually</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Go to Home
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // State: Match in Progress
  if (roomMetadata.status === 'IN_GAME') {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card space-y-4">
            <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto flex items-center justify-center">
              <Play className="w-5 h-5" />
            </div>
            <h2 className="font-display font-bold text-xl text-slate-100">Match Already in Progress</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Room <code className="text-amber-300 font-mono font-bold">{activeRoomCode}</code> is currently playing a match. Please wait for the round to finish or ask the host for a rematch link.
            </p>
            <div className="pt-2 space-y-2">
              <Button
                variant="outline"
                onClick={() => verifyRoom(activeRoomCode)}
                className="w-full py-3 rounded-xl text-xs font-bold bg-[#10141d] hover:bg-[#1a202d] text-amber-300 border-amber-500/30 gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Check Again</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Return to Home
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // State: Room is Full
  if (roomMetadata.isFull) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#1a202d] border border-white/[0.08] text-slate-300 mx-auto flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <h2 className="font-display font-bold text-xl text-slate-100">Room is Full</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              This private room has reached its maximum capacity of {roomMetadata.maxPlayers} players.
            </p>
            <div className="pt-2 space-y-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setManualInputCode('');
                  setIsManualEntryOpen(true);
                }}
                className="w-full py-3 rounded-xl text-xs font-bold bg-[#10141d] hover:bg-[#1a202d] text-slate-200 border-white/[0.08] gap-2"
              >
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>Join Another Room</span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => navigate('/')}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white"
              >
                Return to Home
              </Button>
            </div>
          </Card>
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
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <Card className="p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card space-y-5 relative">
            {isJoiningRoom && !errorMsg ? (
              <>
                <div className="w-11 h-11 rounded-xl bg-[#1a202d] border border-white/[0.08] text-amber-400 mx-auto flex items-center justify-center">
                  <Spinner size="default" className="text-amber-400" />
                </div>
                <h2 className="font-display font-bold text-xl text-slate-100">Entering Room...</h2>
                <p className="text-xs text-slate-400">
                  Joining room <span className="font-mono font-bold text-amber-300">{activeRoomCode}</span> as{' '}
                  <span className="font-bold text-white">{guest.username}</span>.
                </p>
              </>
            ) : errorMsg ? (
              <>
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <h2 className="font-display font-bold text-xl text-slate-100">Could Not Join Room</h2>
                <p className="text-xs text-rose-300 leading-relaxed">{errorMsg}</p>
                <div className="pt-2 space-y-2">
                  <Button
                    variant="default"
                    onClick={() => performJoin(activeRoomCode)}
                    disabled={isJoiningRoom}
                    className="w-full py-3 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-sm border border-red-500/30 gap-2"
                  >
                    {isJoiningRoom ? <Spinner size="sm" className="text-white" /> : <RefreshCw className="w-4 h-4" />}
                    <span>Try Again</span>
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      logout();
                      setHasAttemptedAutoJoin(false);
                      setAutoJoinError(null);
                    }}
                    className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#10141d] hover:bg-[#1a202d] text-slate-300 border-white/[0.06]"
                  >
                    Join as Different Player
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => navigate('/')}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
                  >
                    Return to Home
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="w-11 h-11 rounded-xl bg-[#1a202d] border border-white/[0.08] text-slate-300 mx-auto flex items-center justify-center">
                  <Users className="w-5 h-5 text-amber-400" />
                </div>
                <h2 className="font-display font-bold text-xl text-slate-100">Ready to Join</h2>
                <p className="text-xs text-slate-400">
                  You are joining room <span className="font-mono font-bold text-amber-300">{activeRoomCode}</span> as{' '}
                  <span className="font-bold text-white">{guest.username}</span>.
                </p>
                <Button
                  variant="default"
                  size="lg"
                  onClick={() => performJoin(activeRoomCode)}
                  className="w-full rounded-xl font-display font-bold text-sm text-white bg-red-600 hover:bg-red-500 shadow-sm border border-red-500/30 gap-2"
                >
                  <span>Enter Game Lobby</span>
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    );
  }

  // State: New Guest Session Creation Form (username input)
  const displayError = localError || roomError;

  return (
    <div className="w-full max-w-md mx-auto py-12 px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="p-6 sm:p-8 rounded-2xl bg-[#141924] border-white/[0.08] shadow-card relative">
          <div className="text-center mb-6 space-y-2">
            <Badge variant="secondary" className="gap-1.5 py-1 px-3 bg-[#1a202d] border-white/[0.08] text-slate-300">
              <Users className="w-3.5 h-3.5 text-amber-400" />
              <span>Private Room Invitation</span>
            </Badge>

            <h2 className="font-display font-bold text-2xl text-slate-100">Join UNO Lobby</h2>
            <p className="text-xs text-slate-400">
              You were invited to room{' '}
              <span className="font-mono font-bold text-amber-300 text-sm tracking-wider">
                {activeRoomCode}
              </span>{' '}
              ({roomMetadata.playerCount}/{roomMetadata.maxPlayers} players)
            </p>
          </div>

          <form onSubmit={handleNewGuestSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="invite-username" className="block text-xs font-medium text-slate-300 normal-case tracking-normal">
                Choose your player name
              </Label>
              <Input
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
                className={cn(
                  'h-12 px-4 rounded-xl bg-[#10141d] border-white/[0.08] text-white placeholder:text-slate-600 focus-visible:ring-amber-400/80 text-sm',
                  displayError && 'border-rose-500/80 focus-visible:ring-rose-500'
                )}
              />

              {displayError && (
                <Alert variant="destructive" className="py-2 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <AlertDescription className="text-xs text-rose-300">
                    {displayError}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || isJoiningRoom}
              variant="default"
              size="lg"
              className="w-full rounded-xl font-display font-bold text-sm text-white bg-red-600 hover:bg-red-500 shadow-sm border border-red-500/30 disabled:opacity-50 gap-2"
            >
              {isSubmitting || isJoiningRoom ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  <span>Entering Room...</span>
                </>
              ) : (
                <>
                  <span>Join Game</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setManualInputCode('');
                setIsManualEntryOpen(true);
              }}
              className="w-full text-xs font-semibold text-slate-400 hover:text-white"
            >
              Enter a different code
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
};
