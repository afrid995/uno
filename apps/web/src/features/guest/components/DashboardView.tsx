import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { PlusCircle, LogIn, Clock, ShieldCheck, Copy, Check } from 'lucide-react';
import { useGuestStore } from '../../../stores/guestStore';
import { CreateRoomModal } from '../../room/components/CreateRoomModal';
import { JoinRoomModal } from '../../room/components/JoinRoomModal';

export const DashboardView: React.FC = () => {
  const { guest, logout } = useGuestStore();
  const [copied, setCopied] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  if (!guest) return null;

  const copyGuestId = () => {
    navigator.clipboard.writeText(guest.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedExpiration = new Date(guest.expiresAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Welcome Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-surface-card border border-white/[0.08] p-6 sm:p-8 rounded-2xl shadow-card"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Guest Session Active
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Valid until {formattedExpiration}
              </span>
            </div>

            <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
              Welcome, <span className="text-amber-400">{guest.username}</span>!
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl leading-relaxed">
              Your session is active. Create a private room to host or enter a 6-character room code to join your friends.
            </p>
          </div>

          {/* Guest ID Box */}
          <div className="bg-surface-panel border border-white/[0.06] rounded-xl p-4 w-full sm:w-auto min-w-[220px]">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400 block mb-1">
              Guest Identity ID
            </span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-amber-300 truncate max-w-[160px]" title={guest.id}>
                {guest.id}
              </code>
              <button
                onClick={copyGuestId}
                aria-label="Copy Guest ID"
                className="p-1.5 rounded-lg bg-surface-elevated hover:bg-surface-highlight text-slate-300 hover:text-white transition-colors border border-white/[0.06]"
                title="Copy full Guest ID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Temporary authentication key</p>
          </div>
        </div>
      </motion.div>

      {/* Main Room Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Create Private Room Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="bg-surface-card border border-white/[0.08] rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-card hover:border-red-500/30 transition-colors"
        >
          <div>
            <div className="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 mb-4">
              <PlusCircle className="w-5 h-5" />
            </div>

            <h3 className="font-display font-bold text-xl text-white mb-2">
              Create Private Room
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Host a match with your preferred UNO variant, customize player limits, and share an instant invite link with friends.
            </p>
          </div>

          <div className="mt-8 pt-5 border-t border-white/[0.06]">
            <button
              data-testid="create-room-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full py-3.5 px-4 rounded-xl font-display font-bold text-sm tracking-wide text-white bg-red-600 hover:bg-red-500 active:bg-red-700 shadow-sm border border-red-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Room</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              6-character code generated automatically
            </p>
          </div>
        </motion.div>

        {/* Join Room Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-surface-card border border-white/[0.08] rounded-2xl p-6 sm:p-7 flex flex-col justify-between shadow-card hover:border-blue-500/30 transition-colors"
        >
          <div>
            <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
              <LogIn className="w-5 h-5" />
            </div>

            <h3 className="font-display font-bold text-xl text-white mb-2">
              Join Private Room
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Enter a friend's room code or follow their direct invite link to enter the private waiting lobby.
            </p>
          </div>

          <div className="mt-8 pt-5 border-t border-white/[0.06]">
            <button
              data-testid="join-room-btn"
              onClick={() => setIsJoinModalOpen(true)}
              className="w-full py-3.5 px-4 rounded-xl font-display font-bold text-sm tracking-wide text-white bg-surface-elevated hover:bg-surface-highlight text-slate-100 hover:text-white border border-white/[0.12] transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4 text-slate-300" />
              <span>Join Room</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Paste code or accept invitation URL
            </p>
          </div>
        </motion.div>
      </div>

      {/* Architectural Security & Rules Pillar Callout */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="p-5 rounded-2xl bg-surface-panel border border-white/[0.06] text-xs text-slate-400 space-y-2"
      >
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Server-Authoritative Fair Play Foundation</span>
        </div>
        <p className="leading-relaxed">
          UNO Ultimate runs an authoritative server architecture. The game state, deck shuffling, and card deal order remain strictly concealed on the server. Clients receive only their own private cards and public opponent card counts, rendering card-peeking and client-side manipulation impossible.
        </p>
        <div className="pt-1 flex flex-wrap gap-4 text-[11px] text-slate-400">
          <span className="text-emerald-400/90">✓ Real-Time Socket.IO Lobby Presence</span>
          <span className="text-emerald-400/90">✓ 30-Second Reconnection Grace Period</span>
          <span className="text-emerald-400/90">✓ Deterministic Host Transfer</span>
        </div>
      </motion.div>

      {/* Switch Guest Button */}
      <div className="text-center pt-2">
        <button
          onClick={logout}
          className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-4 transition-colors"
        >
          Change Username or Start a New Guest Session
        </button>
      </div>

      {/* Modals */}
      <CreateRoomModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />
      <JoinRoomModal isOpen={isJoinModalOpen} onClose={() => setIsJoinModalOpen(false)} />
    </div>
  );
};
