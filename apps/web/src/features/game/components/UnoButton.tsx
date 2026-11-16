import React from 'react';
import { motion } from 'framer-motion';
import { Flame, ShieldAlert, Check } from 'lucide-react';

export interface UnoButtonProps {
  canCallUno: boolean;
  hasDeclaredUno?: boolean;
  isVulnerable?: boolean;
  isArmed?: boolean;
  isLoading?: boolean;
  onCallUno: () => void;
  className?: string;
}

export const UnoButton: React.FC<UnoButtonProps> = ({
  canCallUno,
  hasDeclaredUno = false,
  isVulnerable = false,
  isArmed = false,
  isLoading = false,
  onCallUno,
  className = '',
}) => {
  if (hasDeclaredUno) {
    return (
      <div
        data-testid="uno-button"
        className={`px-4 py-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-display font-black text-xs tracking-wider flex items-center gap-1.5 shadow-sm ${className}`}
      >
        <Check className="w-3.5 h-3.5 text-emerald-400" />
        <span>UNO CALLED!</span>
      </div>
    );
  }

  if (isVulnerable) {
    return (
      <div
        data-testid="uno-button-vulnerable"
        className={`px-4 py-2.5 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-300 font-display font-black text-xs tracking-wider flex items-center gap-1.5 shadow-sm animate-pulse ${className}`}
        title="You forgot to declare UNO! Opponents can catch you until the next player starts their turn."
      >
        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
        <span>VULNERABLE!</span>
      </div>
    );
  }

  if (isArmed) {
    return (
      <motion.button
        data-testid="uno-button"
        whileHover={!isLoading ? { scale: 1.05 } : {}}
        whileTap={!isLoading ? { scale: 0.95 } : {}}
        disabled={isLoading}
        onClick={onCallUno}
        title="UNO is armed! Click to toggle off or play your card to declare UNO."
        className={`px-5 py-2.5 rounded-2xl font-display font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 select-none bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-glow hover:shadow-glow-red cursor-pointer border-2 border-amber-300 ${className}`}
      >
        <Flame className="w-4 h-4 fill-current text-yellow-200 animate-bounce" />
        <span>UNO ARMED</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      data-testid="uno-button"
      whileHover={canCallUno && !isLoading ? { scale: 1.05 } : {}}
      whileTap={canCallUno && !isLoading ? { scale: 0.95 } : {}}
      disabled={!canCallUno || isLoading}
      onClick={onCallUno}
      title={
        canCallUno
          ? 'Shout UNO before playing down to 1 card!'
          : 'UNO shout is only available on your turn when you hold 2 cards.'
      }
      className={`px-5 py-2.5 rounded-2xl font-display font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 select-none ${
        canCallUno && !isLoading
          ? 'bg-gradient-to-r from-uno-red via-rose-600 to-amber-500 text-white shadow-glow-red hover:shadow-glow cursor-pointer animate-pulse border border-rose-300/40'
          : 'bg-slate-900/60 border border-slate-800 text-slate-500 cursor-not-allowed opacity-60'
      } ${className}`}
    >
      <Flame className="w-4 h-4 fill-current text-amber-300" />
      <span>SHOUT UNO</span>
    </motion.button>
  );
};
