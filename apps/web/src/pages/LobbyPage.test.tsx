import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LobbyPage } from './LobbyPage';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { RoomPublicDto } from '@uno-ultimate/shared';

describe('LobbyPage Component', () => {
  const mockLeaveRoom = vi.fn();
  const mockToggleReady = vi.fn();
  const mockStartGame = vi.fn();
  const mockJoinRoom = vi.fn();
  const mockInitSocketListeners = vi.fn(() => vi.fn());

  const mockHostGuest = {
    id: 'host-123',
    username: 'SuperHost',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  const mockPlayerGuest = {
    id: 'player-456',
    username: 'GuestChallenger',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  const createMockRoom = (nonHostReady: boolean = false): RoomPublicDto => ({
    id: 'room-abc',
    roomCode: 'W4XYZ9',
    hostGuestId: 'host-123',
    status: 'WAITING',
    maxPlayers: 4,
    playerCount: 2,
    settings: {},
    version: 1,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    members: [
      {
        id: 'member-1',
        guestId: 'host-123',
        username: 'SuperHost',
        role: 'HOST',
        readyStatus: true,
        connectionStatus: 'CONNECTED',
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      {
        id: 'member-2',
        guestId: 'player-456',
        username: 'GuestChallenger',
        role: 'PLAYER',
        readyStatus: nonHostReady,
        connectionStatus: 'CONNECTED',
        joinedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLobby = (roomCode = 'W4XYZ9') =>
    render(
      <MemoryRouter initialEntries={[`/room/${roomCode}`]}>
        <Routes>
          <Route path="/room/:roomCode" element={<LobbyPage />} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('renders lobby header, room code, and member player cards for host', () => {
    useGuestStore.setState({ guest: mockHostGuest, sessionToken: 'token' });
    useRoomStore.setState({
      room: createMockRoom(false),
      isLoading: false,
      isStarting: false,
      startingCountdown: null,
      error: null,
      initSocketListeners: mockInitSocketListeners,
      leaveRoom: mockLeaveRoom,
      toggleReady: mockToggleReady,
      startGame: mockStartGame,
      joinRoom: mockJoinRoom,
    });

    renderLobby();

    expect(screen.getByText(/private game lobby/i)).toBeInTheDocument();
    expect(screen.getByText('W4XYZ9')).toBeInTheDocument();
    expect(screen.getByText('SuperHost')).toBeInTheDocument();
    expect(screen.getByText('GuestChallenger')).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 4/)).toBeInTheDocument();
  });

  it('disables host start button when non-host players are not ready', () => {
    useGuestStore.setState({ guest: mockHostGuest, sessionToken: 'token' });
    useRoomStore.setState({
      room: createMockRoom(false),
      isLoading: false,
      isStarting: false,
      startingCountdown: null,
      error: null,
      initSocketListeners: mockInitSocketListeners,
      leaveRoom: mockLeaveRoom,
      toggleReady: mockToggleReady,
      startGame: mockStartGame,
      joinRoom: mockJoinRoom,
    });

    renderLobby();

    const startBtn = screen.getByRole('button', { name: /start game/i });
    expect(startBtn).toBeDisabled();
  });

  it('enables host start button when all non-host players are ready', () => {
    useGuestStore.setState({ guest: mockHostGuest, sessionToken: 'token' });
    useRoomStore.setState({
      room: createMockRoom(true), // non-host ready
      isLoading: false,
      isStarting: false,
      startingCountdown: null,
      error: null,
      initSocketListeners: mockInitSocketListeners,
      leaveRoom: mockLeaveRoom,
      toggleReady: mockToggleReady,
      startGame: mockStartGame,
      joinRoom: mockJoinRoom,
    });

    renderLobby();

    const startBtn = screen.getByRole('button', { name: /start game/i });
    expect(startBtn).toBeEnabled();

    fireEvent.click(startBtn);
    expect(mockStartGame).toHaveBeenCalledTimes(1);
  });

  it('renders ready toggle button for non-host player and calls toggleReady on click', () => {
    useGuestStore.setState({ guest: mockPlayerGuest, sessionToken: 'token' });
    useRoomStore.setState({
      room: createMockRoom(false),
      isLoading: false,
      isStarting: false,
      startingCountdown: null,
      error: null,
      initSocketListeners: mockInitSocketListeners,
      leaveRoom: mockLeaveRoom,
      toggleReady: mockToggleReady,
      startGame: mockStartGame,
      joinRoom: mockJoinRoom,
    });

    renderLobby();

    const readyBtn = screen.getByRole('button', { name: /i'm ready!/i });
    expect(readyBtn).toBeInTheDocument();

    fireEvent.click(readyBtn);
    expect(mockToggleReady).toHaveBeenCalledTimes(1);
  });

  it('handles leave room flow with confirmation prompt', async () => {
    useGuestStore.setState({ guest: mockHostGuest, sessionToken: 'token' });
    useRoomStore.setState({
      room: createMockRoom(false),
      isLoading: false,
      isStarting: false,
      startingCountdown: null,
      error: null,
      initSocketListeners: mockInitSocketListeners,
      leaveRoom: mockLeaveRoom,
      toggleReady: mockToggleReady,
      startGame: mockStartGame,
      joinRoom: mockJoinRoom,
    });

    renderLobby();

    // Click Leave Room button
    const leaveBtn = screen.getByRole('button', { name: /leave room/i });
    fireEvent.click(leaveBtn);

    // Confirmation options appear
    expect(screen.getByText(/leave room\?/i)).toBeInTheDocument();
    const confirmBtn = screen.getByRole('button', { name: /yes, leave/i });
    fireEvent.click(confirmBtn);

    expect(mockLeaveRoom).toHaveBeenCalledTimes(1);
  });
});
