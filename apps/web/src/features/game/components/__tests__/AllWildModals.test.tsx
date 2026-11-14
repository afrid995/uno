import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TargetedDrawTwoModal } from '../TargetedDrawTwoModal';
import { ForcedSwapModal } from '../ForcedSwapModal';
import { PublicPlayer } from '@uno-ultimate/game-protocol';

describe('All Wild Modals Component Tests', () => {
  const eligiblePlayers: PublicPlayer[] = [
    {
      id: 'p2',
      username: 'Bob',
      cardCount: 4,
      hasDeclaredUno: false,
      score: 100,
      isEliminated: false,
    },
    {
      id: 'p3',
      username: 'Charlie',
      cardCount: 1,
      hasDeclaredUno: true,
      score: 50,
      isEliminated: false,
    },
  ];

  describe('TargetedDrawTwoModal', () => {
    it('does not render when isOpen is false', () => {
      render(
        <TargetedDrawTwoModal
          isOpen={false}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={vi.fn()}
        />
      );
      expect(screen.queryByText('Targeted Draw Two!')).toBeNull();
    });

    it('renders all eligible opponents and fires onSelectTarget on click', () => {
      const handleSelect = vi.fn();
      render(
        <TargetedDrawTwoModal
          isOpen={true}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={handleSelect}
        />
      );

      expect(screen.getByText('Targeted Draw Two!')).toBeDefined();
      expect(screen.getByText('Bob')).toBeDefined();
      expect(screen.getByText('Charlie')).toBeDefined();

      const bobButton = screen.getByTestId('targeted-draw-target-p2');
      fireEvent.click(bobButton);
      expect(handleSelect).toHaveBeenCalledWith('p2');
    });
  });

  describe('ForcedSwapModal', () => {
    it('does not render when isOpen is false', () => {
      render(
        <ForcedSwapModal
          isOpen={false}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={vi.fn()}
        />
      );
      expect(screen.queryByText('Wild Forced Swap!')).toBeNull();
    });

    it('renders all eligible opponents and fires onSelectTarget on click', () => {
      const handleSelect = vi.fn();
      render(
        <ForcedSwapModal
          isOpen={true}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={handleSelect}
        />
      );

      expect(screen.getByText('Wild Forced Swap!')).toBeDefined();
      expect(screen.getByText('Bob')).toBeDefined();
      expect(screen.getByText('Charlie')).toBeDefined();

      const charlieButton = screen.getByTestId('forced-swap-target-p3');
      fireEvent.click(charlieButton);
      expect(handleSelect).toHaveBeenCalledWith('p3');
    });
  });
});
