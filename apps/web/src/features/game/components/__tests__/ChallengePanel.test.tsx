import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChallengePanel } from '../ChallengePanel';
import { useGameStore } from '../../../../stores/gameStore';
import { PlayerGameState } from '@uno-ultimate/game-protocol';

describe('ChallengePanel Component', () => {
  it('renders nothing when there is no pending Wild Draw Four and no inspection hand', () => {
    useGameStore.setState({
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
});
