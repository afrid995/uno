import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Layers, Radio } from 'lucide-react';
import { AttackLauncherState } from '@uno-ultimate/game-protocol';
import { soundService } from '../../../lib/sound-service';

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

  const handleLauncherPress = () => {
    soundService.play('attack_launch');
    onPress();
  };

  return (
    <div
      data-testid="attack-launcher"
      className="relative flex flex-col items-center justify-center p-3 rounded-2xl bg-surface-card border border-red-500/30 shadow-modal w-52 sm:w-56 select-none"
    >
      {/* Top Header & Tension LEDs */}
      <div className="w-full flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-red-400 animate-pulse" />
          <span className="text-[11px] font-display font-bold text-red-400 uppercase tracking-wider">
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
              if (level <= 1) return 'bg-emerald-400';
              if (level <= 2) return 'bg-amber-400';
              if (level <= 3) return 'bg-orange-500';
              return 'bg-red-500';
            };

            return (
              <span
                key={level}
                className={`w-1.5 h-3 rounded-full transition-all duration-300 ${
                  isActive ? getColor() : 'bg-slate-800'
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
              initial={{ scale: 0.9, opacity: 0, y: 6 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`absolute inset-x-2 top-4 z-20 py-1.5 px-2 rounded-xl text-center font-display font-bold text-xs shadow-modal backdrop-blur-md border ${
                hasDispensed
                  ? 'bg-red-950/95 border-red-500 text-red-200'
                  : 'bg-emerald-950/90 border-emerald-500 text-emerald-200'
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
          whileHover={canPress && !isLoading ? { scale: 1.02 } : {}}
          whileTap={canPress && !isLoading ? { scale: 0.96, y: 1 } : {}}
          onClick={canPress && !isLoading ? handleLauncherPress : undefined}
          className={`relative z-10 w-24 h-16 rounded-xl font-display font-bold text-sm tracking-wider uppercase transition-all duration-200 border shadow-card flex flex-col items-center justify-center cursor-pointer ${
            canPress && !isLoading
              ? 'bg-red-600 hover:bg-red-500 border-red-400 text-white shadow-card'
              : 'bg-surface-panel border-white/[0.08] text-slate-500 cursor-not-allowed opacity-60 shadow-none'
          }`}
        >
          <span className="drop-shadow-sm font-display">
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
