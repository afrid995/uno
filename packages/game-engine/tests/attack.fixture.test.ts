import { describe, it, expect } from 'vitest';
import { AttackFixtureBuilder } from '../src/variants/attack/attack.fixture';
import { assertValidAttackGameState } from '../src/variants/attack/attack.invariants';
import { AttackDeckFactory } from '../src/variants/attack/attack.deck';

describe('UNO Attack Fixture Builder & State Integrity', () => {
  it('creates a valid initial 4-player game fixture with 112 cards', () => {
    const state = AttackFixtureBuilder.createInitialGameFixture(4);

    expect(state.variant).toBe('uno_attack');
    expect(state.players.length).toBe(4);
    expect(state.players.every((p) => p.hand.length >= 7)).toBe(true);
    expect(state.discardPile.length).toBeGreaterThanOrEqual(1);

    assertValidAttackGameState(state);
  });

  it('constructs a custom state while strictly conserving 112 cards', () => {
    const initial = AttackFixtureBuilder.createInitialGameFixture(4);
    const fullDeck = AttackDeckFactory.createDeck();

    const topCard = fullDeck.find((c) => c.color === 'red' && c.value === '5')!;
    const p1Card = fullDeck.find((c) => c.color === 'red' && c.value === '7')!;
    const p2Card = fullDeck.find((c) => c.color === 'blue' && c.value === '3')!;

    const custom = AttackFixtureBuilder.setCustomState(
      initial,
      {
        p1: [p1Card],
        p2: [p2Card],
        p3: [],
        p4: [],
      },
      topCard,
      'red'
    );

    expect(custom.players[0].hand.length).toBe(1);
    expect(custom.players[1].hand.length).toBe(1);
    expect(custom.topDiscardCard.id).toBe(topCard.id);

    // Exact card conservation
    const total =
      custom.drawPile.length +
      custom.discardPile.length +
      custom.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(total).toBe(112);

    assertValidAttackGameState(custom);
  });

  it('sets up a deterministic round-end state ready for immediate victory', () => {
    const initial = AttackFixtureBuilder.createInitialGameFixture(4);
    const roundEnd = AttackFixtureBuilder.setupRoundEndState(initial, 'p1');

    expect(roundEnd.currentPlayerIndex).toBe(0);
    expect(roundEnd.players[0].hand.length).toBe(1);
    expect(roundEnd.topDiscardCard.color).toBe('red');
    expect(roundEnd.players[0].hand[0].color).toBe('red');

    assertValidAttackGameState(roundEnd);
  });
});
