import React from 'react';
import { useGameStore } from '../../../stores/gameStore';
import { motion } from 'framer-motion';

export const ChallengePanel: React.FC = () => {
  const {
    gameState,
    isActionLoading,
    acceptWildDrawFour,
    challengeWildDrawFour,
    acceptWildDrawTwo,
    challengeWildDrawTwo,
    acceptWildDrawColor,
    challengeWildDrawColor,
    lastChallengeResult,
    clearChallengeResult,
  } = useGameStore();

  const [actionType, setActionType] = React.useState<'accept' | 'challenge' | null>(null);

  React.useEffect(() => {
    if (!isActionLoading) {
      setActionType(null);
    }
  }, [isActionLoading]);

  // Auto-dismiss challenge result after 6 seconds
  React.useEffect(() => {
    if (lastChallengeResult) {
      const timer = setTimeout(() => {
        clearChallengeResult();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [lastChallengeResult, clearChallengeResult]);

  if (!gameState) return null;

  const { self, pendingActionState } = gameState;

  const pType = pendingActionState?.type;
  const isTargetedByFour = !!self?.isTargetedByWildDrawFour;
  const isTargetedByTwo = !!self?.isTargetedByWildDrawTwo;
  const isTargetedByColor = !!self?.isTargetedByWildDrawColor;
  const isTargeted = isTargetedByFour || isTargetedByTwo || isTargetedByColor;

  const isChallengeResolution =
    pType === 'AWAITING_WILD_DRAW_FOUR_RESOLUTION' ||
    pType === 'AWAITING_WILD_DRAW_TWO_RESOLUTION' ||
    pType === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION';

  if (!isChallengeResolution && !lastChallengeResult) {
    return <div className="w-full max-w-xl mx-auto my-2" />;
  }

  // Find offender name
  const offender =
    pendingActionState && 'playedByPlayerId' in pendingActionState
      ? gameState.players.find((p) => p.id === pendingActionState.playedByPlayerId)
      : null;
  const offenderName = offender?.username || 'Opponent';

  const getActionTitle = () => {
    switch (pType) {
      case 'AWAITING_WILD_DRAW_TWO_RESOLUTION':
        return 'Wild Draw Two Played Against You';
      case 'AWAITING_WILD_DRAW_COLOR_RESOLUTION':
        return 'Wild Draw Color Played Against You';
      case 'AWAITING_WILD_DRAW_FOUR_RESOLUTION':
      default:
        return 'Wild Draw Four Played Against You';
    }
  };

  const getActionHeading = () => {
    switch (pType) {
      case 'AWAITING_WILD_DRAW_TWO_RESOLUTION':
        return `${offenderName} played a Wild Draw Two!`;
      case 'AWAITING_WILD_DRAW_COLOR_RESOLUTION':
        return `${offenderName} played a Wild Draw Color!`;
      case 'AWAITING_WILD_DRAW_FOUR_RESOLUTION':
      default:
        return `${offenderName} played a Wild Draw Four!`;
    }
  };

  const getActionDescription = () => {
    switch (pType) {
      case 'AWAITING_WILD_DRAW_TWO_RESOLUTION':
        return `Per Mattel GDR44 rules: If they played illegally (held a matching color card), they must draw 2. If they played legally, you must draw 4 cards (2 + 2 penalty) and lose your turn!`;
      case 'AWAITING_WILD_DRAW_COLOR_RESOLUTION':
        return `Per Mattel GDR44 rules: If they played illegally (held a matching color card), they must draw until the chosen color. If they played legally, you must draw until the chosen color + 2 penalty cards and lose your turn!`;
      case 'AWAITING_WILD_DRAW_FOUR_RESOLUTION':
      default:
        return `Per Mattel 42001 rules: If they played illegally (held a matching color card), they must draw 4. If they played legally, you must draw 6 cards (4 + 2 penalty) and lose your turn!`;
    }
  };

  const handleAccept = () => {
    setActionType('accept');
    if (pType === 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
      acceptWildDrawTwo();
    } else if (pType === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
      acceptWildDrawColor();
    } else {
      acceptWildDrawFour();
    }
  };

  const handleChallenge = () => {
    setActionType('challenge');
    if (pType === 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
      challengeWildDrawTwo();
    } else if (pType === 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
      challengeWildDrawColor();
    } else {
      challengeWildDrawFour();
    }
  };

  const getAcceptLabel = () => {
    switch (pType) {
      case 'AWAITING_WILD_DRAW_TWO_RESOLUTION':
        return 'Accept (+2 Cards & Skip)';
      case 'AWAITING_WILD_DRAW_COLOR_RESOLUTION':
        return 'Accept (Draw Until Color & Skip)';
      case 'AWAITING_WILD_DRAW_FOUR_RESOLUTION':
      default:
        return 'Accept (+4 Cards & Skip)';
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-2">
      {/* Challenge Result Banner (Pure result, penalty, & next-turn info; no opponent cards revealed) */}
      {lastChallengeResult && (
        <motion.div
          data-testid="challenge-result-banner"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`mb-4 p-4 rounded-2xl border shadow-modal text-center ${
            lastChallengeResult.challengeWon
              ? 'border-emerald-500/50 bg-surface-card'
              : 'border-rose-500/50 bg-surface-card'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4
              className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 font-display ${
                lastChallengeResult.challengeWon ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-ping ${
                  lastChallengeResult.challengeWon ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              {lastChallengeResult.challengeWon
                ? 'Challenge Succeeded!'
                : 'Challenge Failed!'}
            </h4>
            <button
              data-testid="dismiss-challenge-result-btn"
              onClick={clearChallengeResult}
              className="px-2 py-0.5 rounded text-xs bg-surface-panel hover:bg-surface-elevated text-slate-300 font-bold border border-white/[0.06] cursor-pointer"
            >
              ✕ Close
            </button>
          </div>
          <p className="text-xs text-slate-200 mb-1">
            {lastChallengeResult.challengeWon
              ? `Opponent played illegally! Opponent was penalized with ${lastChallengeResult.penaltyCards} cards.`
              : `Opponent played legally! You drew ${lastChallengeResult.penaltyCards} cards as penalty.`}
          </p>
          <p className="text-xs text-slate-400 font-medium">
            {lastChallengeResult.challengeWon
              ? 'Your turn continues. Make your play!'
              : 'Your turn was forfeited and play advances to the next player.'}
          </p>
        </motion.div>
      )}

      {/* Target Decision Box */}
      {isTargeted && pendingActionState && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-5 rounded-2xl border border-rose-500/60 bg-surface-card shadow-modal text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider mb-2 font-display">
            {getActionTitle()}
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-2 font-display">
            {getActionHeading()}
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 mb-4 max-w-md mx-auto leading-relaxed">
            {getActionDescription()}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              data-testid="accept-wild-draw-btn"
              onClick={handleAccept}
              disabled={isActionLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-surface-panel hover:bg-surface-elevated active:scale-95 transition-all text-sm shadow-card border border-white/[0.08] disabled:opacity-50 flex items-center justify-center gap-2 font-display"
            >
              {isActionLoading && actionType === 'accept' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Accepting...</span>
                </>
              ) : (
                getAcceptLabel()
              )}
            </button>
            <button
              data-testid="challenge-wild-draw-btn"
              onClick={handleChallenge}
              disabled={isActionLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all text-sm shadow-card border border-red-400/50 disabled:opacity-50 flex items-center justify-center gap-2 font-display"
            >
              {isActionLoading && actionType === 'challenge' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Challenging...</span>
                </>
              ) : (
                'Challenge Legality'
              )}
            </button>
          </div>
        </motion.div>
      )}

      {/* Waiting Indicator for Other Players */}
      {!isTargeted && isChallengeResolution && (
        <div className="p-3 rounded-xl border border-amber-400/30 bg-surface-card text-center text-xs text-amber-200 animate-pulse shadow-card">
          Waiting for victim to accept or challenge {offenderName}&apos;s action...
        </div>
      )}
    </div>
  );
};
