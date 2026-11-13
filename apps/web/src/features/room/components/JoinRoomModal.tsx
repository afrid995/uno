import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LogIn, Loader2, ArrowRight } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';

interface JoinRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const JoinRoomModal: React.FC<JoinRoomModalProps> = ({ isOpen, onClose }) => {
  const [roomCode, setRoomCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const { joinRoom, isLoading, error: storeError, clearError } = useRoomStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Uppercase automatically and remove invalid characters
    const clean = e.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
    setRoomCode(clean.slice(0, ROOM_RULES.CODE_LENGTH));
    if (localError) setLocalError(null);
    if (storeError) clearError();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== ROOM_RULES.CODE_LENGTH) {
      setLocalError(`Room code must be exactly ${ROOM_RULES.CODE_LENGTH} characters.`);
      return;
    }

    clearError();
    const success = await joinRoom({ roomCode });
    if (success) {
      onClose();
      navigate(`/room/${roomCode}`);
    }
  };

  const displayError = localError || storeError;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="glass-panel w-full max-w-md p-6 sm:p-8 rounded-3xl border border-slate-700/80 shadow-2xl relative overflow-hidden"
        >
          {/* Header Accent */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-blue via-emerald-400 to-uno-yellow" />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-uno-blue/10 border border-uno-blue/30 flex items-center justify-center text-uno-blue">
                <LogIn className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white">Join Private Room</h3>
                <p className="text-xs text-slate-400">Enter a friend's 6-character room code</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleJoin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="room-code-input" className="block text-xs font-medium text-slate-300">
                Room Code
              </label>

              <div className="relative">
                <input
                  id="room-code-input"
                  type="text"
                  value={roomCode}
                  onChange={handleInputChange}
                  placeholder="e.g. 7X8K2M"
                  maxLength={ROOM_RULES.CODE_LENGTH}
                  autoComplete="off"
                  autoFocus
                  className="w-full text-center text-2xl font-mono uppercase tracking-[0.3em] font-extrabold py-3.5 px-4 rounded-xl bg-slate-900 border border-slate-700 text-uno-yellow placeholder-slate-600 focus:border-uno-yellow focus:ring-2 focus:ring-uno-yellow/40 focus:outline-none transition-all"
                />
              </div>

              {displayError && (
                <p className="text-xs text-rose-400 pt-1 flex items-center gap-1.5">
                  <span>{displayError}</span>
                </p>
              )}

              <p className="text-[11px] text-slate-500">
                Codes are 6 uppercase letters and numbers (excluding 0, O, 1, I).
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || roomCode.length !== ROOM_RULES.CODE_LENGTH}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-display text-white bg-gradient-to-r from-uno-blue to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-glow-blue disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Joining...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Room</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
