import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AttackLauncher } from '../AttackLauncher';
import { AttackTargetModal } from '../AttackTargetModal';
import { PublicPlayer } from '@uno-ultimate/game-protocol';

describe('AttackLauncher Component (Mattel Product GTX66)', () => {
  it('renders launcher in standby mode when canPress is false', () => {
    const handlePress = vi.fn();
    render(
      <AttackLauncher
        cardCount={98}
        canPress={false}
        isMyTurn={false}
        onPress={handlePress}
      />
    );

    expect(screen.getByTestId('attack-launcher')).toBeDefined();
    expect(screen.getByTestId('launcher-card-count').textContent).toContain('98 loaded');

    const pressBtn = screen.getByTestId('launcher-press-button') as HTMLButtonElement;
    expect(pressBtn.disabled).toBe(true);
    expect(pressBtn.textContent).toContain('STANDBY');

    fireEvent.click(pressBtn);
    expect(handlePress).not.toHaveBeenCalled();
  });

  it('renders launcher in active mode when canPress is true and triggers onPress on click', () => {
    const handlePress = vi.fn();
    render(
      <AttackLauncher
        cardCount={95}
        canPress={true}
        isMyTurn={true}
        onPress={handlePress}
      />
    );

    const pressBtn = screen.getByTestId('launcher-press-button') as HTMLButtonElement;
    expect(pressBtn.disabled).toBe(false);
    expect(pressBtn.textContent).toContain('PRESS');
    expect(pressBtn.textContent).toContain('ACTIVE');

    fireEvent.click(pressBtn);
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('displays tension indicator correctly', () => {
    render(
      <AttackLauncher
        cardCount={90}
        canPress={true}
        isMyTurn={true}
        launcherState={{
          tension: 3,
        }}
        onPress={() => {}}
      />
    );

    const tensionIndicator = screen.getByTestId('launcher-tension-indicator');
    expect(tensionIndicator.getAttribute('title')).toContain('Level 3/4');
  });

  it('displays safe notification when recent launch dispensed 0 cards', () => {
    render(
      <AttackLauncher
        cardCount={90}
        canPress={false}
        isMyTurn={false}
        launcherState={{
          tension: 2,
          lastLaunchResult: {
            playerId: 'player1',
            cardsLaunched: 0,
            totalPresses: 1,
            timestamp: Date.now(),
          },
        }}
        onPress={() => {}}
      />
    );

    const ejectionBanner = screen.getByTestId('launcher-ejection-animation');
    expect(ejectionBanner.textContent).toContain('SAFE! (0 Cards)');
  });

  it('displays attack notification when recent launch dispensed cards', () => {
    render(
      <AttackLauncher
        cardCount={86}
        canPress={false}
        isMyTurn={false}
        launcherState={{
          tension: 0,
          lastLaunchResult: {
            playerId: 'player2',
            cardsLaunched: 4,
            totalPresses: 2,
            timestamp: Date.now(),
          },
        }}
        onPress={() => {}}
      />
    );

    const ejectionBanner = screen.getByTestId('launcher-ejection-animation');
    expect(ejectionBanner.textContent).toContain('ATTACK! +4 Cards!');
  });
});

describe('AttackTargetModal Component', () => {
  const eligiblePlayers: PublicPlayer[] = [
    {
      id: 'p2',
      username: 'Bob',
      cardCount: 5,
      hasDeclaredUno: false,
      score: 0,
    },
    {
      id: 'p3',
      username: 'Charlie',
      cardCount: 2,
      hasDeclaredUno: false,
      score: 0,
    },
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <AttackTargetModal
        isOpen={false}
        eligiblePlayers={eligiblePlayers}
        onSelectTarget={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders eligible players and handles target selection', () => {
    const handleSelectTarget = vi.fn();
    render(
      <AttackTargetModal
        isOpen={true}
        eligiblePlayers={eligiblePlayers}
        onSelectTarget={handleSelectTarget}
      />
    );

    expect(screen.getByText('Wild Attack-Attack!')).toBeDefined();
    const bobBtn = screen.getByTestId('attack-target-p2');
    expect(bobBtn.textContent).toContain('Bob');

    fireEvent.click(bobBtn);
    expect(handleSelectTarget).toHaveBeenCalledWith('p2');
  });
});
