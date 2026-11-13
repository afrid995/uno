import React from 'react';
import { CardColor } from '@uno-ultimate/game-protocol';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface WildColorPickerProps {
  isOpen: boolean;
  onSelectColor: (color: CardColor) => void;
  onClose: () => void;
}

export const WildColorPicker: React.FC<WildColorPickerProps> = ({
  isOpen,
  onSelectColor,
  onClose,
}) => {
  if (!isOpen) return null;

  const colors: Array<{ color: CardColor; label: string; bgClass: string; shadowClass: string }> = [
    { color: 'red', label: 'Red', bgClass: 'bg-rose-600 hover:bg-rose-500 text-white', shadowClass: 'shadow-glow-red' },
    { color: 'yellow', label: 'Yellow', bgClass: 'bg-amber-400 hover:bg-amber-300 text-slate-950', shadowClass: 'shadow-glow-amber' },
    { color: 'green', label: 'Green', bgClass: 'bg-emerald-600 hover:bg-emerald-500 text-white', shadowClass: 'shadow-glow-green' },
    { color: 'blue', label: 'Blue', bgClass: 'bg-sky-600 hover:bg-sky-500 text-white', shadowClass: 'shadow-glow-blue' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-center space-y-5"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="space-y-1">
            <h3 className="text-lg font-display font-black text-white tracking-wide">
              Choose Active Color
            </h3>
            <p className="text-xs text-slate-400">
              Select the color to set for the discard pile
            </p>
          </div>

          {/* 4 Color Quadrants */}
          <div className="grid grid-cols-2 gap-3.5 pt-2">
            {colors.map((c) => (
              <motion.button
                key={c.color}
                data-testid={`wild-color-${c.color}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelectColor(c.color)}
                className={`h-24 rounded-2xl font-display font-black text-sm uppercase tracking-wider shadow-lg transition-transform flex items-center justify-center cursor-pointer border border-white/20 ${c.bgClass} ${c.shadowClass}`}
              >
                {c.label}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
