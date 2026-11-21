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
        className={`px-4 py-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-300 font-display font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-card ${className}`}
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
        className={`px-4 py-2.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-300 font-display font-bold text-xs tracking-wider flex items-center gap-1.5 shadow-card animate-pulse ${className}`}
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
        whileHover={!isLoading ? { scale: 1.03 } : {}}
        whileTap={!isLoading ? { scale: 0.97 } : {}}
        disabled={isLoading}
        onClick={onCallUno}
        title="UNO is armed! Click to toggle off or play your card to declare UNO."
        className={`px-5 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 select-none bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-brass cursor-pointer border-2 border-amber-300 active:scale-[0.98] ${className}`}
      >
        <Flame className="w-4 h-4 fill-current text-slate-950" />
        <span>UNO ARMED</span>
      </motion.button>
    );
  }

  return (
    <motion.button
      data-testid="uno-button"
      whileHover={canCallUno && !isLoading ? { scale: 1.03 } : {}}
      whileTap={canCallUno && !isLoading ? { scale: 0.97 } : {}}
      disabled={!canCallUno || isLoading}
      onClick={onCallUno}
      title={
        canCallUno
          ? 'Shout UNO before playing down to 1 card!'
          : 'UNO shout is only available on your turn when you hold 2 cards.'
      }
      className={`px-5 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 select-none ${
        canCallUno && !isLoading
          ? 'bg-red-600 hover:bg-red-500 text-white shadow-card border border-red-400/50 cursor-pointer animate-pulse active:scale-[0.98]'
          : 'bg-surface-panel border border-white/[0.06] text-slate-500 cursor-not-allowed opacity-50'
      } ${className}`}
    >
      <Flame className="w-4 h-4 fill-current text-amber-300" />
      <span>SHOUT UNO</span>
    </motion.button>
  );
};
