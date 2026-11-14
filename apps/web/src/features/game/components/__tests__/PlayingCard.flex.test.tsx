import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard UNO Flex Components', () => {
  it('renders Classic Number card with flip icon', () => {
    const card: Card = {
      id: 'flex_card_1',
      color: 'red',
      type: 'number',
      value: '2',
      scoreValue: 2,
      variant: 'uno_flex',
      hasFlipIcon: true,
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    const flipIcons = screen.getAllByTestId('card-flip-icon');
    expect(flipIcons.length).toBeGreaterThan(0);
  });

  it('renders Flex Number card with flex color badge', () => {
    const card: Card = {
      id: 'flex_card_2',
      color: 'red',
      type: 'number',
      value: '4',
      scoreValue: 4,
      variant: 'uno_flex',
      flexColor: 'green',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    const badge = screen.getByTestId('flex-color-badge');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('data-flex-color')).toBe('green');
  });

  it('renders Flex Draw Two card with FLEX +2 label', () => {
    const card: Card = {
      id: 'flex_draw_two_1',
      color: 'yellow',
      type: 'action',
      value: 'flex_draw_two',
      scoreValue: 20,
      variant: 'uno_flex',
      flexColor: 'green',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('+2⚡').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FLEX +2').length).toBeGreaterThan(0);
  });

  it('renders Flex Reverse and Flex Skip cards', () => {
    const revCard: Card = {
      id: 'flex_rev_1',
      color: 'blue',
      type: 'action',
      value: 'flex_reverse',
      scoreValue: 20,
      variant: 'uno_flex',
      flexColor: 'yellow',
    };

    const { rerender } = render(<PlayingCard card={revCard} />);
    expect(screen.getAllByText('⇄⚡').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FLEX REV').length).toBeGreaterThan(0);

    const skipCard: Card = {
      id: 'flex_skip_1',
      color: 'green',
      type: 'action',
      value: 'flex_skip',
      scoreValue: 20,
      variant: 'uno_flex',
      flexColor: 'blue',
    };

    rerender(<PlayingCard card={skipCard} />);
    expect(screen.getAllByText('⊘⚡').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FLEX SKIP').length).toBeGreaterThan(0);
  });

  it('renders Wild All Flip card with ALL FLIP center label', () => {
    const card: Card = {
      id: 'wild_all_flip_1',
      color: null,
      type: 'wild',
      value: 'wild_all_flip',
      scoreValue: 50,
      variant: 'uno_flex',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('FLIP').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ALL FLIP').length).toBeGreaterThan(0);
  });

  it('renders Flex Wild Draw Four, Target Draw Two, and All Draw cards', () => {
    const card4: Card = {
      id: 'flex_wild_draw_four_1',
      color: null,
      type: 'wild',
      value: 'flex_wild_draw_four',
      scoreValue: 50,
      variant: 'uno_flex',
    };

    const { rerender } = render(<PlayingCard card={card4} />);
    expect(screen.getAllByText('TARGET +4').length).toBeGreaterThan(0);

    const card2: Card = {
      id: 'flex_wild_target_draw_two_1',
      color: null,
      type: 'wild',
      value: 'flex_wild_target_draw_two',
      scoreValue: 50,
      variant: 'uno_flex',
    };

    rerender(<PlayingCard card={card2} />);
    expect(screen.getAllByText('TARGET +2').length).toBeGreaterThan(0);

    const cardAll: Card = {
      id: 'flex_wild_all_draw_1',
      color: null,
      type: 'wild',
      value: 'flex_wild_all_draw',
      scoreValue: 50,
      variant: 'uno_flex',
    };

    rerender(<PlayingCard card={cardAll} />);
    expect(screen.getAllByText('ALL DRAW 2').length).toBeGreaterThan(0);
  });
});
