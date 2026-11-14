import { describe, it, expect } from 'vitest';
import '../src/variants/all-wild/all-wild.adapter';
import { AllWildFixtureBuilder } from '../src/variants/all-wild/all-wild.fixture';
import { assertValidAllWildGameState } from '../src/variants/all-wild/all-wild.invariants';
import { ALL_WILD_RULES } from '../src/variants/all-wild/all-wild.constants';

describe('UNO All Wild — Test Fixture Hardening & Card Conservation', () => {
  it('creates an initial game fixture obeying all invariants', () => {
    const state = AllWildFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    expect(state.players).toHaveLength(2);
    expect(state.variant).toBe('uno_all_wild');
    assertValidAllWildGameState(state);
  });

  it('injectPlayableCard injects requested card value while preserving total 112 cards', () => {
    const state = AllWildFixtureBuilder.createInitialGameFixture();
    const { nextState, card } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_targeted_draw_two');

    expect(card.value).toBe('wild_targeted_draw_two');
    expect(nextState.players[0].hand.some((c) => c.id === card.id)).toBe(true);
    assertValidAllWildGameState(nextState);
  });

  it('injectPlayableCard returns same card if player already holds requested value', () => {
    const state = AllWildFixtureBuilder.createInitialGameFixture();
    const { nextState: s1, card: c1 } = AllWildFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_forced_swap');
    const { nextState: s2, card: c2 } = AllWildFixtureBuilder.injectPlayableCard(s1, 'p1', 'wild_forced_swap');

    expect(c1.id).toBe(c2.id);
    expect(s1).toBe(s2);
    assertValidAllWildGameState(s2);
  });

  it('setHandSize shrinks and expands hand while strictly preserving 112 physical cards', () => {
    const state = AllWildFixtureBuilder.createInitialGameFixture();
    expect(state.players[0].hand).toHaveLength(7);

    // Shrink to 2 cards
    const shrunk = AllWildFixtureBuilder.setHandSize(state, 'p1', 2);
    expect(shrunk.players[0].hand).toHaveLength(2);
    assertValidAllWildGameState(shrunk);

    // Expand to 10 cards
    const expanded = AllWildFixtureBuilder.setHandSize(shrunk, 'p1', 10);
    expect(expanded.players[0].hand).toHaveLength(10);
    assertValidAllWildGameState(expanded);
  });

  it('fails if targetCount is less than 1', () => {
    const state = AllWildFixtureBuilder.createInitialGameFixture();
    expect(() => {
      AllWildFixtureBuilder.setHandSize(state, 'p1', 0);
    }).toThrow(/Invalid targetCount 0/);
  });
});
