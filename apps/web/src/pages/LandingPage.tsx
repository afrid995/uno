import React from 'react';
import { motion } from 'framer-motion';
import { Users, Shield, Zap } from 'lucide-react';
import { GuestLoginForm } from '../features/guest/components/GuestLoginForm';
import { UnoCardVisual } from '../components/common/UnoCardVisual';

export const LandingPage: React.FC = () => {
  return (
    <div className="w-full flex flex-col items-center justify-center py-10 sm:py-18 px-4">
      {/* Hero Visual Section - Physical Cardstack Fan */}
      <div className="relative mb-10 sm:mb-12 flex items-center justify-center">
        <div className="relative flex items-center justify-center h-44 sm:h-52 w-72 sm:w-80">
          <UnoCardVisual color="blue" value="4" rotation={-16} className="-mr-12 sm:-mr-16 z-10" />
          <UnoCardVisual color="yellow" value="7" rotation={-6} className="-mr-12 sm:-mr-16 z-20" />
          <UnoCardVisual color="red" value="U" rotation={6} className="-mr-12 sm:-mr-16 z-30 ring-1 ring-white/20" />
          <UnoCardVisual color="green" value="2" rotation={18} className="z-20" />
        </div>
      </div>

      {/* Main Title & Pitch */}
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-3.5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-card border border-white/[0.08] text-xs font-medium text-slate-300 shadow-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Private Online Card Game for Friends</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="font-display font-black text-4xl sm:text-6xl text-white tracking-tight leading-tight"
        >
          UNO <span className="text-amber-400">ULTIMATE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed"
        >
          No accounts, no matchmaking, no clutter. Choose a table name, share a private link, and play official UNO variants with your friends.
        </motion.p>
      </div>

      {/* Guest Login Form */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.24 }}
        className="w-full"
      >
        <GuestLoginForm />
      </motion.div>

      {/* Pillars Overview */}
      <div className="mt-16 sm:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl w-full text-left">
        <div className="p-6 rounded-2xl bg-surface-card border border-white/[0.07] shadow-card">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-white/[0.08] flex items-center justify-center text-amber-400 mb-4">
            <Users className="w-4 h-4" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1.5">Private Rooms Only</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Invite-only rooms with 6-character access codes. No public lobbies, random matchmaking, or unexpected players.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-card border border-white/[0.07] shadow-card">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-white/[0.08] flex items-center justify-center text-emerald-400 mb-4">
            <Zap className="w-4 h-4" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1.5">Instant Guest Sessions</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Pick a handle and play immediately. Ephemeral session tokens persist across browser refreshes and reconnection drops.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-surface-card border border-white/[0.07] shadow-card">
          <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-white/[0.08] flex items-center justify-center text-sky-400 mb-4">
            <Shield className="w-4 h-4" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1.5">Authoritative Engine</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Deck state and opponent hands exist solely on the server. Zero client peeking, with complete rule enforcement across all variants.
          </p>
        </div>
      </div>
    </div>
  );
};
