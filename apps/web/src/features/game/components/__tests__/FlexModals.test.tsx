import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TargetedDrawFourModal } from '../TargetedDrawFourModal';
import { FlexCardChoiceModal } from '../FlexCardChoiceModal';
import { PlayerSeat } from '../PlayerSeat';
import { PublicPlayer, Card } from '@uno-ultimate/game-protocol';

describe('UNO Flex Modals & PlayerSeat Component Tests', () => {
  const eligiblePlayers: PublicPlayer[] = [
    {
      id: 'p2',
      username: 'Bob',
      cardCount: 4,
      hasDeclaredUno: false,
      score: 100,
      isEliminated: false,
      powerCardStatus: 'green_check',
    },
    {
      id: 'p3',
      username: 'Charlie',
      cardCount: 1,
      hasDeclaredUno: true,
      score: 50,
      isEliminated: false,
      powerCardStatus: 'red_x',
    },
  ];

  describe('TargetedDrawFourModal', () => {
    it('does not render when isOpen is false', () => {
      render(
        <TargetedDrawFourModal
          isOpen={false}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={vi.fn()}
        />
      );
      expect(screen.queryByText('Flex Wild Draw Four!')).toBeNull();
    });

    it('renders all eligible opponents and fires onSelectTarget on click', () => {
      const handleSelect = vi.fn();
      render(
        <TargetedDrawFourModal
          isOpen={true}
          eligiblePlayers={eligiblePlayers}
          onSelectTarget={handleSelect}
        />
      );

      expect(screen.getByText('Flex Wild Draw Four!')).toBeDefined();
      expect(screen.getByText('Bob')).toBeDefined();
      expect(screen.getByText('Charlie')).toBeDefined();

      const bobButton = screen.getByTestId('targeted-draw-four-target-p2');
      fireEvent.click(bobButton);
      expect(handleSelect).toHaveBeenCalledWith('p2');
    });
  });

  describe('FlexCardChoiceModal', () => {
    const flexCard: Card = {
      id: 'c1',
      color: 'red',
      type: 'number',
      value: '4',
      scoreValue: 4,
      variant: 'uno_flex',
      flexColor: 'green',
    };

    it('does not render when isOpen is false or card is null', () => {
      const { rerender } = render(
        <FlexCardChoiceModal
          isOpen={false}
          card={flexCard}
          onChooseRegular={vi.fn()}
          onChooseFlex={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByText('Play Regular or Flex?')).toBeNull();

      rerender(
        <FlexCardChoiceModal
          isOpen={true}
          card={null}
          onChooseRegular={vi.fn()}
          onChooseFlex={vi.fn()}
          onClose={vi.fn()}
        />
      );
      expect(screen.queryByText('Play Regular or Flex?')).toBeNull();
    });

    it('renders options and fires onChooseRegular or onChooseFlex', () => {
      const handleRegular = vi.fn();
      const handleFlex = vi.fn();
      const handleClose = vi.fn();

      const { rerender } = render(
        <FlexCardChoiceModal
          isOpen={true}
          card={flexCard}
          onChooseRegular={handleRegular}
          onChooseFlex={handleFlex}
          onClose={handleClose}
        />
      );

      expect(screen.getByText('Play Regular or Flex?')).toBeDefined();
      expect(screen.getByTestId('flex-choice-regular')).toBeDefined();
      expect(screen.getByTestId('flex-choice-flex')).toBeDefined();

      fireEvent.click(screen.getByTestId('flex-choice-regular'));
      expect(handleRegular).toHaveBeenCalledTimes(1);

      rerender(
        <FlexCardChoiceModal
          isOpen={true}
          card={flexCard}
          onChooseRegular={handleRegular}
          onChooseFlex={handleFlex}
          onClose={handleClose}
        />
      );

      fireEvent.click(screen.getByTestId('flex-choice-flex'));
      expect(handleFlex).toHaveBeenCalledTimes(1);
    });
  });

  describe('PlayerSeat Power Card Badge', () => {
    it('renders green checkmark badge when powerCardStatus is green_check', () => {
      render(
        <PlayerSeat
          player={eligiblePlayers[0]}
          isCurrentTurn={false}
        />
      );

      const badge = screen.getByTestId('power-card-badge');
      expect(badge.getAttribute('data-power-status')).toBe('green_check');
      expect(badge.textContent).toContain('✓');
    });

    it('renders red X badge when powerCardStatus is red_x', () => {
      render(
        <PlayerSeat
          player={eligiblePlayers[1]}
          isCurrentTurn={false}
        />
      );

      const badge = screen.getByTestId('power-card-badge');
      expect(badge.getAttribute('data-power-status')).toBe('red_x');
      expect(badge.textContent).toContain('✗');
    });
  });
});
