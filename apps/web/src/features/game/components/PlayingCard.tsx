import React from 'react';
import { Card, CardColor } from '@uno-ultimate/game-protocol';
import { motion } from 'framer-motion';
import { soundService } from '../../../lib/sound-service';
import { MOTION_TRANSITIONS } from '../../../lib/game-motion';

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
        className={`relative select-none border border-white/15 bg-gradient-to-br from-[#151a24] via-[#1a2130] to-[#0d1117] shadow-card flex items-center justify-center overflow-hidden ${sizeClasses} ${className}`}
      >
        <div className="absolute inset-1 sm:inset-1.5 rounded-lg border border-white/[0.08] bg-[#0f141d] flex items-center justify-center">
          <div className="w-8 h-12 sm:w-12 sm:h-16 rounded-full bg-gradient-to-tr from-red-700 via-red-600 to-amber-500 rotate-45 flex items-center justify-center shadow-sm border border-white/20">
            <span className="font-display font-black text-white text-[10px] sm:text-xs tracking-tighter drop-shadow-sm">
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
      // Light Side Colors - Authentic Matte Pigments
      case 'red':
        return 'from-red-600 via-red-600 to-red-700 border-red-400/40 text-white';
      case 'yellow':
        return 'from-amber-400 via-amber-400 to-amber-500 border-amber-300/50 text-slate-950';
      case 'green':
        return 'from-emerald-600 via-emerald-600 to-emerald-700 border-emerald-400/40 text-white';
      case 'blue':
        return 'from-blue-600 via-blue-600 to-blue-700 border-blue-400/40 text-white';

      // Dark Side Colors (UNO Flip) - Authentic Deep Pigments
      case 'pink':
        return 'from-pink-600 via-pink-600 to-pink-700 border-pink-400/50 text-white';
      case 'teal':
        return 'from-teal-600 via-teal-600 to-teal-700 border-teal-400/50 text-white';
      case 'orange':
        return 'from-orange-600 via-orange-600 to-orange-700 border-orange-400/50 text-white';
      case 'purple':
        return 'from-purple-700 via-purple-700 to-purple-800 border-purple-400/50 text-white';

      default:
        // Wild cards - High-craft Dark Cardstock with Subtle Accent Borders
        if (isDarkSide || card.value === 'wild_draw_color') {
          return 'from-surface-canvas via-[#141224] to-surface-canvas border-fuchsia-400/80 text-white';
        }
        if (card.value === 'wild_draw_ten' || card.value === 'wild_draw_six' || card.value === 'wild_reverse_draw_four') {
          return 'from-surface-canvas via-[#201015] to-surface-canvas border-rose-500/80 text-white';
        }
        if (card.value === 'wild_targeted_draw_two') {
          return 'from-surface-canvas via-[#0f1d24] to-surface-canvas border-cyan-400/80 text-white';
        }
        if (card.value === 'wild_forced_swap') {
          return 'from-surface-canvas via-[#0f2219] to-surface-canvas border-emerald-400/80 text-white';
        }
        if (card.value === 'wild_team_play') {
          return 'from-surface-canvas via-[#0f1d24] to-surface-canvas border-cyan-400/80 text-white';
        }
        if (card.value === 'wild_team_draw_four') {
          return 'from-surface-canvas via-[#101726] to-surface-canvas border-blue-400/80 text-white';
        }
        if (card.value === 'wild_hit_4') {
          return 'from-surface-canvas via-[#201015] to-surface-canvas border-rose-500/80 text-white';
        }
        if (card.value === 'wild_attack_attack') {
          return 'from-surface-canvas via-[#221012] to-surface-canvas border-red-500/80 text-white';
        }
        if (card.value === 'wild_customizable') {
          return 'from-surface-canvas via-[#221c10] to-surface-canvas border-amber-400/80 text-white';
        }
        if (card.value === 'wild_all_flip') {
          return 'from-surface-canvas via-[#0e2022] to-surface-canvas border-teal-400/80 text-white';
        }
        if (card.value === 'flex_wild_draw_four') {
          return 'from-surface-canvas via-[#1a1226] to-surface-canvas border-purple-400/80 text-white';
        }
        if (card.value === 'flex_wild_target_draw_two') {
          return 'from-surface-canvas via-[#0f1d24] to-surface-canvas border-cyan-400/80 text-white';
        }
        if (card.value === 'flex_wild_all_draw') {
          return 'from-surface-canvas via-[#0f2219] to-surface-canvas border-emerald-400/80 text-white';
        }
        if (card.value === 'wild_skip_two') {
          return 'from-surface-canvas via-[#241710] to-surface-canvas border-orange-400/80 text-white';
        }
        if (card.value === 'wild_reverse') {
          return 'from-surface-canvas via-[#101726] to-surface-canvas border-blue-400/80 text-white';
        }
        if (card.value === 'wild_skip') {
          return 'from-surface-canvas via-[#201015] to-surface-canvas border-red-400/80 text-white';
        }
        return 'from-surface-canvas via-[#151826] to-surface-canvas border-amber-400/70 text-white';
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

  const handleCardClick = () => {
    if (isPlayable && onClick) {
      soundService.play('card_select');
      onClick();
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
      whileHover={isPlayable && onClick ? { scale: 1.06, y: -8 } : {}}
      whileTap={isPlayable && onClick ? { scale: 0.96 } : {}}
      transition={MOTION_TRANSITIONS.cardTactile}
      onClick={handleCardClick}
      className={`relative select-none border-2 bg-gradient-to-br shadow-card flex flex-col justify-between p-1.5 sm:p-2.5 overflow-hidden transition-all duration-200 ${colorClasses} ${sizeClasses} ${
        isDarkSide ? 'border-slate-950/80 shadow-modal ring-1 ring-white/20' : ''
      } ${
        isPlayable
          ? 'cursor-pointer ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-brass'
          : 'opacity-90'
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
