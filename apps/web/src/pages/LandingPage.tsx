import React from 'react';
import { motion } from 'framer-motion';
import { Users, Shield, Zap } from 'lucide-react';
import { GuestLoginForm } from '../features/guest/components/GuestLoginForm';
import { UnoCardVisual } from '../components/common/UnoCardVisual';

export const LandingPage: React.FC = () => {
  return (
    <div className="w-full flex flex-col items-center justify-center py-8 sm:py-16 px-4">
      {/* Hero Visual Section */}
      <div className="relative mb-8 sm:mb-10 flex items-center justify-center">
        {/* Fanned Out Original Uno Cards */}
        <div className="relative flex items-center justify-center h-44 sm:h-52 w-72 sm:w-80">
          <UnoCardVisual color="blue" value="4" rotation={-16} className="-mr-12 sm:-mr-16 z-10" />
          <UnoCardVisual color="yellow" value="7" rotation={-6} className="-mr-12 sm:-mr-16 z-20" />
          <UnoCardVisual color="red" value="U" rotation={6} className="-mr-12 sm:-mr-16 z-30 ring-1 ring-white/20" />
          <UnoCardVisual color="green" value="2" rotation={18} className="z-20" />
        </div>
      </div>

      {/* Main Title & Pitch */}
      <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-card border border-white/[0.08] text-xs text-slate-300 mb-1 shadow-sm"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span>Private Online Card Game for Friends</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-display font-black text-4xl sm:text-6xl text-white tracking-tight leading-tight"
        >
          UNO <span className="text-amber-400">ULTIMATE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed"
        >
          No accounts, no matchmaking, no spam. Choose your name, create a private room link, and play official UNO variants with your friends.
        </motion.p>
      </div>

      {/* Guest Login Form Component */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
        className="w-full"
      >
        <GuestLoginForm />
      </motion.div>

      {/* Pillars Overview */}
      <div className="mt-14 sm:mt-20 grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl w-full text-center">
        <div className="p-5 rounded-2xl bg-surface-card border border-white/[0.07] text-slate-300 shadow-card">
          <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-white/[0.08] mx-auto flex items-center justify-center text-amber-400 mb-3">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Friends Only</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Private rooms with custom codes. No random matchmaking or intrusive public lobbies.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface-card border border-white/[0.07] text-slate-300 shadow-card">
          <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-white/[0.08] mx-auto flex items-center justify-center text-emerald-400 mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Instant Guest Play</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Zero sign-up required. Secure temporary session tokens let you resume seamlessly across reloads.
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-surface-card border border-white/[0.07] text-slate-300 shadow-card">
          <div className="w-10 h-10 rounded-xl bg-surface-elevated border border-white/[0.08] mx-auto flex items-center justify-center text-sky-400 mb-3">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Server Authoritative</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Card deck and opponent hands are calculated purely on the server. Zero client cheating possible.
          </p>
        </div>
      </div>
    </div>
  );
};
