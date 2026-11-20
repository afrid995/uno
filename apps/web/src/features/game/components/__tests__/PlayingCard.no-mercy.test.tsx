import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard No Mercy Components', () => {
  it('renders Discard All card with DISC and DISCARD labels', () => {
    const card: Card = {
      id: 'nm_disc_1',
      color: 'red',
      type: 'action',
      value: 'discard_all',
      scoreValue: 20,
      variant: 'uno_show_em_no_mercy',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('DISC').length).toBeGreaterThan(0);
    expect(screen.getAllByText('DISCARD').length).toBeGreaterThan(0);
  });

  it('renders Skip Everyone card with SKIP ALL center label', () => {
    const card: Card = {
      id: 'nm_skip_all_1',
      color: 'blue',
      type: 'action',
      value: 'skip_everyone',
      scoreValue: 20,
      variant: 'uno_show_em_no_mercy',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('SKIP ALL').length).toBeGreaterThan(0);
  });

  it('renders Wild Reverse Draw Four card with +4 ⇄', () => {
    const card: Card = {
      id: 'nm_wrdf_1',
      color: null,
      type: 'wild',
      value: 'wild_reverse_draw_four',
      scoreValue: 50,
      variant: 'uno_show_em_no_mercy',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('+4 ⇄').length).toBeGreaterThan(0);
  });

  it('renders Wild Draw Six and Wild Draw Ten cards', () => {
    const d6: Card = {
      id: 'nm_wd6_1',
      color: null,
      type: 'wild',
      value: 'wild_draw_six',
      scoreValue: 50,
      variant: 'uno_show_em_no_mercy',
    };
    const { unmount } = render(<PlayingCard card={d6} />);
    expect(screen.getAllByText('+6').length).toBeGreaterThan(0);
    unmount();

    const d10: Card = {
      id: 'nm_wd10_1',
      color: null,
      type: 'wild',
      value: 'wild_draw_ten',
      scoreValue: 50,
      variant: 'uno_show_em_no_mercy',
    };
    render(<PlayingCard card={d10} />);
    expect(screen.getAllByText('+10').length).toBeGreaterThan(0);
  });

  it('renders standard Wild Color Change in No Mercy with WILD label', () => {
    const wildCard: Card = {
      id: 'nm_wild_copy_1',
      color: null,
      type: 'wild',
      value: 'wild',
      scoreValue: 50,
      variant: 'uno_show_em_no_mercy',
    };

    render(<PlayingCard card={wildCard} />);
    expect(screen.getAllByText('WILD').length).toBeGreaterThan(0);
  });
});
