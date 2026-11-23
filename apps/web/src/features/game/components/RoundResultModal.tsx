import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const RoundResultModal: React.FC = () => {
  const {
    showRoundResultModal,
    roundWinnerData,
    gameState,
    isActionLoading,
    startNextRound,
    dismissRoundModal,
  } = useGameStore();

  const isVisible = Boolean(
    showRoundResultModal &&
    gameState &&
    gameState.status === 'ROUND_OVER'
  );
  if (!isVisible || !gameState) return null;

  const winnerName = roundWinnerData?.username || gameState.roundWinner?.username || 'Winner';
  const winnerScore = roundWinnerData?.score ?? gameState.roundWinner?.score ?? 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          data-testid="round-result-modal"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-md"
        >
          <Card className="rounded-2xl border-white/[0.08] bg-[#141924] p-6 shadow-modal text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-xl bg-amber-400 flex items-center justify-center shadow-brass">
              <Trophy className="w-7 h-7 text-slate-950" />
            </div>

            <Badge variant="brass" className="text-xs font-bold uppercase tracking-widest mb-1 font-display">
              Round {gameState.roundNumber} Complete
            </Badge>
            <h3 className="text-2xl font-bold text-white mb-2 font-display">
              {winnerName} Wins the Round!
            </h3>
            <p className="text-sm text-slate-300 mb-6">
              Scored <span className="font-bold text-amber-300 font-mono">+{winnerScore}</span> points from opponents&apos; remaining cards (target: {gameState.targetScore} pts).
            </p>

            {/* Standings table */}
            <div className="bg-[#10141d] rounded-xl p-3.5 border border-white/[0.06] mb-6 space-y-2">
              <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-left mb-2 font-display">
                Cumulative Match Standings
              </h4>
              {gameState.players.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-lg bg-[#141924] border border-white/[0.04]"
                >
                  <span className="font-semibold text-slate-200 truncate">
                    {p.username} {p.id === gameState.self.id && <span className="text-amber-400/90 font-mono font-normal">(you)</span>}
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {p.score} / {gameState.targetScore} pts
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                data-testid="start-next-round-btn"
                variant="brass"
                size="lg"
                onClick={() => startNextRound()}
                disabled={isActionLoading}
                className="flex-1 rounded-xl font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 text-sm shadow-card disabled:opacity-50 font-display"
              >
                {isActionLoading ? 'Dealing Next Round...' : 'Start Next Round'}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => dismissRoundModal()}
                className="rounded-xl font-semibold text-slate-300 hover:text-white bg-[#10141d] hover:bg-[#1a202d] border-white/[0.06] text-sm"
              >
                View Table
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
