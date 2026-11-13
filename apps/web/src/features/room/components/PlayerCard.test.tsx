import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayerCard } from './PlayerCard';
import { RoomMemberPublicDto } from '@uno-ultimate/shared';

describe('PlayerCard Component', () => {
  const baseMember: RoomMemberPublicDto = {
    id: 'member-1',
    guestId: 'guest-123',
    username: 'SpeedyUno',
    role: 'PLAYER',
    readyStatus: false,
    connectionStatus: 'CONNECTED',
    joinedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };

  it('renders player username and avatar initial', () => {
    render(<PlayerCard member={baseMember} isCurrentPlayer={false} isHost={false} />);

    expect(screen.getByText('SpeedyUno')).toBeInTheDocument();
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
  });

  it('displays "You" badge when isCurrentPlayer is true', () => {
    render(<PlayerCard member={baseMember} isCurrentPlayer={true} isHost={false} />);

    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('displays "Host" crown badge when member is host', () => {
    const hostMember = { ...baseMember, role: 'HOST' as const };
    render(<PlayerCard member={hostMember} isCurrentPlayer={false} isHost={true} />);

    expect(screen.getByText('Host')).toBeInTheDocument();
  });

  it('displays Ready status badge when readyStatus is true', () => {
    const readyMember = { ...baseMember, readyStatus: true };
    render(<PlayerCard member={readyMember} isCurrentPlayer={false} isHost={false} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('displays Not Ready badge when readyStatus is false', () => {
    render(<PlayerCard member={baseMember} isCurrentPlayer={false} isHost={false} />);

    expect(screen.getByText('Not Ready')).toBeInTheDocument();
  });

  it('displays disconnected warning when connectionStatus is DISCONNECTED', () => {
    const disconnectedMember = { ...baseMember, connectionStatus: 'DISCONNECTED' as const };
    render(<PlayerCard member={disconnectedMember} isCurrentPlayer={false} isHost={false} />);

    expect(screen.getByText(/disconnected \(reconnecting\.\.\.\)/i)).toBeInTheDocument();
  });
});
