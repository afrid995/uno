import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { RoundTable } from '../RoundTable';
import { PlayerHand } from '../PlayerHand';
import { useOrientation } from '../../hooks/useOrientation';
import { PlayerGameState, PublicPlayer, Card } from '@uno-ultimate/game-protocol';

describe('Mobile Portrait & Landscape Adaptive Gameplay Layout', () => {
  const sampleCard: Card = {
    id: 'c_red_5',
    color: 'red',
    type: 'number',
    value: '5',
    scoreValue: 5,
    variant: 'classic',
  };

  const createMockPlayer = (id: string, username: string, score = 50, cardCount = 7): PublicPlayer => ({
    id,
    username,
    score,
    cardCount,
    hasDeclaredUno: false,
  });

  const createBaseGameState = (
    playerCount: number,
    turnDirection: 'clockwise' | 'counter_clockwise' = 'clockwise',
    currentTurnGuestId = 'self_id',
    variant: PlayerGameState['variant'] = 'classic'
  ): { gameState: PlayerGameState; selfPublic: PublicPlayer } => {
    const players: PublicPlayer[] = [
      createMockPlayer('self_id', 'LocalHero', 120, 5),
    ];
    for (let i = 1; i < playerCount; i++) {
      players.push(createMockPlayer(`opp_${i}`, `Rival_${i}`, 80 + i * 10, 6));
    }

    const playerOrder = players.map((p) => p.id);

    const gameState: PlayerGameState = {
      id: 'match_adaptive_1',
      roomId: 'room_adaptive_1',
      variant,
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
      drawPileCount: 88,
      discardPileCount: 12,
      turnNumber: 3,
      sequenceNumber: 7,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
      roundWinner: null,
      winner: null,
      self: {
        id: 'self_id',
        username: 'LocalHero',
        hand: [
          sampleCard,
          { ...sampleCard, id: 'c2', value: '7' },
          { ...sampleCard, id: 'c3', color: 'blue', value: '5' },
        ],
        playableCardIds: ['c_red_5'],
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

  const mockHandlers = {
    onDrawCard: vi.fn(),
    onChallengeUno: vi.fn(),
    onAcceptStackPenalty: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('useOrientation Hook', () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    afterEach(() => {
      window.innerWidth = originalInnerWidth;
      window.innerHeight = originalInnerHeight;
    });

    it('detects portrait orientation when height > width', () => {
      window.innerWidth = 390;
      window.innerHeight = 844;

      const { result } = renderHook(() => useOrientation());
      expect(result.current.isPortrait).toBe(true);
      expect(result.current.isLandscape).toBe(false);
      expect(result.current.orientation).toBe('portrait');
      expect(result.current.isMobile).toBe(true);
    });

    it('detects landscape orientation when width > height', () => {
      window.innerWidth = 844;
      window.innerHeight = 390;

      const { result } = renderHook(() => useOrientation());
      expect(result.current.isPortrait).toBe(false);
      expect(result.current.isLandscape).toBe(true);
      expect(result.current.orientation).toBe('landscape');
      expect(result.current.isCompactHeight).toBe(true);
    });

    it('dynamically adapts when screen rotates without page reload or state loss', () => {
      window.innerWidth = 390;
      window.innerHeight = 844;

      const { result } = renderHook(() => useOrientation());
      expect(result.current.isPortrait).toBe(true);

      // Simulate rotating mobile device to landscape
      act(() => {
        window.innerWidth = 844;
        window.innerHeight = 390;
        window.dispatchEvent(new Event('resize'));
      });

      expect(result.current.isPortrait).toBe(false);
      expect(result.current.isLandscape).toBe(true);
      expect(result.current.isCompactHeight).toBe(true);
    });
  });

  describe('Portrait Mode Gameplay Layout (Dedicated Compact Structure)', () => {
    it('renders portrait layout with ribbon of opponents and compact arena', () => {
      const { gameState, selfPublic } = createBaseGameState(4, 'clockwise', 'opp_1');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      const table = screen.getByTestId('round-table');
      expect(table).toHaveAttribute('data-layout', 'portrait');

      // Top ribbon with opponents
      const ribbon = screen.getByTestId('portrait-opponents-ribbon');
      expect(ribbon).toBeInTheDocument();

      // All 3 opponents are seated in compact seats within the ribbon
      const seats = screen.getAllByTestId('player-seat');
      expect(seats.length).toBe(3);

      // Center arena elements
      expect(screen.getByTestId('discard-pile')).toBeInTheDocument();
      expect(screen.getByTestId('draw-pile-btn')).toBeInTheDocument();
      expect(screen.getByTestId('play-direction-indicator')).toBeInTheDocument();

      // Local player profile rendered at bottom
      expect(screen.getByTestId('local-player-profile')).toBeInTheDocument();
    });

    it('correctly displays turn indicator on active opponent in portrait ribbon', () => {
      const { gameState, selfPublic } = createBaseGameState(3, 'clockwise', 'opp_1');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      // The active opponent seat has the playing/turn badge
      const turnBadges = screen.getAllByTestId('playing-badge');
      expect(turnBadges.length).toBe(1);
      expect(turnBadges[0]).toHaveTextContent('TURN');
    });

    it('allows catching UNO directly from compact opponent seat in portrait mode', () => {
      const { gameState, selfPublic } = createBaseGameState(2, 'clockwise', 'self_id');
      (gameState as any).unoVulnerablePlayerId = 'opp_1';

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      const catchBtn = screen.getByTestId('catch-uno-btn');
      expect(catchBtn).toBeInTheDocument();
      fireEvent.click(catchBtn);
      expect(mockHandlers.onChallengeUno).toHaveBeenCalledWith('opp_1');
    });

    it('handles 2-player match in portrait mode cleanly', () => {
      const { gameState, selfPublic } = createBaseGameState(2);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      const seats = screen.getAllByTestId('player-seat');
      expect(seats.length).toBe(1);
      expect(seats[0]).toHaveAttribute('data-player-id', 'opp_1');
    });

    it('handles 6-player match in portrait mode with scrollable ribbon', () => {
      const { gameState, selfPublic } = createBaseGameState(6);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      const seats = screen.getAllByTestId('player-seat');
      expect(seats.length).toBe(5);
    });
  });

  describe('Landscape Mode Gameplay Layout (Preserved Round Table)', () => {
    it('renders classic round table layout with elliptical perimeter positions', () => {
      const { gameState, selfPublic } = createBaseGameState(4);

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={false}
          {...mockHandlers}
        />
      );

      const table = screen.getByTestId('round-table');
      expect(table).toHaveAttribute('data-layout', 'landscape');
      expect(screen.queryByTestId('portrait-opponents-ribbon')).not.toBeInTheDocument();

      const seats = screen.getAllByTestId('player-seat');
      expect(seats.length).toBe(3);
      expect(screen.getByTestId('local-player-profile')).toBeInTheDocument();
    });
  });

  describe('PlayerHand Dynamic Overlap & Sizing', () => {
    const handleCardClick = vi.fn();

    const generateCards = (count: number): Card[] => {
      return Array.from({ length: count }, (_, i) => ({
        id: `card_${i}`,
        color: (['red', 'yellow', 'green', 'blue'] as const)[i % 4],
        type: 'number',
        value: `${i % 10}` as any,
        scoreValue: i % 10,
        variant: 'classic',
      }));
    };

    it('applies compact spacing for small hands (<= 4 cards)', () => {
      const cards = generateCards(3);
      const { container } = render(
        <PlayerHand
          hand={cards}
          playableCardIds={['card_0']}
          isCurrentTurn={true}
          onCardClick={handleCardClick}
          cardSize="sm"
        />
      );

      const row = container.querySelector('.min-w-max');
      expect(row?.className).toContain('-space-x-2');
    });

    it('applies tighter spacing for medium hands (5-7 cards)', () => {
      const cards = generateCards(7);
      const { container } = render(
        <PlayerHand
          hand={cards}
          playableCardIds={['card_0']}
          isCurrentTurn={true}
          onCardClick={handleCardClick}
          cardSize="sm"
        />
      );

      const row = container.querySelector('.min-w-max');
      expect(row?.className).toContain('-space-x-4');
    });

    it('applies dense overlap for huge hands (20+ cards in UNO Show Em No Mercy)', () => {
      const cards = generateCards(22);
      const { container } = render(
        <PlayerHand
          hand={cards}
          playableCardIds={['card_0']}
          isCurrentTurn={true}
          onCardClick={handleCardClick}
          cardSize="sm"
        />
      );

      const row = container.querySelector('.min-w-max');
      expect(row?.className).toContain('-space-x-7');
      expect(screen.getByTestId('player-hand')).toHaveClass('overflow-x-auto');
    });
  });

  describe('Supported Variants Compatibility in Portrait Mode', () => {
    it('renders UNO Attack virtual launcher instead of draw pile in portrait mode', () => {
      const { gameState, selfPublic } = createBaseGameState(3, 'clockwise', 'self_id', 'uno_attack');

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByTestId('attack-launcher')).toBeInTheDocument();
      expect(screen.queryByTestId('draw-pile-btn')).not.toBeInTheDocument();
    });

    it('renders UNO Flip Light and Dark Side active indicators in portrait mode', () => {
      const { gameState, selfPublic } = createBaseGameState(3, 'clockwise', 'self_id', 'uno_flip');
      (gameState as any).activeSide = 'DARK';

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByTestId('round-table')).toHaveAttribute('data-layout', 'portrait');
      expect(screen.getByTestId('discard-pile')).toBeInTheDocument();
    });

    it('renders stack penalty banner in portrait mode when stack attack is pending', () => {
      const { gameState, selfPublic } = createBaseGameState(3, 'clockwise', 'self_id', 'uno_show_em_no_mercy');
      (gameState as any).pendingActionState = {
        type: 'AWAITING_STACK_RESOLUTION',
        accumulatedPenalty: 6,
        targetPlayerId: 'self_id',
        initiatingPlayerId: 'opp_1',
        cardValue: 'wild_draw_six',
      };
      (gameState.self as any).isTargetedByStack = true;
      (gameState.self as any).canStack = false;

      render(
        <RoundTable
          gameState={gameState}
          self={gameState.self}
          selfPublic={selfPublic}
          isActionLoading={false}
          isPortrait={true}
          {...mockHandlers}
        />
      );

      expect(screen.getByTestId('stack-penalty-banner')).toBeInTheDocument();
      expect(screen.getByText(/Stack Attack/i)).toBeInTheDocument();
    });
  });
});
