import { describe, it, expect } from 'vitest';
import { FlexFixtureBuilder } from '../src/variants/flex/flex.fixture';
import { assertValidFlexGameState } from '../src/variants/flex/flex.invariants';

describe('UNO Flex — Fixture Builder & Invariant Hardening Tests', () => {
  it('creates a valid initial 2-player fixture with all invariants intact', () => {
    const state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    expect(state.variant).toBe('uno_flex');
    expect(state.status).toBe('IN_PROGRESS');
    expect(state.players).toHaveLength(2);
    expect(state.players[0].hand).toHaveLength(7);
    expect(state.players[1].hand).toHaveLength(7);
    expect(state.players[0].powerCardStatus).toBe('green_check');
    expect(state.players[1].powerCardStatus).toBe('green_check');
    expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    expect(state.topDiscardCard.type).toBe('number');
    expect(state.activeColor).toBe(state.topDiscardCard.color);
    expect(state.drawPile.length + state.discardPile.length).toBe(104 - 14); // 90 remaining cards

    expect(() => assertValidFlexGameState(state)).not.toThrow();
  });

  it('creates a valid 8-player fixture (maximum official player count)', () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      id: `p${i + 1}`,
      username: `Player${i + 1}`,
    }));

    const state = FlexFixtureBuilder.createInitialGameFixture({ players });
    expect(state.players).toHaveLength(8);
    expect(state.players.every((p) => p.powerCardStatus === 'green_check')).toBe(true);
    expect(state.discardPile.length).toBeGreaterThanOrEqual(1);
    expect(state.topDiscardCard.type).toBe('number');
    expect(state.activeColor).toBe(state.topDiscardCard.color);
    expect(state.drawPile.length + state.discardPile.length).toBe(104 - 8 * 7); // 48 remaining cards
    expect(() => assertValidFlexGameState(state)).not.toThrow();
  });

  it('supports safely swapping a card into hand while preserving 104-card conservation', () => {
    const state = FlexFixtureBuilder.createInitialGameFixture();
    const initialTotalCards =
      state.drawPile.length +
      state.discardPile.length +
      state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(initialTotalCards).toBe(104);

    const { nextState, card } = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.value === 'flex_wild_draw_four'
    );

    expect(card.value).toBe('flex_wild_draw_four');
    expect(nextState.players[0].hand.some((c) => c.id === card.id)).toBe(true);

    const afterTotalCards =
      nextState.drawPile.length +
      nextState.discardPile.length +
      nextState.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(afterTotalCards).toBe(104);
    expect(() => assertValidFlexGameState(nextState)).not.toThrow();
  });

  it('supports swapping the top discard card while preserving 104-card conservation', () => {
    const state = FlexFixtureBuilder.createInitialGameFixture();
    const { nextState, topCard } = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'blue' && c.type === 'number'
    );

    expect(topCard.color).toBe('blue');
    expect(nextState.topDiscardCard.id).toBe(topCard.id);
    expect(nextState.activeColor).toBe('blue');
    expect(() => assertValidFlexGameState(nextState)).not.toThrow();
  });
});
