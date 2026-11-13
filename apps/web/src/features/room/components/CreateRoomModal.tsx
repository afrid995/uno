import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Users, Sparkles, Loader2, PlusCircle } from 'lucide-react';
import { ROOM_RULES } from '@uno-ultimate/shared';
import { useRoomStore } from '../../../stores/roomStore';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ isOpen, onClose }) => {
  const [maxPlayers, setMaxPlayers] = useState<number>(ROOM_RULES.DEFAULT_MAX_PLAYERS);
  const { createRoom, isLoading, error, clearError } = useRoomStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const success = await createRoom({ maxPlayers });
    if (success) {
      const room = useRoomStore.getState().room;
      if (room) {
        onClose();
        navigate(`/room/${room.roomCode}`);
      }
    }
  };

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
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-uno-red via-uno-yellow to-uno-blue" />

          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-uno-red/10 border border-uno-red/30 flex items-center justify-center text-uno-red">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-bold text-xl text-white">Create Private Room</h3>
                <p className="text-xs text-slate-400">Host a game with your friends</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-6">
            {/* Max Players Selector */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs">
                <label className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-uno-yellow" />
                  Player Capacity
                </label>
                <span className="font-mono text-sm text-uno-yellow font-bold">
                  {maxPlayers} Players
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                {[2, 4, 6, 8, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPlayers(num)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold font-display border transition-all ${
                      maxPlayers === num
                        ? 'bg-uno-red text-white border-uno-red shadow-glow'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                Mattel standard rooms support 2 to 10 players (default 6).
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

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
                disabled={isLoading}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold font-display text-white bg-gradient-to-r from-uno-red to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-glow disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Create Room</span>
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
