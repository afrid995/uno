import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { Card } from '@uno-ultimate/game-protocol';
import { PlayerSeat } from './PlayerSeat';
import { DiscardPile } from './DiscardPile';
import { DrawPile } from './DrawPile';
import { PlayerHand } from './PlayerHand';
import { UnoButton } from './UnoButton';
import { ChallengePanel } from './ChallengePanel';
import { GameScoreboard } from './GameScoreboard';
import { WildColorPicker } from './WildColorPicker';
import { RoundResultModal } from './RoundResultModal';
import { MatchResultModal } from './MatchResultModal';
import { AlertCircle, RotateCcw, RotateCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const GameBoard: React.FC = () => {
  const {
    gameState,
    isActionLoading,
    error,
    selectedCardForWild,
    openWildColorPicker,
    closeWildColorPicker,
    playCard,
    drawCard,
    passTurn,
    callUno,
    challengeUno,
    clearError,
  } = useGameStore();

  if (!gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-12 h-12 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-400 text-sm font-medium animate-pulse">
          Connecting to match table...
        </p>
      </div>
    );
  }

  const { self, players, currentTurnGuestId, turnDirection, unoVulnerablePlayerId } = gameState;
  const opponents = players.filter((p) => p.id !== self.id);
  const selfPublic = players.find((p) => p.id === self.id);
  const currentTurnPlayer = players.find((p) => p.id === currentTurnGuestId);
  const isMyTurn = self.isCurrentTurn;

  const handleCardClick = (card: Card) => {
    if (card.type === 'wild') {
      openWildColorPicker(card);
    } else {
      playCard(card.id);
    }
  };

  return (
    <div className="relative w-full max-w-7xl mx-auto flex flex-col justify-between min-h-[82vh] px-2 sm:px-4 py-2 select-none">
      {/* Top Bar: Turn status & Scoreboard */}
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        {/* Turn indicator badge */}
        <div className="flex items-center gap-2">
          {isMyTurn ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400 text-amber-300 font-bold text-xs sm:text-sm animate-pulse shadow-glow-amber">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>YOUR TURN</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>
                Waiting for <strong className="text-slate-200">{currentTurnPlayer?.username}</strong>...
              </span>
            </div>
          )}

          {/* Direction badge */}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/50 border border-slate-800 text-slate-400 text-[11px]">
            {turnDirection === 'clockwise' ? (
              <>
                <RotateCw className="w-3 h-3 text-cyan-400" />
                <span>Clockwise</span>
              </>
            ) : (
              <>
                <RotateCcw className="w-3 h-3 text-rose-400" />
                <span>Counter-Clockwise</span>
              </>
            )}
          </div>
        </div>

        {/* Scoreboard popover */}
        <GameScoreboard />
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-auto my-2 max-w-md w-full flex items-center justify-between p-3 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-xs shadow-lg backdrop-blur-md z-40"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-slate-400 hover:text-white text-xs font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Opponents Area (Top / Around table) */}
      <div className="w-full flex items-center justify-center gap-3 sm:gap-6 flex-wrap py-2">
        {opponents.map((opponent) => (
          <PlayerSeat
            key={opponent.id}
            player={opponent}
            isCurrentTurn={opponent.id === currentTurnGuestId}
            isVulnerableToUno={unoVulnerablePlayerId === opponent.id}
            onCatchUno={() => challengeUno(opponent.id)}
          />
        ))}
      </div>

      {/* Center Table Area (Discard Pile, Draw Pile & Challenge Banner) */}
      <div className="my-auto py-4 flex flex-col items-center justify-center space-y-4">
        {/* Wild Draw Four challenge or inspected hand banner */}
        <ChallengePanel />

        {/* Draw & Discard Piles */}
        <div className="flex items-center justify-center gap-6 sm:gap-12">
          {/* Draw Pile */}
          <DrawPile
            drawCount={gameState.drawPileCount}
            canDraw={self.canDraw}
            isLoading={isActionLoading}
            onDraw={drawCard}
          />

          {/* Discard Pile */}
          <DiscardPile
            topCard={gameState.topDiscardCard}
            activeColor={gameState.activeColor}
            discardCount={gameState.discardPileCount}
          />
        </div>
      </div>

      {/* Bottom Area: Controls & Player Hand */}
      <div className="w-full flex flex-col items-center space-y-2 mt-auto">
        {/* Action Controls Row */}
        <div className="flex items-center justify-between w-full max-w-2xl px-2">
          {/* UNO Button */}
          <UnoButton
            canCallUno={self.canCallUno}
            hasDeclaredUno={selfPublic?.hasDeclaredUno}
            isLoading={isActionLoading}
            onCallUno={callUno}
          />

          {/* Pass Turn Button (Official Rule: only after drawing on current turn) */}
          {self.canPass && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={isActionLoading}
              onClick={passTurn}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-display font-bold text-xs uppercase tracking-wider border border-slate-600 shadow-lg cursor-pointer"
            >
              Pass Turn
            </motion.button>
          )}

          {/* Hand Card Count Badge */}
          <div className="text-xs font-semibold text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-800">
            {self.hand.length} {self.hand.length === 1 ? 'card' : 'cards'}
          </div>
        </div>

        {/* Private Player Hand */}
        <PlayerHand
          hand={self.hand}
          playableCardIds={self.playableCardIds}
          isCurrentTurn={self.isCurrentTurn}
          onCardClick={handleCardClick}
        />
      </div>

      {/* Modals */}
      <WildColorPicker
        isOpen={!!selectedCardForWild}
        onSelectColor={(color) => {
          if (selectedCardForWild) {
            playCard(selectedCardForWild.id, color);
          }
        }}
        onClose={closeWildColorPicker}
      />

      <RoundResultModal />
      <MatchResultModal />
    </div>
  );
};
