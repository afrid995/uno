import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TeamPassModal } from '../TeamPassModal';
import { Card } from '@uno-ultimate/game-protocol';

describe('TeamPassModal Component (Mattel Product HXT58)', () => {
  const sampleHand: Card[] = [
    { id: 'c1', color: 'red', value: '5', type: 'number', scoreValue: 5, variant: 'uno_teams' },
    { id: 'c2', color: 'blue', value: '7', type: 'number', scoreValue: 7, variant: 'uno_teams' },
    { id: 'c3', color: 'green', value: '3', type: 'number', scoreValue: 3, variant: 'uno_teams' },
  ];

  it('renders initial team pass mode and allows selecting and passing 1 card', () => {
    const onSubmit = vi.fn();

    render(
      <TeamPassModal
        isOpen={true}
        mode="INITIAL_PASS"
        hand={sampleHand}
        cardsCountToPass={1}
        onSubmitPass={onSubmit}
      />
    );

    expect(screen.getByTestId('team-pass-modal')).toBeDefined();
    expect(screen.getByText('Initial Team Card Pass')).toBeDefined();

    // Select card c1
    const cardEl = screen.getByTestId('team-pass-card-c1');
    fireEvent.click(cardEl);

    // Confirm button should be enabled
    const confirmBtn = screen.getByTestId('confirm-team-pass-btn');
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);

    expect(onSubmit).toHaveBeenCalledWith(['c1']);
  });

  it('renders hand split mode requiring multiple cards selection', () => {
    const onSubmit = vi.fn();

    render(
      <TeamPassModal
        isOpen={true}
        mode="HAND_SPLIT"
        hand={sampleHand}
        cardsCountToPass={2}
        onSubmitPass={onSubmit}
      />
    );

    expect(screen.getByText('Partner Hand-Off Split')).toBeDefined();

    // Select c1
    fireEvent.click(screen.getByTestId('team-pass-card-c1'));
    // Button still disabled because 2 cards required
    const confirmBtn = screen.getByTestId('confirm-team-pass-btn');
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);

    // Select c2
    fireEvent.click(screen.getByTestId('team-pass-card-c2'));
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(confirmBtn);
    expect(onSubmit).toHaveBeenCalledWith(['c1', 'c2']);
  });
});
