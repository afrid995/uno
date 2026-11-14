import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard All Wild Components', () => {
  it('renders Standard Wild card with WILD label', () => {
    const card: Card = {
      id: 'all_wild_wild_1',
      color: null,
      type: 'wild',
      value: 'wild',
      scoreValue: 20,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('WILD').length).toBeGreaterThan(0);
  });

  it('renders Wild Reverse card with ⇄ and REVERSE labels', () => {
    const card: Card = {
      id: 'all_wild_rev_1',
      color: null,
      type: 'wild',
      value: 'wild_reverse',
      scoreValue: 50,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('⇄').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REVERSE').length).toBeGreaterThan(0);
  });

  it('renders Wild Skip card with ⊘ and SKIP labels', () => {
    const card: Card = {
      id: 'all_wild_skip_1',
      color: null,
      type: 'wild',
      value: 'wild_skip',
      scoreValue: 50,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('⊘').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKIP').length).toBeGreaterThan(0);
  });

  it('renders Wild Skip Two card with ⊘2 and SKIP 2 labels', () => {
    const card: Card = {
      id: 'all_wild_sk2_1',
      color: null,
      type: 'wild',
      value: 'wild_skip_two',
      scoreValue: 50,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('⊘2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SKIP 2').length).toBeGreaterThan(0);
  });

  it('renders Wild Targeted Draw Two card with +2🎯 and TARGET +2 labels', () => {
    const card: Card = {
      id: 'all_wild_td2_1',
      color: null,
      type: 'wild',
      value: 'wild_targeted_draw_two',
      scoreValue: 50,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('+2🎯').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TARGET +2').length).toBeGreaterThan(0);
  });

  it('renders Wild Forced Swap card with ⇅ and SWAP labels', () => {
    const card: Card = {
      id: 'all_wild_swap_1',
      color: null,
      type: 'wild',
      value: 'wild_forced_swap',
      scoreValue: 50,
      variant: 'uno_all_wild',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('⇅').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SWAP').length).toBeGreaterThan(0);
  });
});
