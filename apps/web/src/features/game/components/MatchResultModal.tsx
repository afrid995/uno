import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../../stores/gameStore';
import { useRoomStore } from '../../../stores/roomStore';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { soundService } from '../../../lib/sound-service';

export const MatchResultModal: React.FC = () => {
  const navigate = useNavigate();
  const { room, leaveRoom, rematch, isStarting, error: roomError } = useRoomStore();
  const { showMatchResultModal, matchWinnerData, gameState, reset } = useGameStore();

  const isVisible = Boolean(
    showMatchResultModal &&
    gameState &&
    gameState.status === 'COMPLETED'
  );

  React.useEffect(() => {
    if (isVisible) {
      soundService.play('match_win');
    }
  }, [isVisible]);

  if (!isVisible || !gameState) return null;

  const winner = matchWinnerData || gameState.winner;
  const winnerName = winner?.username || 'Champion';

  const isHost = room ? room.hostGuestId === gameState.self.id : false;

  // Sort players by cumulative score descending
  const sortedPlayers = [...gameState.players].sort(
    (a, b) => (b.cumulativeScore ?? b.score) - (a.cumulativeScore ?? a.score)
  );

  const handlePlayAgain = async () => {
    if (isStarting) return;
    await rematch();
  };

  const handleExitToHome = async () => {
    reset();
    try {
      await leaveRoom();
    } catch {
      // Ignore network errors on departure
    }
    navigate('/dashboard');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          data-testid="match-result-modal"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-lg"
        >
          <Card className="rounded-2xl border-white/[0.08] bg-[#141924] p-6 sm:p-8 shadow-modal text-center relative">
            {/* Trophy Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-amber-400 flex items-center justify-center shadow-brass">
              <Trophy className="w-9 h-9 text-slate-950" />
            </div>

            <Badge variant="brass" className="px-3 py-1 text-xs font-bold uppercase tracking-widest mb-2 font-display">
              Match Finished
            </Badge>

            <h2 className="text-3xl font-bold text-white tracking-tight mb-2 font-display">
              {winnerName} is the Champion!
            </h2>

            <p className="text-sm text-slate-300 mb-6 max-w-sm mx-auto">
              Surpassed the target of {gameState.targetScore} points across {gameState.roundNumber} rounds!
            </p>

            {/* Leaderboard */}
            <div className="bg-[#10141d] rounded-xl p-4 border border-white/[0.06] mb-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-left mb-3 font-display">
                Final Standings
              </h4>
              {sortedPlayers.map((p, idx) => {
                const isWinner = idx === 0;
                const rankLabel = `#${idx + 1}`;

                return (
                  <div
                    key={p.id}
                    className={cn(
                      'flex items-center justify-between p-2.5 rounded-xl text-sm',
                      isWinner
                        ? 'bg-amber-400/15 border border-amber-400/40 font-bold text-amber-300 shadow-brass'
                        : 'bg-[#141924] text-slate-300 border border-white/[0.04]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold min-w-6 text-slate-400">{rankLabel}</span>
                      <span className="truncate">
                        {p.username} {p.id === gameState.self.id && <span className="text-amber-400/90 font-mono font-normal">(you)</span>}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="font-mono font-bold text-white">
                        {p.cumulativeScore !== undefined ? `${p.cumulativeScore} pts total` : `${p.score} pts`}
                      </span>
                      {p.cumulativeScore !== undefined && (
                        <span className="text-[11px] text-slate-400 font-mono">
                          Match: {p.score} pts
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Message if Rematch Fails */}
            {roomError && (
              <Alert variant="destructive" className="mb-4 py-2 px-3 rounded-xl border-rose-500/30 bg-rose-950/40">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <AlertDescription className="text-xs text-rose-300">
                  {roomError}
                </AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="space-y-3">
              {isHost ? (
                <Button
                  onClick={handlePlayAgain}
                  disabled={isStarting}
                  data-testid="match-result-play-again"
                  variant="default"
                  size="lg"
                  className="w-full rounded-xl font-bold font-display text-white bg-emerald-600 hover:bg-emerald-500 text-sm shadow-card border border-emerald-400/40 gap-2"
                >
                  {isStarting ? (
                    <>
                      <Spinner size="sm" className="text-white" />
                      <span>Starting Rematch...</span>
                    </>
                  ) : (
                    <span>PLAY AGAIN</span>
                  )}
                </Button>
              ) : (
                <div
                  data-testid="match-result-waiting-host"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#10141d] border border-white/[0.06] text-xs text-slate-400 font-medium font-mono"
                >
                  Waiting for host to start Play Again...
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleExitToHome}
                  data-testid="match-result-back-home"
                  variant="brass"
                  size="lg"
                  className="flex-1 rounded-xl font-bold font-display text-slate-950 bg-amber-400 hover:bg-amber-300 text-sm shadow-card"
                >
                  Back to Home
                </Button>
                <Button
                  onClick={handleExitToHome}
                  data-testid="match-result-main-menu"
                  variant="secondary"
                  size="lg"
                  className="rounded-xl font-semibold text-slate-300 hover:text-white bg-[#10141d] hover:bg-[#1a202d] border-white/[0.06] text-sm"
                >
                  Main Menu
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
