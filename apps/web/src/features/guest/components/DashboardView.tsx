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
    <div className="w-full max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Welcome Hero Banner */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-panel p-6 sm:p-8 rounded-3xl relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-48 h-48 bg-uno-red/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-48 h-48 bg-uno-blue/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Guest Session Active
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Valid until {formattedExpiration}
              </span>
            </div>

            <h1 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight">
              Welcome, <span className="bg-gradient-to-r from-red-400 via-amber-300 to-blue-400 bg-clip-text text-transparent">{guest.username}</span>!
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-xl">
              Your server-validated session is ready. Create a private room or enter a code to join your friends.
            </p>
          </div>

          {/* Guest ID Box */}
          <div className="bg-slate-900/80 border border-slate-700/80 rounded-2xl p-4 w-full sm:w-auto min-w-[240px]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Guest Identity ID
            </span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono text-uno-yellow truncate max-w-[170px]" title={guest.id}>
                {guest.id}
              </code>
              <button
                onClick={copyGuestId}
                aria-label="Copy Guest ID"
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                title="Copy full Guest ID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Server-generated identity key</p>
          </div>
        </div>
      </motion.div>

      {/* Main Room Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Create Private Room Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border-slate-800 relative group hover:border-uno-red/40 transition-colors"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-uno-red/10 border border-uno-red/30 flex items-center justify-center text-uno-red">
                <PlusCircle className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-uno-red/10 border border-uno-red/30 text-uno-red">
                Phase 2 Ready
              </span>
            </div>

            <h3 className="font-display font-bold text-xl text-white mb-2 flex items-center gap-2">
              Create Private Room
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Generate a secure 6-character room code or instant invitation link to host a match exclusively with your friends.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <button
              data-testid="create-room-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="w-full py-3.5 px-4 rounded-xl font-display font-bold text-sm tracking-wide text-white bg-gradient-to-r from-uno-red to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-glow transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Create Room</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Instant link and code generated upon creation
            </p>
          </div>
        </motion.div>

        {/* Join Room Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="glass-panel rounded-3xl p-6 sm:p-8 flex flex-col justify-between border-slate-800 relative group hover:border-uno-blue/40 transition-colors"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-uno-blue/10 border border-uno-blue/30 flex items-center justify-center text-uno-blue">
                <LogIn className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-uno-blue/10 border border-uno-blue/30 text-uno-blue">
                Phase 2 Ready
              </span>
            </div>

            <h3 className="font-display font-bold text-xl text-white mb-2 flex items-center gap-2">
              Join Private Room
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Enter a friend's 6-character code to enter the private lobby. Zero matchmaking, no strangers, just your group.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-800/80">
            <button
              data-testid="join-room-btn"
              onClick={() => setIsJoinModalOpen(true)}
              className="w-full py-3.5 px-4 rounded-xl font-display font-bold text-sm tracking-wide text-white bg-gradient-to-r from-uno-blue to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-glow-blue transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Join Room</span>
            </button>
            <p className="text-[11px] text-center text-slate-500 mt-2">
              Enter 6-character code or click an invite link
            </p>
          </div>
        </motion.div>
      </div>

      {/* Architectural Security & Rules Pillar Callout */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-400 space-y-2"
      >
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Server-Authoritative Fair Play Foundation</span>
        </div>
        <p className="leading-relaxed">
          UNO Ultimate runs an authoritative server architecture. The game state, deck shuffling, and card deal order remain strictly concealed on the server. Clients receive only their own private cards and public opponent card counts, rendering card-peeking and client-side manipulation impossible.
        </p>
        <div className="pt-2 flex flex-wrap gap-4 text-[11px] text-slate-400">
          <span>✓ Real-Time Socket.IO Lobby Presence</span>
          <span>✓ 30-Second Reconnection Grace Period</span>
          <span>✓ Deterministic Host Transfer</span>
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
