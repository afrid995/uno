import React from 'react';
import { Card, CardColor } from '@uno-ultimate/game-protocol';
import { PlayingCard } from './PlayingCard';

export interface DiscardPileProps {
  topCard: Card;
  activeColor: CardColor;
  discardCount: number;
}

export const DiscardPile: React.FC<DiscardPileProps> = ({
  topCard,
  activeColor,
  discardCount,
}) => {
  const activeColorBadge = {
    red: { bg: 'bg-rose-500', text: 'Red', ring: 'ring-rose-400' },
    yellow: { bg: 'bg-amber-400', text: 'Yellow', ring: 'ring-amber-300' },
    green: { bg: 'bg-emerald-500', text: 'Green', ring: 'ring-emerald-400' },
    blue: { bg: 'bg-sky-500', text: 'Blue', ring: 'ring-sky-400' },
    pink: { bg: 'bg-pink-500', text: 'Pink', ring: 'ring-pink-400' },
    teal: { bg: 'bg-teal-400', text: 'Teal', ring: 'ring-teal-300' },
    orange: { bg: 'bg-orange-500', text: 'Orange', ring: 'ring-orange-400' },
    purple: { bg: 'bg-purple-600', text: 'Purple', ring: 'ring-purple-400' },
  }[activeColor] || { bg: 'bg-slate-700', text: activeColor, ring: 'ring-slate-500' };

  return (
    <div data-testid="discard-pile" className="flex flex-col items-center space-y-2">
      <div className="relative">
        {/* Layered visual under discard card to simulate pile */}
        <div className="absolute inset-0 bg-slate-800 rounded-xl rotate-6 transform translate-y-1 translate-x-1 opacity-70 border border-slate-700 pointer-events-none" />
        <div className="absolute inset-0 bg-slate-800 rounded-xl -rotate-3 transform -translate-y-0.5 -translate-x-0.5 opacity-50 border border-slate-700 pointer-events-none" />

        <PlayingCard card={topCard} size="md" className="relative z-10" />
      </div>

      {/* Active Color Badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-md">
        <div className={`w-3 h-3 rounded-full ${activeColorBadge.bg} ring-2 ${activeColorBadge.ring}`} />
        <span className="text-[11px] font-bold text-slate-200 capitalize tracking-wide">
          {activeColorBadge.text}
        </span>
        <span className="text-[10px] text-slate-500 font-medium ml-1">
          ({discardCount})
        </span>
      </div>
    </div>
  );
};
