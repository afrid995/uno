import React from 'react';
import { motion } from 'framer-motion';
import { PlayingCard } from './PlayingCard';
import { Layers } from 'lucide-react';

export interface DrawPileProps {
  drawCount: number;
  canDraw: boolean;
  isLoading?: boolean;
  onDraw: () => void;
}

export const DrawPile: React.FC<DrawPileProps> = ({
  drawCount,
  canDraw,
  isLoading = false,
  onDraw,
}) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <motion.div
        whileHover={canDraw && !isLoading ? { scale: 1.05 } : {}}
        whileTap={canDraw && !isLoading ? { scale: 0.95 } : {}}
        onClick={canDraw && !isLoading ? onDraw : undefined}
        className={`relative ${
          canDraw && !isLoading
            ? 'cursor-pointer group'
            : 'cursor-not-allowed opacity-80'
        }`}
      >
        {/* Layered stack effect */}
        <div className="absolute inset-0 bg-slate-900 rounded-xl transform translate-y-1.5 translate-x-1 border border-slate-700 pointer-events-none" />
        <div className="absolute inset-0 bg-slate-800 rounded-xl transform translate-y-0.5 translate-x-0.5 border border-slate-700 pointer-events-none" />

        <PlayingCard
          faceDown
          size="md"
          className={`relative z-10 transition-shadow ${
            canDraw && !isLoading
              ? 'group-hover:ring-3 group-hover:ring-uno-blue ring-offset-2 ring-offset-slate-950 shadow-glow-blue'
              : ''
          }`}
        />

        {/* Playable draw indicator overlay */}
        {canDraw && !isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 rounded-xl backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs font-black text-white bg-uno-blue/90 px-2 py-1 rounded-md shadow-lg">
              DRAW
            </span>
          </div>
        )}
      </motion.div>

      {/* Counter badge */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 shadow-md">
        <Layers className="w-3 h-3 text-slate-400" />
        <span className="text-[11px] font-bold text-slate-300">
          Deck ({drawCount})
        </span>
      </div>
    </div>
  );
};
