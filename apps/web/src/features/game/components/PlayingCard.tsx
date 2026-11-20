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
        data-testid="playing-card-facedown"
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

  const isDarkSide = card.currentSide === 'DARK';

  const getColorClasses = (color?: CardColor | null) => {
    switch (color) {
      // Light Side Colors
      case 'red':
        return 'from-rose-500 via-red-600 to-rose-700 border-red-300/60 text-white';
      case 'yellow':
        return 'from-amber-400 via-yellow-400 to-amber-500 border-yellow-200 text-slate-950';
      case 'green':
        return 'from-emerald-500 via-green-600 to-emerald-700 border-green-300/60 text-white';
      case 'blue':
        return 'from-sky-500 via-blue-600 to-sky-700 border-blue-300/60 text-white';

      // Dark Side Colors (UNO Flip)
      case 'pink':
        return 'from-pink-500 via-fuchsia-600 to-pink-700 border-pink-300/80 text-white shadow-pink-500/20';
      case 'teal':
        return 'from-teal-400 via-teal-600 to-emerald-800 border-teal-200/80 text-white shadow-teal-500/20';
      case 'orange':
        return 'from-orange-500 via-amber-600 to-orange-700 border-orange-200/80 text-white shadow-orange-500/20';
      case 'purple':
        return 'from-purple-600 via-violet-700 to-purple-900 border-purple-300/80 text-white shadow-purple-500/20';

      default:
        // Wild cards
        if (isDarkSide || card.value === 'wild_draw_color') {
          return 'from-slate-950 via-purple-950 to-slate-900 border-fuchsia-400 text-white shadow-fuchsia-500/30';
        }
        if (card.value === 'wild_draw_ten' || card.value === 'wild_draw_six' || card.value === 'wild_reverse_draw_four') {
          return 'from-slate-950 via-rose-950 to-slate-900 border-rose-500 text-white shadow-rose-500/30';
        }
        if (card.value === 'wild_targeted_draw_two') {
          return 'from-slate-950 via-cyan-950 to-slate-900 border-cyan-400 text-white shadow-cyan-500/30';
        }
        if (card.value === 'wild_forced_swap') {
          return 'from-slate-950 via-emerald-950 to-slate-900 border-emerald-400 text-white shadow-emerald-500/30';
        }
        if (card.value === 'wild_team_play') {
          return 'from-slate-950 via-cyan-950 to-slate-900 border-cyan-400 text-white shadow-cyan-500/30';
        }
        if (card.value === 'wild_team_draw_four') {
          return 'from-slate-950 via-blue-950 to-slate-900 border-blue-400 text-white shadow-blue-500/30';
        }
        if (card.value === 'wild_hit_4') {
          return 'from-slate-950 via-rose-950 to-slate-900 border-rose-500 text-white shadow-rose-500/30';
        }
        if (card.value === 'wild_attack_attack') {
          return 'from-slate-950 via-red-950 to-slate-900 border-red-500 text-white shadow-red-500/30';
        }
        if (card.value === 'wild_customizable') {
          return 'from-slate-950 via-amber-950 to-slate-900 border-amber-400 text-white shadow-amber-500/30';
        }
        if (card.value === 'wild_all_flip') {
          return 'from-slate-950 via-teal-950 to-slate-900 border-teal-400 text-white shadow-teal-500/30';
        }
        if (card.value === 'flex_wild_draw_four') {
          return 'from-slate-950 via-purple-950 to-slate-900 border-purple-400 text-white shadow-purple-500/30';
        }
        if (card.value === 'flex_wild_target_draw_two') {
          return 'from-slate-950 via-cyan-950 to-slate-900 border-cyan-400 text-white shadow-cyan-500/30';
        }
        if (card.value === 'flex_wild_all_draw') {
          return 'from-slate-950 via-emerald-950 to-slate-900 border-emerald-400 text-white shadow-emerald-500/30';
        }
        if (card.value === 'wild_skip_two') {
          return 'from-slate-950 via-orange-950 to-slate-900 border-orange-400 text-white shadow-orange-500/30';
        }
        if (card.value === 'wild_reverse') {
          return 'from-slate-950 via-blue-950 to-slate-900 border-blue-400 text-white shadow-blue-500/30';
        }
        if (card.value === 'wild_skip') {
          return 'from-slate-950 via-red-950 to-slate-900 border-red-400 text-white shadow-red-500/30';
        }
        return 'from-slate-900 via-indigo-950 to-purple-950 border-purple-400 text-white';
    }
  };

  const getDisplayValue = () => {
    switch (card.value) {
      case 'skip':
        return '⊘';
      case 'skip_everyone':
        return '⊘👥';
      case 'reverse':
        return '⇄';
      case 'draw_one':
        return '+1';
      case 'draw_two':
        return '+2';
      case 'draw_four':
        return '+4';
      case 'draw_five':
        return '+5';
      case 'discard_all':
        return 'DISC';
      case 'flip':
        return 'FLIP';
      case 'wild':
        return 'WILD';
      case 'wild_draw_two':
        return '+2';
      case 'wild_draw_four':
        return '+4';
      case 'wild_reverse_draw_four':
        return '+4 ⇄';
      case 'wild_draw_six':
        return '+6';
      case 'wild_draw_ten':
        return '+10';
      case 'wild_draw_color':
        return 'COLOR';
      case 'wild_reverse':
        return '⇄';
      case 'wild_skip':
        return '⊘';
      case 'wild_skip_two':
        return '⊘2';
      case 'wild_targeted_draw_two':
        return '+2🎯';
      case 'wild_forced_swap':
        return '⇅';
      case 'flex_draw_two':
        return '+2⚡';
      case 'flex_reverse':
        return '⇄⚡';
      case 'flex_skip':
        return '⊘⚡';
      case 'wild_all_flip':
        return 'FLIP';
      case 'flex_wild_draw_four':
        return '+4🎯';
      case 'flex_wild_target_draw_two':
        return '+2🎯';
      case 'flex_wild_all_draw':
        return '+2👥';
      case 'wild_team_play':
        return 'TEAM ⇄';
      case 'wild_team_draw_four':
        return '+4👥';
      case 'hit_2':
        return 'HIT 2';
      case 'wild_hit_4':
        return 'HIT 4';
      case 'wild_attack_attack':
        return 'ATK 2x';
      case 'wild_customizable':
        return 'CUSTOM';
      default:
        return card.value;
    }
  };

  const getCenterDisplayValue = () => {
    switch (card.value) {
      case 'discard_all':
        return 'DISCARD';
      case 'skip_everyone':
        return 'SKIP ALL';
      case 'wild_reverse':
        return 'REVERSE';
      case 'wild_skip':
        return 'SKIP';
      case 'wild_skip_two':
        return 'SKIP 2';
      case 'wild_targeted_draw_two':
        return 'TARGET +2';
      case 'wild_forced_swap':
        return 'SWAP';
      case 'flex_draw_two':
        return 'FLEX +2';
      case 'flex_reverse':
        return 'FLEX REV';
      case 'flex_skip':
        return 'FLEX SKIP';
      case 'wild_all_flip':
        return 'ALL FLIP';
      case 'flex_wild_draw_four':
        return 'TARGET +4';
      case 'flex_wild_target_draw_two':
        return 'TARGET +2';
      case 'flex_wild_all_draw':
        return 'ALL DRAW 2';
      case 'wild_team_play':
        return 'TEAM PLAY';
      case 'wild_team_draw_four':
        return 'TEAM DRAW 4';
      case 'hit_2':
        return 'HIT 2';
      case 'wild_hit_4':
        return 'HIT 4';
      case 'wild_attack_attack':
        return 'ATTACK ATTACK';
      case 'wild_customizable':
        return 'CUSTOM';
      default:
        return getDisplayValue();
    }
  };

  const displayVal = getDisplayValue();
  const centerDisplayVal = getCenterDisplayValue();
  const colorClasses = getColorClasses(card.color);

  const getFlexColorClasses = (flexColor?: CardColor) => {
    switch (flexColor) {
      case 'red':
        return 'bg-rose-600 text-white border-rose-300';
      case 'yellow':
        return 'bg-amber-400 text-slate-950 border-amber-200';
      case 'green':
        return 'bg-emerald-600 text-white border-emerald-300';
      case 'blue':
        return 'bg-sky-600 text-white border-sky-300';
      default:
        return 'bg-slate-700 text-white border-slate-400';
    }
  };

  return (
    <motion.div
      data-testid="playing-card"
      data-card-id={card.id}
      data-card-color={card.color ?? 'wild'}
      data-card-value={card.value}
      data-card-side={card.currentSide || 'LIGHT'}
      data-card-flex-color={card.flexColor}
      data-has-flip-icon={card.hasFlipIcon ? 'true' : undefined}
      data-has-passing-symbol={card.hasPassingSymbol ? 'true' : undefined}
      data-is-playable={isPlayable}
      whileHover={isPlayable && onClick ? { scale: 1.08, y: -8 } : {}}
      whileTap={isPlayable && onClick ? { scale: 0.95 } : {}}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={isPlayable ? onClick : undefined}
      className={`relative select-none border-2 bg-gradient-to-br shadow-xl flex flex-col justify-between p-1.5 sm:p-2.5 overflow-hidden transition-all duration-200 ${colorClasses} ${sizeClasses} ${
        isDarkSide ? 'border-slate-950/80 shadow-2xl ring-1 ring-white/20' : ''
      } ${
        isPlayable
          ? 'cursor-pointer ring-3 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-glow-amber'
          : 'opacity-85'
      } ${className}`}
    >
      {/* Corner value - Top Left */}
      <div className="font-display font-black text-xs sm:text-sm tracking-tight leading-none flex flex-col items-start">
        <div className="flex items-center">
          <span>{displayVal}</span>
          {card.hasFlipIcon && (
            <span
              data-testid="card-flip-icon"
              title="Flip Power Card"
              className="ml-0.5 text-amber-300 font-bold text-[10px] sm:text-xs"
            >
              ↷
            </span>
          )}
        </div>
        {card.hasPassingSymbol && (
          <span
            data-testid="card-passing-symbol"
            title="Pass Card with Partner"
            className="text-cyan-300 font-bold text-[9px] sm:text-[10px] leading-tight"
          >
            ⇄
          </span>
        )}
      </div>

      {/* Flex color badge in top right */}
      {card.flexColor && (
        <div
          data-testid="flex-color-badge"
          data-flex-color={card.flexColor}
          className={`absolute top-1 right-1 px-1 py-0.5 rounded text-[8px] sm:text-[9px] font-black uppercase tracking-tighter border shadow-sm ${getFlexColorClasses(
            card.flexColor
          )}`}
        >
          {card.flexColor}
        </div>
      )}

      {/* Center oval symbol */}
      <div className="relative mx-auto w-4/5 h-3/5 rounded-full bg-slate-950/20 backdrop-blur-xs border border-white/20 flex items-center justify-center rotate-[-15deg] shadow-inner">
        {card.value === 'wild' ? (
          isDarkSide ? (
            <div className="grid grid-cols-2 gap-0.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden shadow-sm">
              <div className="bg-pink-500" />
              <div className="bg-teal-400" />
              <div className="bg-orange-500" />
              <div className="bg-purple-600" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-0.5 w-6 h-6 sm:w-8 sm:h-8 rounded-full overflow-hidden shadow-sm">
              <div className="bg-rose-500" />
              <div className="bg-sky-500" />
              <div className="bg-amber-400" />
              <div className="bg-emerald-500" />
            </div>
          )
        ) : (
          <span
            className={`font-display font-black drop-shadow-md text-center ${
              [
                'flip',
                'discard_all',
                'skip_everyone',
                'wild_reverse_draw_four',
                'wild_all_flip',
                'flex_wild_draw_four',
                'flex_wild_target_draw_two',
                'flex_wild_all_draw',
                'flex_reverse',
                'flex_skip',
                'wild_team_play',
                'wild_team_draw_four',
              ].includes(card.value)
                ? 'text-[10px] sm:text-xs tracking-wider'
                : 'text-lg sm:text-2xl'
            }`}
          >
            {centerDisplayVal}
          </span>
        )}
      </div>

      {/* Corner value - Bottom Right */}
      <div className="font-display font-black text-xs sm:text-sm tracking-tight leading-none text-right rotate-180 flex flex-col items-start">
        <div className="flex items-center">
          <span>{displayVal}</span>
          {card.hasFlipIcon && (
            <span className="ml-0.5 text-amber-300 font-bold text-[10px] sm:text-xs">
              ↷
            </span>
          )}
        </div>
        {card.hasPassingSymbol && (
          <span className="text-cyan-300 font-bold text-[9px] sm:text-[10px] leading-tight">
            ⇄
          </span>
        )}
      </div>
    </motion.div>
  );
};
