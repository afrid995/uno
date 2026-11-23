import React from 'react';
import { CardColor } from '@uno-ultimate/game-protocol';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export interface WildColorPickerProps {
  isOpen: boolean;
  activeSide?: 'LIGHT' | 'DARK';
  title?: string;
  subtitle?: string;
  onSelectColor: (color: CardColor) => void;
  onClose: () => void;
}

export const WildColorPicker: React.FC<WildColorPickerProps> = ({
  isOpen,
  activeSide = 'LIGHT',
  title = 'Choose Active Color',
  subtitle = 'Select the color to set for the discard pile',
  onSelectColor,
  onClose,
}) => {
  if (!isOpen) return null;

  const isDarkSide = activeSide === 'DARK';

  const lightColors: Array<{ color: CardColor; label: string; bgClass: string; shadowClass: string }> = [
    { color: 'red', label: 'Red', bgClass: 'bg-red-600 hover:bg-red-500 text-white', shadowClass: 'shadow-card' },
    { color: 'yellow', label: 'Yellow', bgClass: 'bg-amber-400 hover:bg-amber-300 text-slate-950', shadowClass: 'shadow-card' },
    { color: 'green', label: 'Green', bgClass: 'bg-emerald-600 hover:bg-emerald-500 text-white', shadowClass: 'shadow-card' },
    { color: 'blue', label: 'Blue', bgClass: 'bg-blue-600 hover:bg-blue-500 text-white', shadowClass: 'shadow-card' },
  ];

  const darkColors: Array<{ color: CardColor; label: string; bgClass: string; shadowClass: string }> = [
    { color: 'pink', label: 'Pink', bgClass: 'bg-pink-600 hover:bg-pink-500 text-white', shadowClass: 'shadow-card' },
    { color: 'teal', label: 'Teal', bgClass: 'bg-teal-600 hover:bg-teal-500 text-white', shadowClass: 'shadow-card' },
    { color: 'orange', label: 'Orange', bgClass: 'bg-orange-600 hover:bg-orange-500 text-white', shadowClass: 'shadow-card' },
    { color: 'purple', label: 'Purple', bgClass: 'bg-purple-700 hover:bg-purple-600 text-white', shadowClass: 'shadow-card' },
  ];

  const colors = isDarkSide ? darkColors : lightColors;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-sm rounded-2xl bg-surface-card border border-white/[0.08] p-6 shadow-modal text-center space-y-5"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close color picker"
            className="absolute top-4 right-4 p-1.5 rounded-lg bg-surface-panel text-slate-400 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="space-y-1">
            <h3 className="text-lg font-display font-bold text-white tracking-wide">
              {title}
            </h3>
            <p className="text-xs text-slate-400">
              {subtitle}
            </p>
          </div>

          {/* 4 Color Quadrants */}
          <div className="grid grid-cols-2 gap-3.5 pt-2">
            {colors.map((c) => (
              <motion.button
                key={c.color}
                data-testid={`wild-color-${c.color}`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelectColor(c.color)}
                className={`h-24 rounded-xl font-display font-bold text-sm uppercase tracking-wider shadow-card transition-transform flex items-center justify-center cursor-pointer border border-white/20 active:scale-[0.98] ${c.bgClass}`}
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
