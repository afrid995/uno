import React from 'react';
import { motion } from 'framer-motion';

interface UnoCardVisualProps {
  color?: 'red' | 'yellow' | 'green' | 'blue' | 'wild';
  value?: string;
  rotation?: number;
  className?: string;
}

export const UnoCardVisual: React.FC<UnoCardVisualProps> = ({
  color = 'red',
  value = 'U',
  rotation = 0,
  className = '',
}) => {
  const colorMap = {
    red: 'bg-[#d9383a] text-white border-white/20',
    yellow: 'bg-[#e5a519] text-slate-950 border-amber-200/30',
    green: 'bg-[#2b8a47] text-white border-white/20',
    blue: 'bg-[#2368a2] text-white border-white/20',
    wild: 'bg-[#1e2330] text-amber-300 border-amber-400/30',
  };

  return (
    <motion.div
      style={{ rotate: rotation }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className={`relative w-28 h-40 sm:w-32 sm:h-48 rounded-xl ${colorMap[color]} p-2.5 shadow-card-elevated border flex flex-col justify-between select-none ${className}`}
    >
      {/* Subtle cardstock border line */}
      <div className="absolute inset-1 rounded-lg border border-white/15 pointer-events-none" />

      {/* Top Left Value */}
      <span className="font-display font-bold text-sm sm:text-base leading-none tracking-tight">
        {value}
      </span>

      {/* Center Oval Emblem */}
      <div className="self-center w-14 h-20 sm:w-16 sm:h-22 rounded-[50%] bg-black/10 flex items-center justify-center border border-white/20 transform -rotate-12">
        <span className="font-display font-bold text-2xl sm:text-3xl">
          {value}
        </span>
      </div>

      {/* Bottom Right Value (Inverted) */}
      <span className="font-display font-bold text-sm sm:text-base leading-none tracking-tight self-end rotate-180">
        {value}
      </span>
    </motion.div>
  );
};
