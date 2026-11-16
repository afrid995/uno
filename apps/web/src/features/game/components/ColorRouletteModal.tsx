import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target } from 'lucide-react';

interface ColorRouletteModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onSelectColor: (color: 'red' | 'yellow' | 'green' | 'blue') => void;
}

export const ColorRouletteModal: React.FC<ColorRouletteModalProps> = ({
  isOpen,
  isLoading = false,
  onSelectColor,
}) => {
  const [selectedColor, setSelectedColor] = useState<'red' | 'yellow' | 'green' | 'blue' | null>(null);

  if (!isOpen) return null;

  const handleSelect = (color: 'red' | 'yellow' | 'green' | 'blue') => {
    if (isLoading) return;
    setSelectedColor(color);
    onSelectColor(color);
  };

  const colors: { id: 'red' | 'yellow' | 'green' | 'blue'; label: string; bg: string; text: string; border: string; glow: string }[] = [
    { id: 'red', label: 'Red', bg: 'bg-rose-600 hover:bg-rose-500', text: 'text-white', border: 'border-rose-400', glow: 'shadow-glow-red' },
    { id: 'yellow', label: 'Yellow', bg: 'bg-amber-400 hover:bg-yellow-300', text: 'text-slate-950', border: 'border-yellow-200', glow: 'shadow-glow-amber' },
    { id: 'green', label: 'Green', bg: 'bg-emerald-600 hover:bg-emerald-500', text: 'text-white', border: 'border-green-400', glow: 'shadow-glow' },
    { id: 'blue', label: 'Blue', bg: 'bg-sky-600 hover:bg-sky-500', text: 'text-white', border: 'border-sky-400', glow: 'shadow-glow' },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="glass-panel w-full max-w-sm p-6 rounded-3xl border border-rose-500/50 shadow-2xl relative overflow-hidden"
        >
          {/* Top highlight bar */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-rose-500 via-amber-400 to-sky-500" />

          <div className="text-center space-y-2 mb-6">
            <div className="inline-flex p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-1">
              <Target className="w-8 h-8" />
            </div>
            <h3 className="font-display font-black text-2xl text-white tracking-tight">
              Wild Color Roulette!
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Per official Mattel HWV18 rules, pick a target color. You will draw cards one-by-one from the draw pile until a card of that color appears!
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {colors.map((c) => (
              <motion.button
                key={c.id}
                data-testid={`roulette-color-${c.id}`}
                disabled={isLoading}
                whileHover={isLoading ? {} : { scale: 1.05 }}
                whileTap={isLoading ? {} : { scale: 0.95 }}
                onClick={() => handleSelect(c.id)}
                className={`py-4 px-3 rounded-2xl font-display font-black text-sm tracking-wide uppercase border-2 shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${c.bg} ${c.text} ${c.border} ${c.glow}`}
              >
                {isLoading && selectedColor === c.id ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Drawing...</span>
                  </>
                ) : (
                  <span>{c.label}</span>
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
