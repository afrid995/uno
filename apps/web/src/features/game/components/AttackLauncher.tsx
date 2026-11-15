import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Layers, Radio } from 'lucide-react';
import { AttackLauncherState } from '@uno-ultimate/game-protocol';

export interface AttackLauncherProps {
  cardCount: number;
  canPress: boolean;
  isLoading?: boolean;
  launcherState?: AttackLauncherState;
  activePlayerUsername?: string;
  isMyTurn: boolean;
  onPress: () => void;
}

export const AttackLauncher: React.FC<AttackLauncherProps> = ({
  cardCount,
  canPress,
  isLoading = false,
  launcherState,
  activePlayerUsername: _activePlayerUsername,
  isMyTurn,
  onPress,
}) => {
  const tension = launcherState?.tension ?? 0;
  const recentLaunch = launcherState?.lastLaunchResult;
  const hasDispensed = recentLaunch && recentLaunch.cardsLaunched > 0;

  return (
    <div
      data-testid="attack-launcher"
      className="relative flex flex-col items-center justify-center p-3 rounded-3xl bg-gradient-to-b from-slate-900 via-zinc-950 to-neutral-950 border-2 border-red-500/40 shadow-2xl shadow-red-950/50 w-52 sm:w-56 select-none"
    >
      {/* Top Header & Tension LEDs */}
      <div className="w-full flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-red-400 animate-pulse" />
          <span className="text-[11px] font-display font-black tracking-widest text-red-400 uppercase">
            Launcher
          </span>
        </div>

        {/* Tension Meter Indicator */}
        <div
          data-testid="launcher-tension-indicator"
          className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full border border-slate-800"
          title={`Launcher Tension: Level ${tension}/4`}
        >
          {[0, 1, 2, 3, 4].map((level) => {
            const isActive = tension >= level;
            const getColor = () => {
              if (level <= 1) return 'bg-emerald-400 shadow-emerald-500/50';
              if (level <= 2) return 'bg-amber-400 shadow-amber-500/50';
              if (level <= 3) return 'bg-orange-500 shadow-orange-500/50';
              return 'bg-red-500 shadow-red-500/70 animate-ping';
            };

            return (
              <span
                key={level}
                className={`w-1.5 h-3 rounded-full transition-all duration-300 ${
                  isActive ? getColor() + ' shadow-sm' : 'bg-slate-800'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* Launcher Body / Mechanical Chute */}
      <div className="relative w-full h-28 bg-gradient-to-b from-neutral-900 to-black rounded-2xl border border-neutral-700/60 flex flex-col items-center justify-center overflow-hidden p-2">
        {/* Chute opening slit */}
        <div className="absolute top-2 left-6 right-6 h-1.5 bg-neutral-950 rounded-full border border-neutral-800 shadow-inner" />

        {/* Dispensed Animation / Flash Badge */}
        <AnimatePresence>
          {recentLaunch && (
            <motion.div
              key={recentLaunch.timestamp}
              data-testid="launcher-ejection-animation"
              initial={{ scale: 0.8, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-x-2 top-4 z-20 py-1.5 px-2 rounded-xl text-center font-display font-black text-xs shadow-lg backdrop-blur-md border ${
                hasDispensed
                  ? 'bg-red-950/95 border-red-500 text-red-200 shadow-red-500/40 animate-bounce'
                  : 'bg-emerald-950/90 border-emerald-500 text-emerald-200 shadow-emerald-500/30'
              }`}
            >
              {hasDispensed ? (
                <div className="flex items-center justify-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <span>ATTACK! +{recentLaunch.cardsLaunched} Cards!</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SAFE! (0 Cards)</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Big Mechanical Launch Button */}
        <motion.button
          data-testid="launcher-press-button"
          disabled={!canPress || isLoading}
          whileHover={canPress && !isLoading ? { scale: 1.05 } : {}}
          whileTap={canPress && !isLoading ? { scale: 0.92, y: 3 } : {}}
          onClick={canPress && !isLoading ? onPress : undefined}
          className={`relative z-10 w-24 h-16 rounded-2xl font-display font-black text-sm tracking-wider uppercase transition-all duration-200 border-2 shadow-2xl flex flex-col items-center justify-center cursor-pointer ${
            canPress && !isLoading
              ? 'bg-gradient-to-b from-red-500 via-rose-600 to-red-700 hover:from-red-400 hover:to-red-600 border-red-300 text-white shadow-red-600/60 animate-pulse'
              : 'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed opacity-60 shadow-none'
          }`}
        >
          <span className="drop-shadow-md">
            {canPress ? 'PRESS' : 'STANDBY'}
          </span>
          <span className="text-[9px] tracking-normal font-mono opacity-80">
            {canPress && isMyTurn ? 'ACTIVE' : 'LAUNCH'}
          </span>
        </motion.button>
      </div>

      {/* Footer Info: Card Capacity & Active Shooter */}
      <div className="w-full flex items-center justify-between px-2 mt-2">
        <div
          data-testid="launcher-card-count"
          className="flex items-center gap-1 text-[11px] font-mono text-slate-400"
        >
          <Layers className="w-3 h-3 text-slate-500" />
          <span>{cardCount} loaded</span>
        </div>

        {recentLaunch && recentLaunch.totalPresses > 1 && (
          <span className="text-[10px] font-mono font-bold text-amber-400">
            Attack: {recentLaunch.totalPresses} presses
          </span>
        )}
      </div>
    </div>
  );
};
