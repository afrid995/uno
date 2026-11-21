import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChallengePanel } from '../ChallengePanel';
import { useGameStore } from '../../../../stores/gameStore';
import { PlayerGameState } from '@uno-ultimate/game-protocol';

describe('ChallengePanel Component', () => {
  it('renders nothing when there is no pending Wild Draw Four and no challenge result', () => {
    useGameStore.setState({
      lastChallengeResult: null,
      gameState: {
        id: 'g1',
        roomId: 'r1',
        variant: 'classic',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [],
        playerOrder: [],
        currentPlayerIndex: 0,
        currentTurnGuestId: 'p1',
        turnDirection: 'clockwise',
        topDiscardCard: { id: 'c1', color: 'red', type: 'number', value: '5', scoreValue: 5 },
        activeColor: 'red',
        drawPileCount: 90,
        discardPileCount: 4,
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        roundWinner: null,
        winner: null,
        self: {
          id: 'p1',
          username: 'Alice',
          hand: [],
          isCurrentTurn: true,
          playableCardIds: [],
          canDraw: true,
          canPass: false,
          canCallUno: false,
          canCatchUno: false,
          canResolveWildDrawFour: false,
          isTargetedByWildDrawFour: false,
        },
      } as unknown as PlayerGameState,
    });

    const { container } = render(<ChallengePanel />);
    expect(container.firstChild?.childNodes.length).toBe(0);
  });

  it('renders decision prompt and buttons when user is targeted by Wild Draw Four', () => {
    const acceptMock = vi.fn();
    const challengeMock = vi.fn();

    useGameStore.setState({
      lastChallengeResult: null,
      acceptWildDrawFour: acceptMock,
      challengeWildDrawFour: challengeMock,
      gameState: {
        id: 'g1',
        roomId: 'r1',
        variant: 'classic',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'Alice', cardCount: 6, score: 0, hasDeclaredUno: false },
          { id: 'p2', username: 'Bob', cardCount: 6, score: 0, hasDeclaredUno: false },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        currentTurnGuestId: 'p1',
        turnDirection: 'clockwise',
        topDiscardCard: { id: 'c1', color: null, type: 'wild', value: 'wild_draw_four', scoreValue: 50 },
        activeColor: 'red',
        drawPileCount: 90,
        discardPileCount: 4,
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: {
          type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
          playedByPlayerId: 'p2',
          victimPlayerId: 'p1',
          chosenColor: 'red',
        },
        roundWinner: null,
        winner: null,
        self: {
          id: 'p1',
          username: 'Alice',
          hand: [],
          isCurrentTurn: true,
          playableCardIds: [],
          canDraw: false,
          canPass: false,
          canCallUno: false,
          canCatchUno: false,
          canResolveWildDrawFour: true,
          isTargetedByWildDrawFour: true,
        },
      } as unknown as PlayerGameState,
    });

    render(<ChallengePanel />);

    expect(screen.getByText(/Wild Draw Four Played Against You/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /challenge legality/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(acceptMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /challenge legality/i }));
    expect(challengeMock).toHaveBeenCalledTimes(1);
  });

  it('shows loading state on Challenge button when clicked without affecting Accept button', () => {
    const challengeMock = vi.fn().mockImplementation(() => {
      useGameStore.setState({ isActionLoading: true });
    });

    useGameStore.setState({
      lastChallengeResult: null,
      isActionLoading: false,
      challengeWildDrawFour: challengeMock,
      acceptWildDrawFour: vi.fn(),
      gameState: {
        id: 'g1',
        roomId: 'r1',
        variant: 'classic',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        players: [
          { id: 'p1', username: 'Alice', cardCount: 6, score: 0, hasDeclaredUno: false },
          { id: 'p2', username: 'Bob', cardCount: 6, score: 0, hasDeclaredUno: false },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        currentTurnGuestId: 'p1',
        turnDirection: 'clockwise',
        topDiscardCard: { id: 'c1', color: null, type: 'wild', value: 'wild_draw_four', scoreValue: 50 },
        activeColor: 'red',
        drawPileCount: 90,
        discardPileCount: 4,
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: {
          type: 'AWAITING_WILD_DRAW_FOUR_RESOLUTION',
          playedByPlayerId: 'p2',
          victimPlayerId: 'p1',
          chosenColor: 'red',
        },
        self: {
          id: 'p1',
          username: 'Alice',
          hand: [],
          isCurrentTurn: true,
          playableCardIds: [],
          canDraw: false,
          canPass: false,
          canCallUno: false,
          canCatchUno: false,
          canResolveWildDrawFour: true,
          isTargetedByWildDrawFour: true,
        },
      } as unknown as PlayerGameState,
    });

    render(<ChallengePanel />);

    const challengeBtn = screen.getByTestId('challenge-wild-draw-btn');
    const acceptBtn = screen.getByTestId('accept-wild-draw-btn');

    expect(challengeBtn).toHaveTextContent(/Challenge Legality/i);
    expect(acceptBtn).toHaveTextContent(/Accept/i);

    fireEvent.click(challengeBtn);

    expect(challengeMock).toHaveBeenCalledTimes(1);
    expect(challengeBtn).toHaveTextContent(/Challenging.../i);
    expect(acceptBtn).toHaveTextContent(/Accept/i);
  });

  it('renders challenge result banner and dismisses it without rendering any opponent cards', () => {
    useGameStore.setState({
      isActionLoading: false,
      lastChallengeResult: {
        challengeWon: true,
        penaltyCards: 4,
      },
      gameState: {
        id: 'g1',
        roomId: 'r1',
        variant: 'classic',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        players: [
          { id: 'p1', username: 'Alice', cardCount: 6, score: 0, hasDeclaredUno: false },
          { id: 'p2', username: 'Bob', cardCount: 10, score: 0, hasDeclaredUno: false },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        currentTurnGuestId: 'p1',
        turnDirection: 'clockwise',
        topDiscardCard: { id: 'c1', color: 'red', type: 'number', value: '5', scoreValue: 5 },
        activeColor: 'red',
        drawPileCount: 86,
        discardPileCount: 4,
        turnNumber: 2,
        sequenceNumber: 2,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        self: {
          id: 'p1',
          username: 'Alice',
          hand: [],
          isCurrentTurn: true,
          playableCardIds: [],
          canDraw: true,
          canPass: false,
          canCallUno: false,
          canCatchUno: false,
          canResolveWildDrawFour: false,
          isTargetedByWildDrawFour: false,
        },
      } as unknown as PlayerGameState,
    });

    render(<ChallengePanel />);

    // Result banner is present with penalty and turn info
    expect(screen.getByTestId('challenge-result-banner')).toBeInTheDocument();
    expect(screen.getByText(/Challenge Succeeded!/i)).toBeInTheDocument();
    expect(screen.getByText(/Opponent was penalized with 4 cards/i)).toBeInTheDocument();
    expect(screen.getByText(/Your turn continues/i)).toBeInTheDocument();

    // NEVER renders inspected hand or opponent card details
    expect(screen.queryByTestId('inspected-hand')).not.toBeInTheDocument();
    expect(screen.queryByText(/Hand Inspection/i)).not.toBeInTheDocument();

    // Dismissing banner works
    const dismissBtn = screen.getByTestId('dismiss-challenge-result-btn');
    fireEvent.click(dismissBtn);

    expect(screen.queryByTestId('challenge-result-banner')).not.toBeInTheDocument();
  });

  it('renders challenge failed result with penalty and skip info without exposing opponent cards', () => {
    useGameStore.setState({
      isActionLoading: false,
      lastChallengeResult: {
        challengeWon: false,
        penaltyCards: 6,
      },
      gameState: {
        id: 'g1',
        roomId: 'r1',
        variant: 'classic',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        players: [
          { id: 'p1', username: 'Alice', cardCount: 12, score: 0, hasDeclaredUno: false },
          { id: 'p2', username: 'Bob', cardCount: 6, score: 0, hasDeclaredUno: false },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 1,
        currentTurnGuestId: 'p2',
        turnDirection: 'clockwise',
        topDiscardCard: { id: 'c1', color: 'red', type: 'number', value: '5', scoreValue: 5 },
        activeColor: 'red',
        drawPileCount: 84,
        discardPileCount: 4,
        turnNumber: 2,
        sequenceNumber: 2,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        self: {
          id: 'p1',
          username: 'Alice',
          hand: [],
          isCurrentTurn: false,
          playableCardIds: [],
          canDraw: false,
          canPass: false,
          canCallUno: false,
          canCatchUno: false,
          canResolveWildDrawFour: false,
          isTargetedByWildDrawFour: false,
        },
      } as unknown as PlayerGameState,
    });

    render(<ChallengePanel />);

    expect(screen.getByTestId('challenge-result-banner')).toBeInTheDocument();
    expect(screen.getByText(/Challenge Failed!/i)).toBeInTheDocument();
    expect(screen.getByText(/You drew 6 cards as penalty/i)).toBeInTheDocument();
    expect(screen.getByText(/Your turn was forfeited/i)).toBeInTheDocument();

    // Zero cards or hand inspection UI
    expect(screen.queryByTestId('inspected-hand')).not.toBeInTheDocument();
  });
});
