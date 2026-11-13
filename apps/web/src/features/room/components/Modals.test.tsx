import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CreateRoomModal } from './CreateRoomModal';
import { JoinRoomModal } from './JoinRoomModal';
import { useRoomStore } from '../../../stores/roomStore';

describe('Room Modals', () => {
  const mockCreateRoom = vi.fn();
  const mockJoinRoom = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useRoomStore.setState({
      createRoom: mockCreateRoom,
      joinRoom: mockJoinRoom,
      isLoading: false,
      error: null,
      clearError: vi.fn(),
    });
  });

  describe('CreateRoomModal', () => {
    it('does not render when isOpen is false', () => {
      render(
        <BrowserRouter>
          <CreateRoomModal isOpen={false} onClose={mockOnClose} />
        </BrowserRouter>
      );
      expect(screen.queryByText(/create private room/i)).not.toBeInTheDocument();
    });

    it('renders player capacity selector when open', () => {
      render(
        <BrowserRouter>
          <CreateRoomModal isOpen={true} onClose={mockOnClose} />
        </BrowserRouter>
      );

      expect(screen.getByText(/create private room/i)).toBeInTheDocument();
      expect(screen.getByText(/player capacity/i)).toBeInTheDocument();

      // Check default capacity button (6)
      expect(screen.getByRole('button', { name: '6' })).toBeInTheDocument();
    });

    it('submits form with selected capacity', async () => {
      mockCreateRoom.mockResolvedValue(true);

      render(
        <BrowserRouter>
          <CreateRoomModal isOpen={true} onClose={mockOnClose} />
        </BrowserRouter>
      );

      // Select 4 players
      const btn4 = screen.getByRole('button', { name: '4' });
      fireEvent.click(btn4);

      // Click Create Room
      const submitBtn = screen.getByRole('button', { name: /create room/i });
      fireEvent.click(submitBtn);

      expect(mockCreateRoom).toHaveBeenCalledWith({ maxPlayers: 4 });
    });
  });

  describe('JoinRoomModal', () => {
    it('does not render when isOpen is false', () => {
      render(
        <BrowserRouter>
          <JoinRoomModal isOpen={false} onClose={mockOnClose} />
        </BrowserRouter>
      );
      expect(screen.queryByText(/join private room/i)).not.toBeInTheDocument();
    });

    it('renders room code input with formatting and submits valid code', async () => {
      mockJoinRoom.mockResolvedValue(true);

      render(
        <BrowserRouter>
          <JoinRoomModal isOpen={true} onClose={mockOnClose} />
        </BrowserRouter>
      );

      const input = screen.getByPlaceholderText(/7X8K2M/i);
      expect(input).toBeInTheDocument();

      // Type lowercase and test sanitization
      fireEvent.change(input, { target: { value: 'ab23cd' } });
      expect((input as HTMLInputElement).value).toBe('AB23CD');

      // Click Enter Room
      const joinBtn = screen.getByRole('button', { name: /enter room/i });
      fireEvent.click(joinBtn);

      expect(mockJoinRoom).toHaveBeenCalledWith({ roomCode: 'AB23CD' });
    });
  });
});
