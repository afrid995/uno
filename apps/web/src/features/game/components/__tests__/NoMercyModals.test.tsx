import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SevenSwapModal } from '../SevenSwapModal';
import { StackPenaltyBanner } from '../StackPenaltyBanner';
import { PublicPlayer, PublicPendingStack } from '@uno-ultimate/game-protocol';

describe('No Mercy UI Modals and Banners', () => {
  describe('SevenSwapModal', () => {
    it('renders list of eligible opponents and triggers swap selection', () => {
      const onSelect = vi.fn();
      const opponents: PublicPlayer[] = [
        { id: 'p2', username: 'Bob', cardCount: 5, hasDeclaredUno: false, score: 0 },
        { id: 'p3', username: 'Charlie', cardCount: 12, hasDeclaredUno: false, score: 0 },
      ];

      render(
        <SevenSwapModal
          isOpen={true}
          eligiblePlayers={opponents}
          onSelectTarget={onSelect}
        />
      );

      expect(screen.getByText('7 Played — Swap Hands!')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.getByText('Charlie')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('swap-target-p2'));
      expect(onSelect).toHaveBeenCalledWith('p2');
    });

    it('does not render when closed', () => {
      render(
        <SevenSwapModal
          isOpen={false}
          eligiblePlayers={[]}
          onSelectTarget={vi.fn()}
        />
      );

      expect(screen.queryByText('7 Played — Swap Hands!')).not.toBeInTheDocument();
    });
  });

  describe('StackPenaltyBanner', () => {
    const stackInfo: PublicPendingStack = {
      type: 'AWAITING_STACK_RESOLUTION',
      targetPlayerId: 'p1',
      playedByPlayerId: 'p2',
      accumulatedPenalty: 6,
      lastStackedValue: 4,
      lastCardValue: 'draw_four',
    };

    it('renders target prompt and accept button when user is target', () => {
      const onAccept = vi.fn();

      render(
        <StackPenaltyBanner
          pendingStack={stackInfo}
          isTarget={true}
          canStack={true}
          targetUsername="Alice"
          onAcceptPenalty={onAccept}
        />
      );

      expect(screen.getByText('+6 CARDS')).toBeInTheDocument();
      expect(screen.getByText(/Play an equal or higher Draw card/)).toBeInTheDocument();
      const btn = screen.getByTestId('accept-stack-penalty-btn');
      expect(btn).toBeInTheDocument();

      fireEvent.click(btn);
      expect(onAccept).toHaveBeenCalledTimes(1);
    });

    it('renders waiting message when user is spectator / non-target', () => {
      render(
        <StackPenaltyBanner
          pendingStack={stackInfo}
          isTarget={false}
          canStack={false}
          targetUsername="Bob"
          onAcceptPenalty={vi.fn()}
        />
      );

      expect(screen.getByText(/Waiting for/)).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
      expect(screen.queryByTestId('accept-stack-penalty-btn')).not.toBeInTheDocument();
    });
  });
});
