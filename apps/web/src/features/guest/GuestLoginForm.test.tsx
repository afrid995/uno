import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestLoginForm } from './components/GuestLoginForm';
import { useGuestStore } from '../../stores/guestStore';

describe('GuestLoginForm Component', () => {
  beforeEach(() => {
    useGuestStore.setState({
      guest: null,
      sessionToken: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders username input, character counter, and play button', () => {
    render(<GuestLoginForm />);

    expect(screen.getByLabelText(/player name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. CardMaster/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play now/i })).toBeInTheDocument();
    expect(screen.getByText(/0\/20/i)).toBeInTheDocument();
  });

  it('displays client-side error when submitting empty username', async () => {
    render(<GuestLoginForm />);

    const playBtn = screen.getByRole('button', { name: /play now/i });
    fireEvent.click(playBtn);

    await waitFor(() => {
      expect(screen.getByText(/please enter a username to play/i)).toBeInTheDocument();
    });
  });

  it('displays client-side error when username is shorter than 2 characters', async () => {
    const user = userEvent.setup();
    render(<GuestLoginForm />);

    const input = screen.getByLabelText(/player name/i);
    await user.type(input, 'A');

    const playBtn = screen.getByRole('button', { name: /play now/i });
    await user.click(playBtn);

    await waitFor(() => {
      expect(screen.getByText(/username must be at least 2 characters/i)).toBeInTheDocument();
    });
  });

  it('calls createGuest on valid form submission', async () => {
    const createGuestMock = vi.fn().mockResolvedValue(true);
    useGuestStore.setState({ createGuest: createGuestMock });

    const user = userEvent.setup();
    render(<GuestLoginForm />);

    const input = screen.getByLabelText(/player name/i);
    await user.type(input, 'CardChampion');

    const playBtn = screen.getByRole('button', { name: /play now/i });
    await user.click(playBtn);

    await waitFor(() => {
      expect(createGuestMock).toHaveBeenCalledWith('CardChampion');
    });
  });

  it('shows loading state when guest creation is in progress', () => {
    useGuestStore.setState({ isLoading: true });
    render(<GuestLoginForm />);

    expect(screen.getByText(/creating guest session/i)).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('displays server error if creation fails', () => {
    useGuestStore.setState({ error: 'Server unavailable. Try again.' });
    render(<GuestLoginForm />);

    expect(screen.getByText(/server unavailable\. try again\./i)).toBeInTheDocument();
  });
});
