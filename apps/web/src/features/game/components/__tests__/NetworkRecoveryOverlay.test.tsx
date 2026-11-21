import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NetworkRecoveryOverlay } from '../NetworkRecoveryOverlay';
import { useGameStore } from '../../../../stores/gameStore';
import { socketManager } from '../../../../services/socketClient';

describe('NetworkRecoveryOverlay Component', () => {
  beforeEach(() => {
    act(() => {
      useGameStore.setState({ connectionStatus: 'connected' });
    });
  });

  it('renders nothing when connectionStatus is connected', () => {
    render(<NetworkRecoveryOverlay />);
    expect(screen.queryByTestId('reconnecting-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('connection-lost-overlay')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reconnected-banner')).not.toBeInTheDocument();
  });

  it('renders reconnecting overlay when connectionStatus is reconnecting', () => {
    act(() => {
      useGameStore.setState({ connectionStatus: 'reconnecting' });
    });

    render(<NetworkRecoveryOverlay />);
    const overlay = screen.getByTestId('reconnecting-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent(/RECONNECTING TO MATCH/i);
    expect(overlay).toHaveTextContent(/Hand & seat preserved/i);
  });

  it('renders connection lost overlay with retry button when connectionStatus is disconnected', () => {
    act(() => {
      useGameStore.setState({ connectionStatus: 'disconnected' });
    });

    const mockSocket = {
      connected: false,
      connect: vi.fn(),
    } as unknown as ReturnType<typeof socketManager.getSocket>;
    vi.spyOn(socketManager, 'getSocket').mockReturnValue(mockSocket);

    render(<NetworkRecoveryOverlay />);
    const overlay = screen.getByTestId('connection-lost-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveTextContent(/CONNECTION LOST/i);

    const retryBtn = screen.getByTestId('reconnect-retry-button');
    expect(retryBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(mockSocket.connect).toHaveBeenCalled();
  });

  it('renders reconnected confirmation banner when connectionStatus is reconnected', () => {
    act(() => {
      useGameStore.setState({ connectionStatus: 'reconnected' });
    });

    render(<NetworkRecoveryOverlay />);
    const banner = screen.getByTestId('reconnected-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/RECONNECTED/i);
    expect(banner).toHaveTextContent(/Match state synchronized/i);
  });
});
