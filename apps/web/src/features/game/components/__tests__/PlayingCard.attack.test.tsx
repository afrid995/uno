import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard UNO Attack Components (Mattel Product GTX66)', () => {
  it('renders Hit 2 card with HIT 2 display values', () => {
    const card: Card = {
      id: 'attack_blue_hit_2_0',
      color: 'blue',
      type: 'action',
      value: 'hit_2',
      scoreValue: 20,
      variant: 'uno_attack',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('HIT 2').length).toBeGreaterThan(0);
  });

  it('renders Discard All card with DISCARD display value', () => {
    const card: Card = {
      id: 'attack_red_discard_all_0',
      color: 'red',
      type: 'action',
      value: 'discard_all',
      scoreValue: 30,
      variant: 'uno_attack',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('DISCARD').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DISC').length).toBeGreaterThan(0);
  });

  it('renders Wild Hit 4 card with HIT 4 display value', () => {
    const card: Card = {
      id: 'attack_wild_hit_4_0',
      color: null,
      type: 'wild',
      value: 'wild_hit_4',
      scoreValue: 50,
      variant: 'uno_attack',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('HIT 4').length).toBeGreaterThan(0);
  });

  it('renders Wild Attack-Attack card with ATTACK ATTACK center label', () => {
    const card: Card = {
      id: 'attack_wild_attack_attack_0',
      color: null,
      type: 'wild',
      value: 'wild_attack_attack',
      scoreValue: 50,
      variant: 'uno_attack',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('ATTACK ATTACK').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ATK 2x').length).toBeGreaterThan(0);
  });

  it('renders Wild Customizable card with CUSTOM display value', () => {
    const card: Card = {
      id: 'attack_wild_customizable_0',
      color: null,
      type: 'wild',
      value: 'wild_customizable',
      scoreValue: 50,
      variant: 'uno_attack',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('CUSTOM').length).toBeGreaterThan(0);
  });
});
