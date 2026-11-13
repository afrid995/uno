import React from 'react';
import { motion } from 'framer-motion';
import { Users, Shield, Zap, Sparkles } from 'lucide-react';
import { GuestLoginForm } from '../features/guest/components/GuestLoginForm';
import { UnoCardVisual } from '../components/common/UnoCardVisual';

export const LandingPage: React.FC = () => {
  return (
    <div className="w-full flex flex-col items-center justify-center py-8 sm:py-16 px-4">
      {/* Hero Visual Section */}
      <div className="relative mb-10 sm:mb-12 flex items-center justify-center">
        {/* Animated Background Glow */}
        <div className="absolute w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-gradient-to-tr from-uno-red/20 via-uno-yellow/15 to-uno-blue/20 blur-3xl pointer-events-none" />

        {/* Fanned Out Original Uno Cards */}
        <div className="relative flex items-center justify-center h-44 sm:h-56 w-72 sm:w-80">
          <UnoCardVisual color="blue" value="4" rotation={-18} className="-mr-12 sm:-mr-16 z-10" />
          <UnoCardVisual color="yellow" value="7" rotation={-7} className="-mr-12 sm:-mr-16 z-20" />
          <UnoCardVisual color="red" value="U" rotation={6} className="-mr-12 sm:-mr-16 z-30 ring-2 ring-white/20" />
          <UnoCardVisual color="green" value="2" rotation={19} className="z-20" />
        </div>
      </div>

      {/* Main Title & Pitch */}
      <div className="text-center max-w-2xl mx-auto mb-10 space-y-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/80 text-xs text-slate-300 mb-2 shadow-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-uno-yellow" />
          <span>Private Online Card Game for Friends</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="font-display font-black text-4xl sm:text-6xl text-white tracking-tight leading-tight"
        >
          UNO <span className="bg-gradient-to-r from-red-500 via-amber-400 to-blue-500 bg-clip-text text-transparent">ULTIMATE</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg text-slate-400 max-w-xl mx-auto leading-relaxed"
        >
          No accounts, no matchmaking, no spam. Just enter your name, get a private room link, and play official UNO variants with your friends.
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

      {/* Features Overview */}
      <div className="mt-16 sm:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full text-center">
        <div className="p-5 rounded-2xl glass-panel text-slate-300">
          <div className="w-10 h-10 rounded-xl bg-uno-red/10 border border-uno-red/30 mx-auto flex items-center justify-center text-uno-red mb-3">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Friends Only</h3>
          <p className="text-xs text-slate-400">
            Private rooms with custom codes. No random matchmaking or intrusive public lobbies.
          </p>
        </div>

        <div className="p-5 rounded-2xl glass-panel text-slate-300">
          <div className="w-10 h-10 rounded-xl bg-uno-yellow/10 border border-uno-yellow/30 mx-auto flex items-center justify-center text-uno-yellow mb-3">
            <Zap className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Instant Guest Play</h3>
          <p className="text-xs text-slate-400">
            Zero sign-up required. Secure temporary session tokens let you resume seamlessly across tab reloads.
          </p>
        </div>

        <div className="p-5 rounded-2xl glass-panel text-slate-300">
          <div className="w-10 h-10 rounded-xl bg-uno-blue/10 border border-uno-blue/30 mx-auto flex items-center justify-center text-uno-blue mb-3">
            <Shield className="w-5 h-5" />
          </div>
          <h3 className="font-display font-bold text-white text-base mb-1">Server Authoritative</h3>
          <p className="text-xs text-slate-400">
            Card deck and opponent hands are calculated purely on the server. Zero client cheating possible.
          </p>
        </div>
      </div>
    </div>
  );
};
