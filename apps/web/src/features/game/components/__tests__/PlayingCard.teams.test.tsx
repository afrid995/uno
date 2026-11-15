import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard } from '../PlayingCard';
import { Card } from '@uno-ultimate/game-protocol';

describe('PlayingCard UNO Teams Components (Mattel Product HXT58)', () => {
  it('renders Number card with Passing Symbol', () => {
    const card: Card = {
      id: 'teams_red_5_1',
      color: 'red',
      type: 'number',
      value: '5',
      scoreValue: 5,
      variant: 'uno_teams',
      hasPassingSymbol: true,
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    const passIcons = screen.getAllByTestId('card-passing-symbol');
    expect(passIcons.length).toBeGreaterThan(0);
  });

  it('renders Number card without Passing Symbol', () => {
    const card: Card = {
      id: 'teams_red_5_0',
      color: 'red',
      type: 'number',
      value: '5',
      scoreValue: 5,
      variant: 'uno_teams',
      hasPassingSymbol: false,
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.queryByTestId('card-passing-symbol')).toBeNull();
  });

  it('renders Wild Team Play card with TEAM PLAY center label', () => {
    const card: Card = {
      id: 'teams_wild_team_play_0',
      color: null,
      type: 'wild',
      value: 'wild_team_play',
      scoreValue: 50,
      variant: 'uno_teams',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('TEAM PLAY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TEAM ⇄').length).toBeGreaterThan(0);
  });

  it('renders Wild Team Draw Four card with TEAM DRAW 4 center label', () => {
    const card: Card = {
      id: 'teams_wild_team_draw_four_0',
      color: null,
      type: 'wild',
      value: 'wild_team_draw_four',
      scoreValue: 50,
      variant: 'uno_teams',
    };

    render(<PlayingCard card={card} />);
    expect(screen.getAllByText('TEAM DRAW 4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+4👥').length).toBeGreaterThan(0);
  });
});
