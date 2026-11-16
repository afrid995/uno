import React from 'react';
import {
  PlayerGameState,
  PublicPlayer,
  PublicPendingActionState,
} from '@uno-ultimate/game-protocol';
import { PlayerSeat } from './PlayerSeat';
import { LocalPlayerProfile } from './LocalPlayerProfile';
import { PlayDirectionIndicator } from './PlayDirectionIndicator';
import { DiscardPile } from './DiscardPile';
import { DrawPile } from './DrawPile';
import { AttackLauncher } from './AttackLauncher';
import { ChallengePanel } from './ChallengePanel';
import { StackPenaltyBanner } from './StackPenaltyBanner';

export interface RoundTableProps {
  gameState: PlayerGameState;
  self: PlayerGameState['self'];
  selfPublic?: PublicPlayer;
  isActionLoading: boolean;
  onDrawCard: () => void;
  onChallengeUno: (targetPlayerId: string) => void;
  onAcceptStackPenalty: () => void;
  className?: string;
  disconnectedPlayers?: Record<string, { disconnectTimestamp: number; gracePeriodSeconds: number }>;
  turnRecoveryNotification?: string | null;
}

/**
 * Computes the clockwise seating sequence for opponents starting immediately after the local player.
 */
export function getSeatedOpponents(
  playerOrder: readonly string[] = [],
  players: readonly PublicPlayer[] = [],
  selfId: string
): PublicPlayer[] {
  if (!playerOrder || playerOrder.length <= 1) {
    return players.filter((p) => p.id !== selfId);
  }

  const selfIndex = playerOrder.indexOf(selfId);
  if (selfIndex === -1) {
    return players.filter((p) => p.id !== selfId);
  }

  const ordered: PublicPlayer[] = [];
  const playerMap = new Map(players.map((p) => [p.id, p]));

  for (let i = 1; i < playerOrder.length; i++) {
    const oppId = playerOrder[(selfIndex + i) % playerOrder.length];
    const opp = playerMap.get(oppId);
    if (opp) {
      ordered.push(opp);
    }
  }

  return ordered;
}

/**
 * Returns responsive percentage coordinates ({ top, left }) along the oval table perimeter for each opponent.
 */
export function getOpponentPosition(
  index: number,
  totalOpponents: number
): { top: string; left: string } {
  if (totalOpponents <= 1) {
    return { top: '5%', left: '50%' };
  }

  if (totalOpponents === 2) {
    const positions = [
      { top: '8%', left: '26%' },
      { top: '8%', left: '74%' },
    ];
    return positions[index] || { top: '8%', left: '50%' };
  }

  if (totalOpponents === 3) {
    const positions = [
      { top: '38%', left: '8%' },
      { top: '5%', left: '50%' },
      { top: '38%', left: '92%' },
    ];
    return positions[index] || { top: '5%', left: '50%' };
  }

  if (totalOpponents === 4) {
    const positions = [
      { top: '44%', left: '7%' },
      { top: '7%', left: '26%' },
      { top: '7%', left: '74%' },
      { top: '44%', left: '93%' },
    ];
    return positions[index] || { top: '7%', left: '50%' };
  }

  if (totalOpponents === 5) {
    const positions = [
      { top: '48%', left: '7%' },
      { top: '14%', left: '18%' },
      { top: '5%', left: '50%' },
      { top: '14%', left: '82%' },
      { top: '48%', left: '93%' },
    ];
    return positions[index] || { top: '5%', left: '50%' };
  }

  // 6 or more opponents: smooth upper-ellipse arc distribution
  const t = totalOpponents > 1 ? index / (totalOpponents - 1) : 0.5;
  const angle = Math.PI * (0.92 - 0.84 * t);
  const left = (50 + 43 * Math.cos(angle)).toFixed(1);
  const top = (48 - 41 * Math.sin(angle)).toFixed(1);

  return { top: `${top}%`, left: `${left}%` };
}

export const RoundTable: React.FC<RoundTableProps> = ({
  gameState,
  self,
  selfPublic,
  isActionLoading,
  onDrawCard,
  onChallengeUno,
  onAcceptStackPenalty,
  className = '',
  disconnectedPlayers = {},
  turnRecoveryNotification,
}) => {
  const {
    players,
    playerOrder,
    currentTurnGuestId,
    turnDirection,
    unoVulnerablePlayerId,
    pendingActionState,
    topDiscardCard,
    activeColor,
    discardPileCount,
    drawPileCount,
    variant,
    attackLauncherState,
  } = gameState;

  const isMyTurn = self.isCurrentTurn;
  const isUnoAttack = variant === 'uno_attack';
  const currentTurnPlayer = players.find((p) => p.id === currentTurnGuestId);

  const pendingStack: PublicPendingActionState | null =
    pendingActionState?.type === 'AWAITING_STACK_RESOLUTION'
      ? pendingActionState
      : null;

  // Order opponents clockwise from local player
  const seatedOpponents = getSeatedOpponents(playerOrder, players, self.id);

  return (
    <div
      data-testid="round-table"
      className={`relative w-full max-w-5xl mx-auto my-1 sm:my-2 select-none ${className}`}
    >
      {/* Table Felt & Rail Surface */}
      <div className="relative w-full h-[400px] sm:h-[460px] md:h-[500px] rounded-[50px] sm:rounded-[80px] md:rounded-[120px] bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 border-4 border-slate-700/70 shadow-[0_12px_45px_rgba(0,0,0,0.85),inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
        {/* Felt Texture / Radial Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-950/20 via-slate-900/60 to-slate-950/95 pointer-events-none" />

        {/* Felt Seam / Inner Rail Line */}
        <div className="absolute inset-3 sm:inset-5 md:inset-7 rounded-[40px] sm:rounded-[65px] md:rounded-[100px] border border-emerald-500/15 pointer-events-none" />

        {/* Central Play Direction Indicator Track */}
        <PlayDirectionIndicator
          direction={turnDirection}
          className="z-0"
        />

        {/* Center Table Area (Piles & Pending Action Banners) */}
        <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center z-10 space-y-2 sm:space-y-3 pointer-events-auto">
          {/* Turn recovery notification banner */}
          {turnRecoveryNotification && (
            <div
              data-testid="turn-recovery-banner"
              className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/90 to-yellow-400/90 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-glow-amber animate-bounce flex items-center gap-2"
            >
              <span>⚡</span>
              <span>{turnRecoveryNotification}</span>
            </div>
          )}

          {/* Starting Wild banner if waiting for designated player */}
          {self.isAwaitingStartingColor && !self.canChooseStartingColor && (
            <div
              data-testid="starting-wild-waiting-banner"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[11px] sm:text-xs font-semibold animate-pulse shadow-md backdrop-blur-xs text-center"
            >
              <span>🎨 Starting Wild: Waiting for {currentTurnPlayer?.username} to choose color...</span>
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
              onAcceptPenalty={onAcceptStackPenalty}
            />
          )}

          {/* Wild Draw Four challenge or inspected hand banner */}
          <ChallengePanel />

          {/* Draw & Discard Piles / Attack Launcher */}
          <div className="flex items-center justify-center gap-5 sm:gap-10">
            {/* Draw Pile or Virtual Attack Launcher */}
            {isUnoAttack ? (
              <AttackLauncher
                cardCount={drawPileCount}
                canPress={self.canDraw}
                isLoading={isActionLoading}
                launcherState={attackLauncherState}
                activePlayerUsername={currentTurnPlayer?.username}
                isMyTurn={isMyTurn}
                onPress={onDrawCard}
              />
            ) : (
              <DrawPile
                drawCount={drawPileCount}
                canDraw={self.canDraw}
                isLoading={isActionLoading}
                onDraw={onDrawCard}
              />
            )}

            {/* Discard Pile */}
            <DiscardPile
              topCard={topDiscardCard}
              activeColor={activeColor}
              discardCount={discardPileCount}
            />
          </div>
        </div>

        {/* Opponent Seats Positioned Along the Upper Table Perimeter */}
        {seatedOpponents.map((opponent, idx) => {
          const { top, left } = getOpponentPosition(idx, seatedOpponents.length);
          const isOpponentTurn = opponent.id === currentTurnGuestId;

          return (
            <div
              key={opponent.id}
              style={{ top, left }}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-20 transition-all duration-500"
            >
              <PlayerSeat
                player={opponent}
                isCurrentTurn={isOpponentTurn}
                isVulnerableToUno={unoVulnerablePlayerId === opponent.id}
                onCatchUno={() => onChallengeUno(opponent.id)}
                disconnectInfo={disconnectedPlayers[opponent.id]}
                className="scale-85 sm:scale-95 md:scale-100 shadow-2xl"
              />
            </div>
          );
        })}

        {/* Local Player Profile Positioned at Bottom Center Table Rail */}
        <div className="absolute bottom-1.5 sm:bottom-3 left-1/2 -translate-x-1/2 z-20">
          <LocalPlayerProfile
            self={self}
            selfPublic={selfPublic}
            isMyTurn={isMyTurn}
          />
        </div>
      </div>
    </div>
  );
};
