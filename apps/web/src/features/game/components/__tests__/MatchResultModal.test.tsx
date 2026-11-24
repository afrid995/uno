import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchResultModal } from '../MatchResultModal';
import { useGameStore } from '../../../../stores/gameStore';
import { useRoomStore } from '../../../../stores/roomStore';
import { PlayerGameState } from '@uno-ultimate/game-protocol';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ roomCode: 'ROOM99' }),
  };
});

describe('MatchResultModal Isolation & Navigation Tests', () => {
  const mockLeaveRoom = vi.fn().mockResolvedValue(true);

  const mockInProgressGameState: PlayerGameState = {
    id: 'match-new',
    roomId: 'room-new',
    status: 'IN_PROGRESS',
    turnDirection: 'clockwise',
    dealerIndex: 0,
    currentPlayerIndex: 0,
    currentTurnGuestId: 'p1',
    playerOrder: ['p1', 'p2'],
    topDiscardCard: { id: 'c1', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
    activeColor: 'red',
    drawPileCount: 90,
    discardPileCount: 1,
    turnNumber: 1,
    sequenceNumber: 1,
    unoVulnerablePlayerId: null,
    pendingActionState: null,
    roundWinner: null,
    winner: null,
    players: [
      { id: 'p1', username: 'Alice', cardCount: 7, isEliminated: false, score: 0, hasDeclaredUno: false },
      { id: 'p2', username: 'Bob', cardCount: 7, isEliminated: false, score: 0, hasDeclaredUno: false },
    ],
    self: {
      id: 'p1',
      username: 'Alice',
      hand: [{ id: 'c2', color: 'blue', type: 'number', value: '7', scoreValue: 7, variant: 'classic' }],
      isCurrentTurn: true,
      playableCardIds: ['c2'],
      canDraw: false,
      canPass: false,
      canCallUno: false,
      canCatchUno: false,
      canResolveWildDrawFour: false,
      isTargetedByWildDrawFour: false,
    },
    roundNumber: 1,
    targetScore: 500,
    variant: 'classic',
  };

  const mockCompletedGameState: PlayerGameState = {
    ...mockInProgressGameState,
    id: 'match-old',
    status: 'COMPLETED',
    winner: { id: 'p1', username: 'Alice', score: 520 },
    players: [
      { id: 'p1', username: 'Alice', cardCount: 0, isEliminated: false, score: 520, hasDeclaredUno: true },
      { id: 'p2', username: 'Bob', cardCount: 4, isEliminated: false, score: 140, hasDeclaredUno: false },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useRoomStore.setState({
      leaveRoom: mockLeaveRoom,
    });
    useGameStore.getState().reset();
  });

  it('does NOT render when gameState is null', () => {
    useGameStore.setState({
      gameState: null,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('match-result-modal')).not.toBeInTheDocument();
  });

  it('STRICT ISOLATION: does NOT render when gameState is IN_PROGRESS, even if stale showMatchResultModal is true', () => {
    // Simulate previous match leftover in store before new game starts
    useGameStore.setState({
      gameState: mockInProgressGameState,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    // Must NOT be visible during an in-progress game!
    expect(screen.queryByTestId('match-result-modal')).not.toBeInTheDocument();
    expect(screen.queryByText(/is the Champion!/i)).not.toBeInTheDocument();
  });

  it('renders champion banner and standings when gameState status is COMPLETED and modal is active', () => {
    useGameStore.setState({
      gameState: mockCompletedGameState,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('match-result-modal')).toBeInTheDocument();
    expect(screen.getByText(/Alice is the Champion!/i)).toBeInTheDocument();
    expect(screen.getByText(/520 pts/i)).toBeInTheDocument();
    expect(screen.getByTestId('match-result-back-home')).toBeInTheDocument();
    expect(screen.getByTestId('match-result-main-menu')).toBeInTheDocument();
  });

  it('clicking "Back to Home" resets game store, leaves room, and navigates to /dashboard', async () => {
    useGameStore.setState({
      gameState: mockCompletedGameState,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    const backHomeBtn = screen.getByTestId('match-result-back-home');
    fireEvent.click(backHomeBtn);

    await waitFor(() => {
      expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    // Store state must be completely cleared
    const state = useGameStore.getState();
    expect(state.gameState).toBeNull();
    expect(state.showMatchResultModal).toBe(false);
    expect(state.matchWinnerData).toBeNull();
  });

  it('clicking "Main Menu" resets game store, leaves room, and navigates to /dashboard', async () => {
    useGameStore.setState({
      gameState: mockCompletedGameState,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    const mainMenuBtn = screen.getByTestId('match-result-main-menu');
    fireEvent.click(mainMenuBtn);

    await waitFor(() => {
      expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    const state = useGameStore.getState();
    expect(state.gameState).toBeNull();
    expect(state.showMatchResultModal).toBe(false);
    expect(state.matchWinnerData).toBeNull();
  });

  it('renders active "PLAY AGAIN" button for room host and triggers rematch on click', async () => {
    const mockRematch = vi.fn().mockResolvedValue(true);
    useRoomStore.setState({
      room: {
        id: 'room-1',
        roomCode: 'ROOM99',
        hostGuestId: 'p1', // self.id is 'p1' -> isHost = true
        status: 'FINISHED',
        maxPlayers: 4,
        playerCount: 2,
        version: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        settings: { variant: 'classic' },
        members: [
          { id: 'm1', guestId: 'p1', username: 'Alice', role: 'HOST', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
          { id: 'm2', guestId: 'p2', username: 'Bob', role: 'PLAYER', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
        ],
      },
      rematch: mockRematch,
      isStarting: false,
    });

    useGameStore.setState({
      gameState: {
        ...mockCompletedGameState,
        players: [
          { id: 'p1', username: 'Alice', cardCount: 0, isEliminated: false, score: 520, cumulativeScore: 1040, hasDeclaredUno: true },
          { id: 'p2', username: 'Bob', cardCount: 4, isEliminated: false, score: 140, cumulativeScore: 450, hasDeclaredUno: false },
        ],
      },
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    const playAgainBtn = screen.getByTestId('match-result-play-again');
    expect(playAgainBtn).toBeInTheDocument();
    expect(playAgainBtn).toHaveTextContent(/PLAY AGAIN/i);

    // Verify cumulative scores and match scores are both displayed
    expect(screen.getByText('1040 pts total')).toBeInTheDocument();
    expect(screen.getByText('Match: 520 pts')).toBeInTheDocument();

    fireEvent.click(playAgainBtn);
    expect(mockRematch).toHaveBeenCalledTimes(1);
  });

  it('renders "Waiting for host to start Play Again..." for non-host player', () => {
    useRoomStore.setState({
      room: {
        id: 'room-1',
        roomCode: 'ROOM99',
        hostGuestId: 'p2', // self.id is 'p1', host is 'p2' -> isHost = false
        status: 'FINISHED',
        maxPlayers: 4,
        playerCount: 2,
        version: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        settings: { variant: 'classic' },
        members: [
          { id: 'm1', guestId: 'p1', username: 'Alice', role: 'PLAYER', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
          { id: 'm2', guestId: 'p2', username: 'Bob', role: 'HOST', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
        ],
      },
      isStarting: false,
    });

    useGameStore.setState({
      gameState: mockCompletedGameState,
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 520 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('match-result-play-again')).not.toBeInTheDocument();
    expect(screen.getByTestId('match-result-waiting-host')).toHaveTextContent(/Waiting for host to start Play Again/i);
  });

  it('guarantees declared champion is rank #1 and formats single-match score cleanly', () => {
    useRoomStore.setState({
      room: {
        id: 'room-1',
        roomCode: 'ROOM99',
        hostGuestId: 'p2',
        status: 'FINISHED',
        maxPlayers: 2,
        playerCount: 2,
        version: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        settings: { variant: 'uno_show_em_no_mercy' },
        members: [
          { id: 'm1', guestId: 'p1', username: 'shaik afrid', role: 'PLAYER', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
          { id: 'm2', guestId: 'p2', username: 'Afrid', role: 'HOST', readyStatus: true, connectionStatus: 'CONNECTED', joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() },
        ],
      },
      isStarting: false,
    });

    // In match 1, Afrid wins 250 pts by elimination.
    useGameStore.setState({
      gameState: {
        ...mockCompletedGameState,
        variant: 'uno_show_em_no_mercy',
        targetScore: 1000,
        roundNumber: 1,
        winner: { id: 'p2', username: 'Afrid', score: 250, wonByLastStanding: true },
        players: [
          { id: 'p1', username: 'shaik afrid', cardCount: 25, isEliminated: true, score: 0, cumulativeScore: 0, hasDeclaredUno: false },
          { id: 'p2', username: 'Afrid', cardCount: 7, isEliminated: false, score: 250, cumulativeScore: 250, hasDeclaredUno: false },
        ],
      },
      showMatchResultModal: true,
      matchWinnerData: { id: 'p2', username: 'Afrid', score: 250, wonByLastStanding: true },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    // Champion banner must name Afrid
    expect(screen.getByText('Afrid is the Champion!')).toBeInTheDocument();

    // Standings rank #1 must be Afrid (NOT shaik afrid!)
    expect(screen.getByTestId('standing-name-0')).toHaveTextContent(/Afrid/);
    expect(screen.getByTestId('standing-rank-0')).toHaveTextContent('#1');
    expect(screen.getByTestId('standing-score-0')).toHaveTextContent('250 pts');
    expect(screen.queryByTestId('standing-match-score-0')).not.toBeInTheDocument(); // clean single-match format

    // Standings rank #2 must be shaik afrid
    expect(screen.getByTestId('standing-name-1')).toHaveTextContent(/shaik afrid/);
    expect(screen.getByTestId('standing-rank-1')).toHaveTextContent('#2');
    expect(screen.getByTestId('standing-score-1')).toHaveTextContent('0 pts');

    // Victory subtitle must indicate elimination win with singular "1 round"
    expect(screen.getByTestId('victory-subtitle')).toHaveTextContent('Won by elimination as the last remaining player across 1 round!');
  });

  it('renders target score victory message with plural rounds when won on score target', () => {
    useGameStore.setState({
      gameState: {
        ...mockCompletedGameState,
        targetScore: 500,
        roundNumber: 3,
        winner: { id: 'p1', username: 'Alice', score: 540 },
        players: [
          { id: 'p1', username: 'Alice', cardCount: 0, isEliminated: false, score: 540, cumulativeScore: 540, hasDeclaredUno: true },
          { id: 'p2', username: 'Bob', cardCount: 3, isEliminated: false, score: 210, cumulativeScore: 210, hasDeclaredUno: false },
        ],
      },
      showMatchResultModal: true,
      matchWinnerData: { id: 'p1', username: 'Alice', score: 540 },
    });

    render(
      <MemoryRouter>
        <MatchResultModal />
      </MemoryRouter>
    );

    expect(screen.getByTestId('victory-subtitle')).toHaveTextContent('Surpassed the target of 500 points across 3 rounds!');
  });
});
