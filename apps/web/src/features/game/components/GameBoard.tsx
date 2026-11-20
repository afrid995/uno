import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { Card } from '@uno-ultimate/game-protocol';
import { RoundTable } from './RoundTable';
import { PlayerHand } from './PlayerHand';
import { UnoButton } from './UnoButton';
import { GameScoreboard } from './GameScoreboard';
import { WildColorPicker } from './WildColorPicker';
import { RoundResultModal } from './RoundResultModal';
import { MatchResultModal } from './MatchResultModal';
import { SevenSwapModal } from './SevenSwapModal';
import { TargetedDrawTwoModal } from './TargetedDrawTwoModal';
import { TargetedDrawFourModal } from './TargetedDrawFourModal';
import { ForcedSwapModal } from './ForcedSwapModal';
import { FlexCardChoiceModal } from './FlexCardChoiceModal';
import { TeamPassModal } from './TeamPassModal';
import { AttackTargetModal } from './AttackTargetModal';
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
    acceptStackPenalty,
    chooseTargetedDrawTwo,
    chooseTargetedDrawFour,
    chooseForcedSwap,
    chooseAttackTarget,
    teamInitialPass,
    teamCardPass,
    teamSplitHandPass,
    clearError,
    disconnectedPlayers,
    turnRecoveryNotification,
    isUnoDeclaredForNextPlay,
    toggleDeclareUno,
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

  const { self, players, currentTurnGuestId, turnDirection } = gameState;
  const opponents = players.filter((p) => p.id !== self.id);
  const selfPublic = players.find((p) => p.id === self.id);
  const currentTurnPlayer = players.find((p) => p.id === currentTurnGuestId);
  const isMyTurn = self.isCurrentTurn;
  const isAllWild = gameState.variant === 'uno_all_wild';
  const isUnoAttack = gameState.variant === 'uno_attack';

  const hasDrawn = !!self.hasDrawnThisTurn;
  const drawnCard = self.drawnCardId ? self.hand.find((c) => c.id === self.drawnCardId) : null;
  const isDrawnCardPlayable = drawnCard ? self.playableCardIds.includes(drawnCard.id) : false;

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
            <div data-testid="your-turn-badge" className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400 text-amber-300 font-bold text-xs sm:text-sm animate-pulse shadow-glow-amber">
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

          {/* UNO Teams Variant Badge */}
          {gameState.variant === 'uno_teams' && (
            <div
              data-testid="uno-teams-badge"
              className="flex items-center gap-2 px-3 py-1 rounded-xl font-display font-black text-xs tracking-wider border shadow-md bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-950 border-blue-400 text-blue-300 shadow-blue-950/60"
            >
              <span>👥 UNO TEAMS</span>
              {selfPublic?.teamId && (
                <span
                  data-testid="self-team-badge"
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono border bg-blue-500/30 text-blue-300 border-blue-400"
                >
                  {selfPublic.teamId.toUpperCase().replace('_', ' ')}
                </span>
              )}
            </div>
          )}

          {/* UNO Attack Variant Badge */}
          {isUnoAttack && (
            <div
              data-testid="uno-attack-badge"
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl font-display font-black text-xs tracking-wider border shadow-md bg-gradient-to-r from-red-950 via-rose-950 to-slate-950 border-red-500 text-red-300 shadow-red-950/60 shadow-lg"
            >
              <span>💥 UNO ATTACK</span>
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

      {/* Round-Table Arena with Circular Play Direction and Seated Players */}
      <RoundTable
        gameState={gameState}
        self={self}
        selfPublic={selfPublic}
        isActionLoading={isActionLoading}
        onDrawCard={drawCard}
        onChallengeUno={challengeUno}
        onAcceptStackPenalty={acceptStackPenalty}
        disconnectedPlayers={disconnectedPlayers}
        turnRecoveryNotification={turnRecoveryNotification}
      />

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

      {/* Catch Missed UNO Alert Banner for Opponents */}
      {self.canCatchUno && gameState.unoVulnerablePlayerId && gameState.unoVulnerablePlayerId !== self.id && (
        <motion.div
          data-testid="catch-uno-alert-banner"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="mx-auto my-1 max-w-xl w-full p-2.5 rounded-2xl bg-rose-950/95 border-2 border-rose-500 text-white font-bold text-xs flex items-center justify-between shadow-glow-red animate-pulse px-4"
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🚨</span>
            <span>
              <strong>
                {gameState.players.find((p) => p.id === gameState.unoVulnerablePlayerId)?.username ?? 'Opponent'}
              </strong>{' '}
              forgot to declare UNO!
            </span>
          </div>
          <button
            data-testid="catch-uno-banner-btn"
            disabled={isActionLoading}
            onClick={() => challengeUno(gameState.unoVulnerablePlayerId!)}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-xs uppercase tracking-wider shadow-lg border border-rose-300 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>CATCH UNO!</span>
          </button>
        </motion.div>
      )}

      {/* Bottom Area: Controls & Player Hand */}
      <div className="w-full flex flex-col items-center space-y-2 mt-auto">
        {/* Action Controls Row */}
        <div className="flex items-center justify-between w-full max-w-2xl px-2">
          {/* UNO Button */}
          <UnoButton
            canCallUno={self.canCallUno}
            hasDeclaredUno={selfPublic?.hasDeclaredUno}
            isVulnerable={gameState.unoVulnerablePlayerId === self.id}
            isArmed={isUnoDeclaredForNextPlay}
            isLoading={isActionLoading}
            onCallUno={() => {
              if (self.canCallUno) {
                toggleDeclareUno();
                callUno();
              }
            }}
          />

          {/* Drawn Card Action Controls (Case A) */}
          {isMyTurn && hasDrawn && (
            <div className="flex items-center gap-2">
              {isDrawnCardPlayable && drawnCard && (
                <motion.button
                  data-testid="play-drawn-card-btn"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isActionLoading}
                  onClick={() => handleCardClick(drawnCard)}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-display font-bold text-xs uppercase tracking-wider border border-emerald-400 shadow-lg cursor-pointer"
                >
                  Play Drawn Card
                </motion.button>
              )}

              {self.canPass ? (
                <motion.button
                  data-testid="keep-card-btn"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  disabled={isActionLoading}
                  onClick={passTurn}
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-800 hover:from-slate-600 hover:to-slate-700 text-white font-display font-bold text-xs uppercase tracking-wider border border-slate-600 shadow-lg cursor-pointer"
                >
                  Keep Card / End Turn
                </motion.button>
              ) : (
                <button
                  data-testid="keep-card-disabled-btn"
                  disabled
                  title="Drawn card must be played under this variant's rules."
                  className="px-4 py-2 rounded-2xl bg-slate-800 text-slate-500 font-display font-bold text-xs uppercase tracking-wider border border-slate-700 shadow-sm cursor-not-allowed opacity-50"
                >
                  Keep Card / End Turn
                </button>
              )}
            </div>
          )}

          {/* Fallback Pass Turn Button if self.canPass but not hasDrawn */}
          {!hasDrawn && self.canPass && (
            <motion.button
              data-testid="pass-turn-btn"
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

      {/* Wild Attack-Attack Target Modal (UNO Attack) */}
      <AttackTargetModal
        isOpen={!!self.canChooseAttackTarget}
        eligiblePlayers={opponents.filter((p) => !p.isEliminated)}
        isLoading={isActionLoading}
        onSelectTarget={(targetId) => {
          chooseAttackTarget(targetId);
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

      {/* UNO Teams Card Passing Modal */}
      <TeamPassModal
        isOpen={!!self.canTeamInitialPass || !!self.canTeamCardPass || !!self.canTeamHandSplit}
        mode={
          self.canTeamInitialPass
            ? 'INITIAL_PASS'
            : self.canTeamCardPass
            ? 'PASSING_SYMBOL'
            : 'HAND_SPLIT'
        }
        hand={self.hand}
        cardsCountToPass={self.canTeamHandSplit ? (self.teamHandSplitCount ?? 1) : 1}
        isLoading={isActionLoading}
        onSubmitPass={async (cardIds) => {
          if (self.canTeamInitialPass) {
            await teamInitialPass(cardIds[0]);
          } else if (self.canTeamCardPass) {
            await teamCardPass(cardIds[0]);
          } else if (self.canTeamHandSplit) {
            await teamSplitHandPass(cardIds);
          }
        }}
      />

      <RoundResultModal />
      <MatchResultModal />
    </div>
  );
};
