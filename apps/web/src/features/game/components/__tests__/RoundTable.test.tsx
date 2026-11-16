import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  RoundTable,
  getSeatedOpponents,
  getOpponentPosition,
} from '../RoundTable';
import { PlayerGameState, PublicPlayer, Card } from '@uno-ultimate/game-protocol';

describe('RoundTable Component & Seating Geometry', () => {
  const sampleCard: Card = {
    id: 'c1',
    color: 'red',
    type: 'number',
    value: '5',
    scoreValue: 5,
    variant: 'classic',
  };

  const createMockPlayer = (id: string, username: string, score = 0, cardCount = 7): PublicPlayer => ({
    id,
    username,
    score,
    cardCount,
    hasDeclaredUno: false,
  });

  const createBaseGameState = (
    playerCount: number,
    turnDirection: 'clockwise' | 'counter_clockwise' = 'clockwise',
    currentTurnGuestId = 'self_id'
  ): { gameState: PlayerGameState; selfPublic: PublicPlayer } => {
    const players: PublicPlayer[] = [
      createMockPlayer('self_id', 'LocalHost', 120, 5),
    ];
    for (let i = 1; i < playerCount; i++) {
      players.push(createMockPlayer(`opp_${i}`, `Opponent_${i}`, 80 + i * 10, 6));
    }

    const playerOrder = players.map((p) => p.id);

    const gameState: PlayerGameState = {
      id: 'match_123',
      roomId: 'room_123',
      variant: 'classic',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex: 0,
      targetScore: 500,
      players,
      playerOrder,
      currentPlayerIndex: playerOrder.indexOf(currentTurnGuestId),
      currentTurnGuestId,
      turnDirection,
      topDiscardCard: sampleCard,
      activeColor: 'red',
      drawPileCount: 90,
      discardPileCount: 10,
      turnNumber: 5,
      sequenceNumber: 12,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      roundWinner: null,
      winner: null,
      self: {
        id: 'self_id',
        username: 'LocalHost',
        hand: [sampleCard, { ...sampleCard, id: 'c2', value: '3' }],
        playableCardIds: ['c1'],
        isCurrentTurn: currentTurnGuestId === 'self_id',
        canDraw: currentTurnGuestId === 'self_id',
        canPass: false,
        canCallUno: false,
        canCatchUno: false,
        canResolveWildDrawFour: false,
        isTargetedByWildDrawFour: false,
      },
    };

    return { gameState, selfPublic: players[0] };
  };

  describe('getSeatedOpponents Seating Algorithm', () => {
    it('orders opponents in clockwise sequence starting immediately after local player', () => {
      const order = ['p0', 'p1', 'p2', 'p3'];
      const players = [
        createMockPlayer('p0', 'Player0'),
        createMockPlayer('p1', 'Player1'),
        createMockPlayer('p2', 'Player2'),
        createMockPlayer('p3', 'Player3'),
      ];

      // Case 1: self is p0 -> opponents are [p1, p2, p3]
      const seatedFromP0 = getSeatedOpponents(order, players, 'p0');
      expect(seatedFromP0.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);

      // Case 2: self is p2 -> opponents are [p3, p0, p1] (wrapping around table!)
      const seatedFromP2 = getSeatedOpponents(order, players, 'p2');
      expect(seatedFromP2.map((p) => p.id)).toEqual(['p3', 'p0', 'p1']);
    });

    it('handles 2-player match correctly', () => {
      const order = ['self_id', 'rival_id'];
      const players = [
        createMockPlayer('self_id', 'Self'),
        createMockPlayer('rival_id', 'Rival'),
      ];

      const seated = getSeatedOpponents(order, players, 'self_id');
      expect(seated.length).toBe(1);
      expect(seated[0].id).toBe('rival_id');
    });

    it('falls back safely if playerOrder is missing or self is not found', () => {
      const players = [createMockPlayer('p1', 'P1'), createMockPlayer('p2', 'P2')];
      const fallback = getSeatedOpponents([], players, 'p1');
      expect(fallback.length).toBe(1);
      expect(fallback[0].id).toBe('p2');
    });
  });

  describe('getOpponentPosition Coordinate Distribution', () => {
    it('returns top center for single opponent (2 players total)', () => {
      const pos = getOpponentPosition(0, 1);
      expect(pos).toEqual({ top: '5%', left: '50%' });
    });

    it('returns symmetric top-left and top-right for 2 opponents (3 players total)', () => {
      const p0 = getOpponentPosition(0, 2);
      const p1 = getOpponentPosition(1, 2);
      expect(p0).toEqual({ top: '8%', left: '26%' });
      expect(p1).toEqual({ top: '8%', left: '74%' });
    });

    it('returns left, top-center, right for 3 opponents (4 players total)', () => {
      const p0 = getOpponentPosition(0, 3);
      const p1 = getOpponentPosition(1, 3);
      const p2 = getOpponentPosition(2, 3);
      expect(p0).toEqual({ top: '38%', left: '8%' });
      expect(p1).toEqual({ top: '5%', left: '50%' });
      expect(p2).toEqual({ top: '38%', left: '92%' });
    });

    it('calculates elliptical coordinates for 6+ opponents', () => {
      // 7 opponents (odd count with exact middle at index 3)
      const p0 = getOpponentPosition(0, 7);
      const pMid = getOpponentPosition(3, 7);
      const pLast = getOpponentPosition(6, 7);

      expect(parseFloat(p0.left)).toBeLessThan(15);
      expect(parseFloat(pMid.left)).toBe(50);
      expect(parseFloat(pLast.left)).toBeGreaterThan(85);
    });
  });

  describe('RoundTable Rendering across Player Counts', () => {
    const dummyHandlers = {
      onDrawCard: vi.fn(),
      onChallengeUno: vi.fn(),
      onAcceptStackPenalty: vi.fn(),
    };

    it('renders 2-player layout: local player at bottom, 1 opponent at top', () => {
      const { gameState, selfPublic } = createBaseGameState(2);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      expect(screen.getByTestId('round-table')).toBeInTheDocument();
      expect(screen.getByTestId('local-player-profile')).toBeInTheDocument();

      const opponentSeats = screen.getAllByTestId('player-seat');
      expect(opponentSeats.length).toBe(1);
      expect(opponentSeats[0]).toHaveAttribute('data-player-id', 'opp_1');

      // Piles in center
      expect(screen.getByTestId('discard-pile')).toBeInTheDocument();
      expect(screen.getByTestId('draw-pile-btn')).toBeInTheDocument();
    });

    it('renders 3-player layout with 2 opponents around table', () => {
      const { gameState, selfPublic } = createBaseGameState(3);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      const opponentSeats = screen.getAllByTestId('player-seat');
      expect(opponentSeats.length).toBe(2);
    });

    it('renders 4-player layout with 3 opponents around table', () => {
      const { gameState, selfPublic } = createBaseGameState(4);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      const opponentSeats = screen.getAllByTestId('player-seat');
      expect(opponentSeats.length).toBe(3);
    });

    it('renders 6-player layout with 5 opponents around table', () => {
      const { gameState, selfPublic } = createBaseGameState(6);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      const opponentSeats = screen.getAllByTestId('player-seat');
      expect(opponentSeats.length).toBe(5);
    });
  });

  describe('Turn Highlighting & Play Direction Indicator', () => {
    const dummyHandlers = {
      onDrawCard: vi.fn(),
      onChallengeUno: vi.fn(),
      onAcceptStackPenalty: vi.fn(),
    };

    it('highlights local player with "YOUR TURN" when local turn is active', () => {
      const { gameState, selfPublic } = createBaseGameState(4, 'clockwise', 'self_id');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      expect(screen.getByTestId('local-turn-badge')).toHaveTextContent('YOUR TURN');
      // No opponent should have the PLAYING badge
      expect(screen.queryByTestId('playing-badge')).toBeNull();

      // Direction indicator shows clockwise
      const indicator = screen.getByTestId('play-direction-indicator');
      expect(indicator).toHaveAttribute('data-direction', 'clockwise');
    });

    it('highlights active opponent with "PLAYING" and sets local player to WAITING', () => {
      const { gameState, selfPublic } = createBaseGameState(4, 'clockwise', 'opp_2');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      // Local player is waiting
      expect(screen.queryByTestId('local-turn-badge')).toBeNull();
      expect(screen.getByText('WAITING')).toBeInTheDocument();

      // Exactly one opponent has the PLAYING badge
      const playingBadges = screen.getAllByTestId('playing-badge');
      expect(playingBadges.length).toBe(1);
      expect(playingBadges[0]).toHaveTextContent('PLAYING');

      // The active seat is opp_2
      const seats = screen.getAllByTestId('player-seat');
      const activeSeat = seats.find((s) => s.getAttribute('data-player-id') === 'opp_2');
      expect(activeSeat).toBeDefined();
      expect(activeSeat).toContainElement(playingBadges[0]);
    });

    it('updates play direction indicator when turnDirection changes to counter_clockwise', () => {
      const { gameState, selfPublic } = createBaseGameState(4, 'counter_clockwise', 'opp_1');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      const indicator = screen.getByTestId('play-direction-indicator');
      expect(indicator).toHaveAttribute('data-direction', 'counter_clockwise');
      expect(screen.getByTestId('direction-badge')).toHaveTextContent('Counter-Clockwise');
    });
  });

  describe('Variant Support on Round Table', () => {
    const dummyHandlers = {
      onDrawCard: vi.fn(),
      onChallengeUno: vi.fn(),
      onAcceptStackPenalty: vi.fn(),
    };

    it('renders AttackLauncher instead of DrawPile in UNO Attack variant', () => {
      const { gameState, selfPublic } = createBaseGameState(3);
      const attackGameState: PlayerGameState = {
        ...gameState,
        variant: 'uno_attack',
        attackLauncherState: {
          tension: 2,
        },
      };

      render(
        <RoundTable
          gameState={attackGameState}
          self={attackGameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      expect(screen.getByTestId('attack-launcher')).toBeInTheDocument();
      expect(screen.queryByTestId('draw-pile-btn')).toBeNull();
    });

    it('renders team badges in UNO Teams variant', () => {
      const { gameState, selfPublic } = createBaseGameState(4);
      const teamsGameState: PlayerGameState = {
        ...gameState,
        variant: 'uno_teams',
        players: [
          { ...gameState.players[0], teamId: 'team_1' },
          { ...gameState.players[1], teamId: 'team_2' },
          { ...gameState.players[2], teamId: 'team_1' },
          { ...gameState.players[3], teamId: 'team_2' },
        ],
      };

      render(
        <RoundTable
          gameState={teamsGameState}
          self={teamsGameState.self}
          selfPublic={{ ...selfPublic, teamId: 'team_1' }}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      // Local profile has team badge
      expect(screen.getByTestId('local-team-badge')).toHaveTextContent('TEAM 1');
      // Opponents have team badges
      const oppTeamBadges = screen.getAllByTestId('player-team-badge');
      expect(oppTeamBadges.length).toBe(3);
    });

    it('renders power card status in UNO Flex variant', () => {
      const { gameState, selfPublic } = createBaseGameState(4);
      const flexGameState: PlayerGameState = {
        ...gameState,
        variant: 'uno_flex',
        players: [
          { ...gameState.players[0], powerCardStatus: 'green_check' },
          { ...gameState.players[1], powerCardStatus: 'red_x' },
          { ...gameState.players[2], powerCardStatus: 'green_check' },
          { ...gameState.players[3], powerCardStatus: 'red_x' },
        ],
      };

      render(
        <RoundTable
          gameState={flexGameState}
          self={flexGameState.self}
          selfPublic={{ ...selfPublic, powerCardStatus: 'green_check' }}
          isActionLoading={false}
          {...dummyHandlers}
        />
      );

      expect(screen.getByTestId('local-power-badge')).toHaveTextContent('✓ POWER');
      const oppPowerBadges = screen.getAllByTestId('power-card-badge');
      expect(oppPowerBadges.length).toBe(3);
    });
  });
});
