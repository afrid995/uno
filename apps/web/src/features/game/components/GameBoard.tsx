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
import { SevenSwapModal } from './SevenSwapModal';
import { ColorRouletteModal } from './ColorRouletteModal';
import { TargetedDrawTwoModal } from './TargetedDrawTwoModal';
import { TargetedDrawFourModal } from './TargetedDrawFourModal';
import { ForcedSwapModal } from './ForcedSwapModal';
import { FlexCardChoiceModal } from './FlexCardChoiceModal';
import { StackPenaltyBanner } from './StackPenaltyBanner';
import { AlertCircle, RotateCcw, RotateCw, Skull } from 'lucide-react';
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
    chooseStartingWildColor,
    choose7sSwap,
    chooseRouletteColor,
    acceptStackPenalty,
    chooseTargetedDrawTwo,
    chooseTargetedDrawFour,
    chooseForcedSwap,
    clearError,
  } = useGameStore();

  const [selectedCardForFlexChoice, setSelectedCardForFlexChoice] = React.useState<Card | null>(null);
  const [pendingPlayMode, setPendingPlayMode] = React.useState<'regular' | 'flex'>('regular');

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
  const isAllWild = gameState.variant === 'uno_all_wild';
  const pendingStack =
    gameState.pendingActionState?.type === 'AWAITING_STACK_RESOLUTION'
      ? gameState.pendingActionState
      : null;

  const handleCardClick = (card: Card) => {
    if (gameState.variant === 'uno_flex') {
      const isFlexCard = card.flexColor !== undefined || card.value.startsWith('flex_');
      const isPowerActive = selfPublic?.powerCardStatus === 'green_check';

      if (isFlexCard && isPowerActive) {
        setSelectedCardForFlexChoice(card);
        return;
      }

      // If power card is red or card has no flex option, play regular
      if (card.type === 'wild') {
        setPendingPlayMode('regular');
        openWildColorPicker(card);
      } else {
        playCard(card.id, undefined, 'regular');
      }
      return;
    }

    if (card.type === 'wild' && !isAllWild) {
      openWildColorPicker(card);
    } else {
      playCard(card.id);
    }
  };

  const handleChooseRegular = () => {
    if (!selectedCardForFlexChoice) return;
    const card = selectedCardForFlexChoice;
    setSelectedCardForFlexChoice(null);

    if (card.type === 'wild') {
      setPendingPlayMode('regular');
      openWildColorPicker(card);
    } else {
      playCard(card.id, undefined, 'regular');
    }
  };

  const handleChooseFlex = () => {
    if (!selectedCardForFlexChoice) return;
    const card = selectedCardForFlexChoice;
    setSelectedCardForFlexChoice(null);

    if (card.type === 'wild') {
      setPendingPlayMode('flex');
      openWildColorPicker(card);
    } else {
      playCard(card.id, undefined, 'flex');
    }
  };

  return (
    <div data-testid="game-board" className="relative w-full max-w-7xl mx-auto flex flex-col justify-between min-h-[82vh] px-2 sm:px-4 py-2 select-none">
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

          {/* UNO Flip Active Side Badge */}
          {gameState.activeSide && (
            <div
              data-testid="active-side-badge"
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl font-display font-black text-xs tracking-wider border shadow-md transition-all ${
                gameState.activeSide === 'DARK'
                  ? 'bg-gradient-to-r from-purple-950 via-fuchsia-950 to-slate-950 border-fuchsia-500/80 text-fuchsia-300 shadow-fuchsia-950/60 shadow-lg'
                  : 'bg-gradient-to-r from-amber-950/60 to-yellow-950/60 border-amber-400/60 text-amber-300'
              }`}
            >
              <span>{gameState.activeSide === 'DARK' ? '🌙 DARK SIDE' : '☀️ LIGHT SIDE'}</span>
            </div>
          )}

          {/* UNO All Wild Badge */}
          {isAllWild && (
            <div
              data-testid="all-wild-badge"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl font-display font-black text-xs tracking-wider border shadow-md bg-gradient-to-r from-indigo-950 via-purple-950 to-slate-950 border-indigo-400 text-indigo-300 shadow-indigo-950/60 shadow-lg"
            >
              <span>🌈 ALL WILD</span>
            </div>
          )}

          {/* UNO Flex Variant Badge & Power Card Indicator */}
          {gameState.variant === 'uno_flex' && (
            <div
              data-testid="uno-flex-badge"
              className="flex items-center gap-2 px-3 py-1 rounded-xl font-display font-black text-xs tracking-wider border shadow-md bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-950 border-emerald-400 text-emerald-300 shadow-emerald-950/60"
            >
              <span>⚡ UNO FLEX</span>
              {selfPublic?.powerCardStatus && (
                <span
                  data-testid="self-power-card-status"
                  data-power-status={selfPublic.powerCardStatus}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    selfPublic.powerCardStatus === 'green_check'
                      ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400'
                      : 'bg-rose-500/30 text-rose-300 border-rose-400'
                  }`}
                >
                  {selfPublic.powerCardStatus === 'green_check' ? '✓ POWER ACTIVE' : '✗ POWER USED'}
                </span>
              )}
            </div>
          )}
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
        {/* Starting Wild banner if waiting for designated player */}
        {self.isAwaitingStartingColor && !self.canChooseStartingColor && (
          <div data-testid="starting-wild-waiting-banner" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-400/40 text-amber-300 text-xs font-semibold animate-pulse shadow-md">
            <span>🎨 Starting Wild Card: Waiting for {currentTurnPlayer?.username} to choose the starting color...</span>
          </div>
        )}

        {/* Stack attack resolution banner */}
        {pendingStack && (
          <StackPenaltyBanner
            pendingStack={pendingStack}
            isTarget={!!self.isTargetedByStack}
            canStack={!!self.canStack}
            targetUsername={
              players.find((p) => p.id === pendingStack.targetPlayerId)?.username ?? 'Player'
            }
            isLoading={isActionLoading}
            onAcceptPenalty={acceptStackPenalty}
          />
        )}

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

      {/* Eliminated Player Spectator Banner */}
      {self.isEliminated && (
        <div
          data-testid="eliminated-player-banner"
          className="mx-auto my-2 max-w-xl w-full p-3 rounded-2xl bg-rose-950/90 border border-rose-500 text-rose-200 text-xs text-center font-bold shadow-lg flex items-center justify-center gap-2"
        >
          <Skull className="w-4 h-4 text-rose-400" />
          <span>ELIMINATED BY MERCY RULE (25+ Cards) — You are now observing in spectator mode.</span>
        </div>
      )}

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
        activeSide={gameState.activeSide}
        onSelectColor={(color) => {
          if (selectedCardForWild) {
            if (gameState.variant === 'uno_flex') {
              playCard(selectedCardForWild.id, color, pendingPlayMode);
            } else {
              playCard(selectedCardForWild.id, color);
            }
          }
        }}
        onClose={closeWildColorPicker}
      />

      {/* Starting Wild Color Picker */}
      <WildColorPicker
        isOpen={!!self.canChooseStartingColor}
        activeSide="LIGHT"
        title="Starting Wild Card"
        subtitle="You are to the dealer's left! Choose the color that continues play."
        onSelectColor={(color) => {
          chooseStartingWildColor(color);
        }}
        onClose={() => {}}
      />

      {/* 7's Mandatory Swap Modal */}
      <SevenSwapModal
        isOpen={!!self.canChoose7sSwap}
        eligiblePlayers={opponents.filter((p) => !p.isEliminated)}
        isLoading={isActionLoading}
        onSelectTarget={(targetId) => {
          choose7sSwap(targetId);
        }}
      />

      {/* Wild Color Roulette Modal */}
      <ColorRouletteModal
        isOpen={!!self.canChooseRouletteColor}
        isLoading={isActionLoading}
        onSelectColor={(color) => {
          chooseRouletteColor(color);
        }}
      />

      {/* Wild Targeted Draw Two Modal */}
      <TargetedDrawTwoModal
        isOpen={!!self.canChooseTargetedDrawTwo}
        eligiblePlayers={opponents.filter((p) => !p.isEliminated)}
        isLoading={isActionLoading}
        onSelectTarget={(targetId) => {
          chooseTargetedDrawTwo(targetId);
        }}
      />

      {/* Wild Targeted Draw Four Modal (UNO Flex) */}
      <TargetedDrawFourModal
        isOpen={!!self.canChooseTargetedDrawFour}
        eligiblePlayers={opponents.filter((p) => !p.isEliminated)}
        isLoading={isActionLoading}
        onSelectTarget={(targetId) => {
          chooseTargetedDrawFour(targetId);
        }}
      />

      {/* Wild Forced Swap Modal */}
      <ForcedSwapModal
        isOpen={!!self.canChooseForcedSwap}
        eligiblePlayers={opponents.filter((p) => !p.isEliminated)}
        isLoading={isActionLoading}
        onSelectTarget={(targetId) => {
          chooseForcedSwap(targetId);
        }}
      />

      {/* Flex Card Choice Modal (Regular vs Flex mode) */}
      <FlexCardChoiceModal
        isOpen={!!selectedCardForFlexChoice}
        card={selectedCardForFlexChoice}
        isLoading={isActionLoading}
        onChooseRegular={handleChooseRegular}
        onChooseFlex={handleChooseFlex}
        onClose={() => setSelectedCardForFlexChoice(null)}
      />

      <RoundResultModal />
      <MatchResultModal />
    </div>
  );
};
