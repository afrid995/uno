import React from 'react';
import { Card, CardColor } from '@uno-ultimate/game-protocol';
import { motion } from 'framer-motion';

export interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  isPlayable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

export const PlayingCard: React.FC<PlayingCardProps> = ({
  card,
  faceDown = false,
  isPlayable = false,
  size = 'md',
  onClick,
  className = '',
}) => {
  // Dimensions per size
  const sizeClasses = {
    sm: 'w-14 h-20 text-xs rounded-lg',
    md: 'w-20 h-28 sm:w-24 sm:h-36 text-base sm:text-lg rounded-xl',
    lg: 'w-28 h-40 sm:w-32 sm:h-48 text-xl sm:text-2xl rounded-2xl',
  }[size];

  if (faceDown || !card) {
    return (
      <div
        className={`relative select-none border-2 border-slate-700 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 shadow-xl flex items-center justify-center overflow-hidden ${sizeClasses} ${className}`}
      >
        <div className="absolute inset-1.5 rounded-lg border border-slate-700/60 bg-slate-900/90 flex items-center justify-center">
          <div className="w-8 h-12 sm:w-12 sm:h-16 rounded-full bg-gradient-to-tr from-uno-red via-rose-600 to-uno-yellow rotate-45 flex items-center justify-center shadow-md">
            <span className="font-display font-black text-white text-[10px] sm:text-xs tracking-tighter drop-shadow-md">
              UNO
            </span>
          </div>
        </div>
      </div>
    );
  }

  const getColorClasses = (color?: CardColor | null) => {
    switch (color) {
      case 'red':
        return 'from-rose-500 via-red-600 to-rose-700 border-red-300/60 text-white';
      case 'yellow':
        return 'from-amber-400 via-yellow-400 to-amber-500 border-yellow-200 text-slate-950';
      case 'green':
        return 'from-emerald-500 via-green-600 to-emerald-700 border-green-300/60 text-white';
      case 'blue':
        return 'from-sky-500 via-blue-600 to-sky-700 border-blue-300/60 text-white';
      default:
        // Wild cards
        return 'from-slate-900 via-indigo-950 to-purple-950 border-purple-400 text-white';
    }
  };

  const getDisplayValue = () => {
    switch (card.value) {
      case 'skip':
        return '⊘';
      case 'reverse':
        return '⇄';
      case 'draw_two':
        return '+2';
      case 'wild':
        return 'WILD';
      case 'wild_draw_four':
        return '+4';
      default:
        return card.value;
    }
  };

  const displayVal = getDisplayValue();
  const isWild = card.type === 'wild';
  const colorClasses = getColorClasses(card.color);

  return (
    <motion.div
      whileHover={isPlayable && onClick ? { scale: 1.08, y: -8 } : {}}
      whileTap={isPlayable && onClick ? { scale: 0.95 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={isPlayable ? onClick : undefined}
      className={`relative select-none border-2 bg-gradient-to-br shadow-xl flex flex-col justify-between p-1.5 sm:p-2.5 overflow-hidden transition-all duration-200 ${colorClasses} ${sizeClasses} ${
        isPlayable
          ? 'cursor-pointer ring-3 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-glow-amber'
          : 'opacity-85'
      } ${className}`}
    >
      {/* Corner value - Top Left */}
      <div className="font-display font-black text-xs sm:text-sm tracking-tight leading-none">
        {displayVal}
      </div>

      {/* Center oval symbol */}
      <div className="relative mx-auto w-4/5 h-3/5 rounded-full bg-slate-950/20 backdrop-blur-xs border border-white/20 flex items-center justify-center rotate-[-15deg] shadow-inner">
        {isWild ? (
          <div className="grid grid-cols-2 gap-0.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden shadow-sm">
            <div className="bg-rose-500" />
            <div className="bg-sky-500" />
            <div className="bg-amber-400" />
            <div className="bg-emerald-500" />
          </div>
        ) : (
          <span className="font-display font-black text-lg sm:text-2xl drop-shadow-md">
            {displayVal}
          </span>
        )}
      </div>

      {/* Corner value - Bottom Right */}
      <div className="font-display font-black text-xs sm:text-sm tracking-tight leading-none text-right rotate-180">
        {displayVal}
      </div>
    </motion.div>
  );
};
