import React from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

export interface UnoButtonProps {
  canCallUno: boolean;
  hasDeclaredUno?: boolean;
  isLoading?: boolean;
  onCallUno: () => void;
  className?: string;
}

export const UnoButton: React.FC<UnoButtonProps> = ({
  canCallUno,
  hasDeclaredUno = false,
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
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        <span>UNO CALLED!</span>
      </div>
    );
  }

  return (
    <motion.button
      data-testid="uno-button"
      whileHover={canCallUno && !isLoading ? { scale: 1.05 } : {}}
      whileTap={canCallUno && !isLoading ? { scale: 0.95 } : {}}
      disabled={!canCallUno || isLoading}
      onClick={onCallUno}
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
