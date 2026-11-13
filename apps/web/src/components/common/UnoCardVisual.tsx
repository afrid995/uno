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
    red: 'from-red-600 to-rose-700 shadow-rose-900/40 border-red-400/30',
    yellow: 'from-amber-400 to-amber-600 shadow-amber-900/40 border-amber-300/30',
    green: 'from-emerald-500 to-green-700 shadow-emerald-900/40 border-emerald-400/30',
    blue: 'from-blue-500 to-indigo-700 shadow-blue-900/40 border-blue-400/30',
    wild: 'from-purple-600 to-indigo-800 shadow-purple-900/40 border-purple-400/30',
  };

  return (
    <motion.div
      style={{ rotate: rotation }}
      whileHover={{ y: -6, scale: 1.05 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`relative w-28 h-40 sm:w-32 sm:h-48 rounded-2xl bg-gradient-to-br ${colorMap[color]} p-2 shadow-2xl border flex flex-col justify-between select-none ${className}`}
    >
      {/* Glossy card sheen */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/20 via-transparent to-black/30 pointer-events-none" />

      {/* Top Left Number */}
      <span className="font-display font-black text-white text-base sm:text-lg leading-none tracking-tight drop-shadow">
        {value}
      </span>

      {/* Center Oval Emblem */}
      <div className="self-center w-14 h-20 sm:w-16 sm:h-24 rounded-[50%] bg-white/20 backdrop-blur-xs flex items-center justify-center border border-white/30 transform -rotate-12 shadow-inner">
        <span className="font-display font-black text-2xl sm:text-3xl text-white drop-shadow-md">
          {value}
        </span>
      </div>

      {/* Bottom Right Number (Inverted) */}
      <span className="font-display font-black text-white text-base sm:text-lg leading-none tracking-tight self-end rotate-180 drop-shadow">
        {value}
      </span>
    </motion.div>
  );
};
