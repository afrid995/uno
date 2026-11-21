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
import { useOrientation } from '../hooks/useOrientation';
import { AlertCircle, AlertTriangle, RotateCcw, RotateCw, Skull, Moon, Sun, Layers, Zap, Users, Flame } from 'lucide-react';
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
  const { isPortrait, isMobile } = useOrientation();

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
    <div data-testid="game-board" className="relative w-full max-w-7xl mx-auto flex flex-col justify-between flex-1 px-1 sm:px-4 py-1 select-none overflow-hidden min-h-0">
      {/* Top Bar: Turn status & Scoreboard */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-1 sm:px-2 py-0.5 sm:py-1 shrink-0 flex-wrap sm:flex-nowrap">
        {/* Turn indicator badge */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {isMyTurn ? (
            <div data-testid="your-turn-badge" className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-amber-400/15 border border-amber-400/80 text-amber-300 font-bold text-xs sm:text-sm animate-pulse shadow-brass">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>YOUR TURN</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-card border border-white/[0.08] text-slate-400 text-[11px] sm:text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>
                Waiting for <strong className="text-slate-200">{currentTurnPlayer?.username}</strong>...
              </span>
            </div>
          )}

          {/* Direction badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-card border border-white/[0.08] text-slate-400 text-[11px]">
            {turnDirection === 'clockwise' ? (
              <>
                <RotateCw className="w-3 h-3 text-emerald-400" />
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
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl font-display font-bold text-[11px] sm:text-xs tracking-wider border shadow-card transition-all ${
                gameState.activeSide === 'DARK'
                  ? 'bg-purple-950/70 border-purple-500/70 text-purple-300'
                  : 'bg-amber-950/70 border-amber-500/70 text-amber-300'
              }`}
            >
              {gameState.activeSide === 'DARK' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-purple-300" />
                  <span>DARK SIDE</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" />
                  <span>LIGHT SIDE</span>
                </>
              )}
            </div>
          )}

          {/* UNO All Wild Badge */}
          {isAllWild && (
            <div
              data-testid="all-wild-badge"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl font-display font-bold text-[11px] sm:text-xs tracking-wider border shadow-card bg-purple-950/70 border-purple-500/60 text-purple-300"
            >
              <Layers className="w-3.5 h-3.5 text-purple-300" />
              <span>ALL WILD</span>
            </div>
          )}

          {/* UNO Flex Variant Badge & Power Card Indicator */}
          {gameState.variant === 'uno_flex' && (
            <div
              data-testid="uno-flex-badge"
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl font-display font-bold text-[11px] sm:text-xs tracking-wider border shadow-card bg-emerald-950/70 border-emerald-500/60 text-emerald-300"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-300" />
              <span>UNO FLEX</span>
              {selfPublic?.powerCardStatus && (
                <span
                  data-testid="self-power-card-status"
                  data-power-status={selfPublic.powerCardStatus}
                  className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono border ${
                    selfPublic.powerCardStatus === 'green_check'
                      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/60'
                      : 'bg-rose-500/25 text-rose-300 border-rose-400/60'
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
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl font-display font-bold text-[11px] sm:text-xs tracking-wider border shadow-card bg-cyan-950/70 border-cyan-500/60 text-cyan-300"
            >
              <Users className="w-3.5 h-3.5 text-cyan-300" />
              <span>UNO TEAMS</span>
              {selfPublic?.teamId && (
                <span
                  data-testid="self-team-badge"
                  className="px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-mono border bg-cyan-500/25 text-cyan-300 border-cyan-400/60"
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
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-xl font-display font-bold text-[11px] sm:text-xs tracking-wider border shadow-card bg-rose-950/70 border-rose-500/60 text-rose-300"
            >
              <Flame className="w-3.5 h-3.5 text-rose-300" />
              <span>UNO ATTACK</span>
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
        isPortrait={isPortrait}
      />

      {/* Eliminated Player Spectator Banner */}
      {self.isEliminated && (
        <div
          data-testid="eliminated-player-banner"
          className="mx-auto my-2 max-w-xl w-full p-3 rounded-2xl bg-rose-950/80 border border-rose-600/50 text-rose-200 text-xs text-center font-semibold shadow-modal flex items-center justify-center gap-2"
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
          className="mx-auto my-1 max-w-xl w-full p-2.5 rounded-2xl bg-rose-950/90 border border-rose-500/70 text-white font-semibold text-xs flex items-center justify-between shadow-modal px-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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
            className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-display font-bold text-xs uppercase tracking-wider shadow-card border border-red-400/50 cursor-pointer transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>CATCH UNO!</span>
          </button>
        </motion.div>
      )}

      {/* Bottom Area: Controls & Player Hand */}
      <div className="w-full flex flex-col items-center space-y-1 sm:space-y-2 mt-auto shrink-0 pb-1">
        {/* Action Controls Row */}
        <div className="flex items-center justify-between w-full max-w-2xl px-1 sm:px-2 gap-1.5 sm:gap-2">
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
            <div className="flex items-center gap-1.5 sm:gap-2">
              {isDrawnCardPlayable && drawnCard && (
                <motion.button
                  data-testid="play-drawn-card-btn"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={isActionLoading}
                  onClick={() => handleCardClick(drawnCard)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-emerald-400/40 shadow-card cursor-pointer"
                >
                  Play Drawn Card
                </motion.button>
              )}

              {self.canPass ? (
                <motion.button
                  data-testid="keep-card-btn"
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  disabled={isActionLoading}
                  onClick={passTurn}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-surface-panel hover:bg-surface-elevated text-slate-200 font-display font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-white/[0.08] shadow-card cursor-pointer"
                >
                  Keep Card / End Turn
                </motion.button>
              ) : (
                <button
                  data-testid="keep-card-disabled-btn"
                  disabled
                  title="Drawn card must be played under this variant's rules."
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-surface-panel text-slate-500 font-display font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-white/[0.04] cursor-not-allowed opacity-50"
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
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              disabled={isActionLoading}
              onClick={passTurn}
              className="px-4 sm:px-5 py-1.5 sm:py-2 rounded-xl bg-surface-panel hover:bg-surface-elevated text-slate-200 font-display font-bold text-[11px] sm:text-xs uppercase tracking-wider border border-white/[0.08] shadow-card cursor-pointer"
            >
              Pass Turn
            </motion.button>
          )}

          {/* Hand Card Count Badge */}
          <div className="text-[11px] sm:text-xs font-semibold text-slate-400 bg-surface-card px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border border-white/[0.08] shrink-0 font-mono">
            {self.hand.length} {self.hand.length === 1 ? 'card' : 'cards'}
          </div>
        </div>

        {/* Private Player Hand */}
        <PlayerHand
          hand={self.hand}
          playableCardIds={self.playableCardIds}
          isCurrentTurn={self.isCurrentTurn}
          onCardClick={handleCardClick}
          cardSize={isPortrait || isMobile ? 'sm' : 'md'}
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
