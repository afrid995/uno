import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardView } from './components/DashboardView';
import { useGuestStore } from '../../stores/guestStore';

describe('DashboardView Component', () => {
  const mockGuest = {
    id: '12345678-1234-4234-8234-123456789abc',
    username: 'LegendPlayer',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useGuestStore.setState({
      guest: mockGuest,
      sessionToken: 'mock-token',
      isLoading: false,
    });
  });

  it('renders welcome message with guest username', () => {
    render(<DashboardView />);

    expect(screen.getByText(/welcome,/i)).toBeInTheDocument();
    expect(screen.getByText(/LegendPlayer/i)).toBeInTheDocument();
  });

  it('displays active guest session indicator and formatted guest ID', () => {
    render(<DashboardView />);

    expect(screen.getByText(/guest session active/i)).toBeInTheDocument();
    expect(screen.getByText(mockGuest.id)).toBeInTheDocument();
  });

  it('renders disabled Phase 2 placeholders for Room Creation and Join', () => {
    render(<DashboardView />);

    // Check badges
    const phase2Badges = screen.getAllByText(/coming in phase 2/i);
    expect(phase2Badges.length).toBeGreaterThanOrEqual(2);

    // Check headings
    expect(screen.getByText(/create private room/i)).toBeInTheDocument();
    expect(screen.getByText(/join private room/i)).toBeInTheDocument();

    // Check disabled buttons
    const disabledButtons = screen.getAllByRole('button', { name: /phase 2/i });
    expect(disabledButtons.length).toBe(2);
    disabledButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('displays server-authoritative fair play notice', () => {
    render(<DashboardView />);

    expect(screen.getByText(/server-authoritative fair play foundation/i)).toBeInTheDocument();
  });
});
