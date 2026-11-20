import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JoinInvitePage } from './JoinInvitePage';
import { useRoomStore } from '../stores/roomStore';
import { useGuestStore } from '../stores/guestStore';
import { apiRequest } from '../services/apiClient';

vi.mock('../services/apiClient', () => ({
  apiRequest: vi.fn(),
}));

describe('JoinInvitePage Component', () => {
  const mockJoinRoom = vi.fn();
  const mockCreateGuest = vi.fn();
  const mockLogout = vi.fn();
  const mockClearError = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    useGuestStore.setState({
      guest: null,
      sessionToken: null,
      isLoading: false,
      isResuming: false,
      error: null,
      createGuest: mockCreateGuest,
      logout: mockLogout,
    });

    useRoomStore.setState({
      room: null,
      isLoading: false,
      error: null,
      joinRoom: mockJoinRoom,
      clearError: mockClearError,
    });
  });

  it('renders loading state while inspecting room invitation', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/join/TEST01']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Inspecting room TEST01/i)).toBeInTheDocument();
  });

  it('displays "Invalid or Expired Invitation" when room does not exist', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { exists: false, error: 'Room not found' },
    });

    render(
      <MemoryRouter initialEntries={['/join/INVALID']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Invalid or Expired Invitation/i)).toBeInTheDocument();
    });
    expect(screen.getByText('INVALID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enter Code Manually/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Go to Home/i })).toBeInTheDocument();
  });

  it('displays "Match Already in Progress" when room status is IN_GAME', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'INGAME',
        status: 'IN_GAME',
        playerCount: 3,
        maxPlayers: 4,
        isFull: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/join/INGAME']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Match Already in Progress/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Return to Home/i })).toBeInTheDocument();
  });

  it('displays "Room is Full" when room has reached max players', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'FULLRM',
        status: 'WAITING',
        playerCount: 4,
        maxPlayers: 4,
        isFull: true,
      },
    });

    render(
      <MemoryRouter initialEntries={['/join/FULLRM']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Room is Full/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Return to Home/i })).toBeInTheDocument();
  });

  it('automatically triggers joinRoom for existing authenticated guest', async () => {
    useGuestStore.setState({
      guest: {
        id: 'guest-1',
        username: 'ProGamer',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      sessionToken: 'token-123',
      isLoading: false,
      isResuming: false,
    });

    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'AUTOJN',
        status: 'WAITING',
        playerCount: 1,
        maxPlayers: 4,
        isFull: false,
      },
    });

    mockJoinRoom.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/join/AUTOJN']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
          <Route path="/room/:roomCode" element={<div>Room Lobby Page: AUTOJN</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockJoinRoom).toHaveBeenCalledWith({ roomCode: 'AUTOJN' });
    });
  });

  it('displays error and Try Again button when auto-join fails for existing guest', async () => {
    useGuestStore.setState({
      guest: {
        id: 'guest-1',
        username: 'ProGamer',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      sessionToken: 'token-123',
      isLoading: false,
      isResuming: false,
    });

    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'FAILJN',
        status: 'WAITING',
        playerCount: 1,
        maxPlayers: 4,
        isFull: false,
      },
    });

    useRoomStore.setState({ error: 'Room join rejected by server' });
    mockJoinRoom.mockResolvedValue(false);

    render(
      <MemoryRouter initialEntries={['/join/FAILJN']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Could Not Join Room/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();

    // Clicking try again re-attempts join
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Try Again/i }));
    });
    expect(mockJoinRoom).toHaveBeenCalledTimes(2);
  });

  it('renders guest name entry form for new unauthenticated guest, creates guest, and joins room', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'NEWGST',
        status: 'WAITING',
        playerCount: 1,
        maxPlayers: 4,
        isFull: false,
      },
    });

    mockCreateGuest.mockResolvedValue(true);
    mockJoinRoom.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={['/join/NEWGST']}>
        <Routes>
          <Route path="/join/:roomCode" element={<JoinInvitePage />} />
          <Route path="/room/:roomCode" element={<div>Room Lobby Page: NEWGST</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Join UNO Lobby/i)).toBeInTheDocument();
    });

    const usernameInput = screen.getByLabelText(/Choose your player name/i);
    expect(usernameInput).toBeInTheDocument();

    fireEvent.change(usernameInput, { target: { value: 'NewChallenger' } });
    fireEvent.click(screen.getByRole('button', { name: /Join Game/i }));

    await waitFor(() => {
      expect(mockCreateGuest).toHaveBeenCalledWith('NewChallenger');
      expect(mockJoinRoom).toHaveBeenCalledWith({ roomCode: 'NEWGST' });
    });
  });

  it('supports query parameter room code e.g. /join?room=PARAM1', async () => {
    (apiRequest as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        exists: true,
        roomCode: 'PARAM1',
        status: 'WAITING',
        playerCount: 1,
        maxPlayers: 4,
        isFull: false,
      },
    });

    render(
      <MemoryRouter initialEntries={['/join?room=PARAM1']}>
        <Routes>
          <Route path="/join" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/PARAM1/i)).toBeInTheDocument();
    });
  });

  it('renders manual code entry when visited without any room code', async () => {
    render(
      <MemoryRouter initialEntries={['/join']}>
        <Routes>
          <Route path="/join" element={<JoinInvitePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Enter Room Code/i)).toBeInTheDocument();
    });

    const input = screen.getByLabelText(/Room Code/i);
    expect(input).toBeInTheDocument();
  });
});
