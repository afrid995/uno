import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
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

  const renderDashboard = () =>
    render(
      <BrowserRouter>
        <DashboardView />
      </BrowserRouter>
    );

  it('renders welcome message with guest username', () => {
    renderDashboard();

    expect(screen.getByText(/welcome,/i)).toBeInTheDocument();
    expect(screen.getByText(/LegendPlayer/i)).toBeInTheDocument();
  });

  it('displays active guest session indicator and formatted guest ID', () => {
    renderDashboard();

    expect(screen.getByText(/guest session active/i)).toBeInTheDocument();
    expect(screen.getByText(mockGuest.id)).toBeInTheDocument();
  });

  it('renders active Phase 2 buttons for Room Creation and Join', () => {
    renderDashboard();

    // Check headings
    expect(screen.getByText(/create private room/i)).toBeInTheDocument();
    expect(screen.getByText(/join private room/i)).toBeInTheDocument();

    // Check active buttons
    const createBtn = screen.getByRole('button', { name: /create room/i });
    const joinBtn = screen.getByRole('button', { name: /join room/i });
    expect(createBtn).toBeEnabled();
    expect(joinBtn).toBeEnabled();
  });

  it('displays server-authoritative fair play notice', () => {
    renderDashboard();

    expect(screen.getByText(/server-authoritative fair play foundation/i)).toBeInTheDocument();
  });
});
