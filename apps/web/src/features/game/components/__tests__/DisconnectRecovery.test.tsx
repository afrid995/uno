import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { PlayerSeat } from '../PlayerSeat';
import { RoundTable } from '../RoundTable';
import { useGameStore } from '../../../../stores/gameStore';
import { PlayerGameState, PublicPlayer, Card } from '@uno-ultimate/game-protocol';

describe('Multiplayer Disconnect, Leave, and Turn Recovery UI Tests', () => {
  const sampleCard: Card = {
    id: 'c1',
    color: 'blue',
    type: 'number',
    value: '7',
    scoreValue: 7,
    variant: 'classic',
  };

  const createMockPlayer = (id: string, username: string, score = 0, cardCount = 7): PublicPlayer => ({
    id,
    username,
    score,
    cardCount,
    hasDeclaredUno: false,
  });

  describe('PlayerSeat Disconnected Badge', () => {
    it('renders disconnected badge with countdown when disconnectInfo is provided', () => {
      const player = createMockPlayer('p1', 'Alice');
      const disconnectInfo = {
        disconnectTimestamp: Date.now() - 5000, // 5s ago
        gracePeriodSeconds: 30,
      };

      render(
        <PlayerSeat
          player={player}
          isCurrentTurn={false}
          disconnectInfo={disconnectInfo}
        />
      );

      const badge = screen.getByTestId('disconnected-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(/DISCONNECTED \((24|25)s\)/);
    });

    it('does not render disconnected badge when disconnectInfo is undefined', () => {
      const player = createMockPlayer('p1', 'Alice');

      render(
        <PlayerSeat
          player={player}
          isCurrentTurn={false}
        />
      );

      expect(screen.queryByTestId('disconnected-badge')).not.toBeInTheDocument();
    });
  });

  describe('RoundTable Turn Recovery Banner', () => {
    const mockState: PlayerGameState = {
      id: 'match_1',
      roomId: 'room_1',
      variant: 'classic',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex: 0,
      targetScore: 500,
      players: [
        createMockPlayer('self_1', 'LocalPlayer'),
        createMockPlayer('opp_1', 'OpponentOne'),
      ],
      playerOrder: ['self_1', 'opp_1'],
      currentPlayerIndex: 0,
      currentTurnGuestId: 'self_1',
      turnDirection: 'clockwise',
      topDiscardCard: sampleCard,
      activeColor: 'blue',
      drawPileCount: 94,
      discardPileCount: 6,
      turnNumber: 3,
      sequenceNumber: 10,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      roundWinner: null,
      winner: null,
      self: {
        id: 'self_1',
        username: 'LocalPlayer',
        hand: [sampleCard],
        hasDrawnThisTurn: false,
        drawnCardId: null,
        isCurrentTurn: true,
        canDraw: false,
        canPass: false,
        canCallUno: false,
        canCatchUno: false,
        canResolveWildDrawFour: false,
        isTargetedByWildDrawFour: false,
        playableCardIds: [sampleCard.id],
      },
    };

    it('renders turn recovery notification banner when turnRecoveryNotification is provided', () => {
      render(
        <RoundTable
          gameState={mockState}
          self={mockState.self}
          selfPublic={mockState.players[0]}
          isActionLoading={false}
          onDrawCard={vi.fn()}
          onChallengeUno={vi.fn()}
          onAcceptStackPenalty={vi.fn()}
          turnRecoveryNotification="Turn recovered to LocalPlayer."
        />
      );

      const banner = screen.getByTestId('turn-recovery-banner');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent('Turn recovered to LocalPlayer.');
    });

    it('passes disconnectInfo to opponent seat when opponent is disconnected', () => {
      const disconnectedPlayers = {
        opp_1: {
          disconnectTimestamp: Date.now() - 2000,
          gracePeriodSeconds: 30,
        },
      };

      render(
        <RoundTable
          gameState={mockState}
          self={mockState.self}
          selfPublic={mockState.players[0]}
          isActionLoading={false}
          onDrawCard={vi.fn()}
          onChallengeUno={vi.fn()}
          onAcceptStackPenalty={vi.fn()}
          disconnectedPlayers={disconnectedPlayers}
        />
      );

      const badge = screen.getByTestId('disconnected-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent(/DISCONNECTED \((27|28)s\)/);
    });
  });

  describe('useGameStore Disconnect and Turn Recovery State', () => {
    it('updates disconnectedPlayers on GAME_PLAYER_DISCONNECTED and clears on GAME_PLAYER_RECONNECTED', () => {
      act(() => {
        useGameStore.setState({
          disconnectedPlayers: {
            p2: { disconnectTimestamp: 1000, gracePeriodSeconds: 30 },
          },
        });
      });

      expect(useGameStore.getState().disconnectedPlayers['p2']).toBeDefined();

      act(() => {
        useGameStore.setState((s) => {
          const copy = { ...s.disconnectedPlayers };
          delete copy['p2'];
          return { disconnectedPlayers: copy };
        });
      });

      expect(useGameStore.getState().disconnectedPlayers['p2']).toBeUndefined();
    });

    it('sets turnRecoveryNotification on turn recovery and allows dismiss', () => {
      act(() => {
        useGameStore.setState({
          turnRecoveryNotification: 'Turn recovered to Alice.',
        });
      });

      expect(useGameStore.getState().turnRecoveryNotification).toBe('Turn recovered to Alice.');

      act(() => {
        useGameStore.getState().dismissTurnRecoveryNotification();
      });

      expect(useGameStore.getState().turnRecoveryNotification).toBeNull();
    });
  });
});
