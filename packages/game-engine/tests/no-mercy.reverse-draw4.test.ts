import { describe, it, expect } from 'vitest';
import '../src/variants/no-mercy/no-mercy.adapter';
import { NoMercyActionProcessor } from '../src/variants/no-mercy/no-mercy.actions';
import { NoMercyMoveValidator } from '../src/variants/no-mercy/no-mercy.validator';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { assertValidNoMercyGameState } from '../src/variants/no-mercy/no-mercy.invariants';
import { getPlayerGameState } from '../src/projections/player-state';
import { CardColor } from '../src/cards/card.types';
import { GameState } from '../src/game/game.types';

describe('UNO Show \'em No Mercy — Wild Reverse Draw Four Regression Suite (Tests 1-20)', () => {
  // Test 1 — Two players, no previous stack
  it('Test 1: Two players, no previous stack — A plays Reverse +4, self-targets, B does not receive penalty', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1, // P1 (Alice) starts
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const res = NoMercyActionProcessor.process(s1, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wrd4.id,
      chosenColor: 'red',
    });

    // Direction reverses
    expect(res.nextState.turnDirection).toBe('counter_clockwise');
    // Penalty = 4
    expect(res.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    expect(res.nextState.pendingActionState?.lastStackedValue).toBe(4);
    // Recipient = A (self-targeting in 2-player mode per Mattel HWV18)
    expect(res.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(res.nextState.currentPlayerIndex).toBe(0);

    // B does not receive penalty
    const bobView = getPlayerGameState(res.nextState, 'p2');
    expect(bobView.self.isTargetedByStack).toBe(false);

    // A can continue legal stacking
    const aliceView = getPlayerGameState(res.nextState, 'p1');
    expect(aliceView.self.isTargetedByStack).toBe(true);
    assertValidNoMercyGameState(res.nextState);
  });

  // Test 2 — Two-player attack chain
  it('Test 2: Two-player attack chain — A: +2, B: +4, A: Reverse +4 (penalty = 10, recipient = A)', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });

    // 1. A plays +2
    const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_two', state.activeColor ?? 'blue');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(2);
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p2');

    // 2. B stacks +4
    const { nextState: s2, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'draw_four', r1.nextState.activeColor ?? 'blue');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4.id });
    expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(6);
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p1');

    // 3. A stacks Reverse +4
    const { nextState: s3, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p1', 'wild_reverse_draw_four');
    const r3 = NoMercyActionProcessor.process(s3, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wrd4.id,
      chosenColor: 'yellow',
    });

    // Assert: Penalty = 10, Recipient = A, Minimum stack value = 4, Direction reversed once
    expect(r3.nextState.turnDirection).toBe('counter_clockwise');
    expect(r3.nextState.pendingActionState?.accumulatedPenalty).toBe(10);
    expect(r3.nextState.pendingActionState?.lastStackedValue).toBe(4);
    expect(r3.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r3.nextState.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(r3.nextState);
  });

  // Test 3 — Two-player normal +4 after self-targeting
  it('Test 3: Two-player normal +4 after self-targeting — A stacks normal +4 onto Reverse +4, targets B with 14', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });

    // A: +2 -> B: +4 -> A: Reverse +4 (from Test 2)
    const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_two', state.activeColor ?? 'blue');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
    const { nextState: s2, card: d4_1 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'draw_four', r1.nextState.activeColor ?? 'blue');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4_1.id });
    const { nextState: s3, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p1', 'wild_reverse_draw_four');
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'green' });

    // A now stacks a normal +4 (color green)
    const { nextState: s4, card: d4_2 } = NoMercyFixtureBuilder.injectPlayableCard(r3.nextState, 'p1', 'draw_four', 'green');
    const r4 = NoMercyActionProcessor.process(s4, { type: 'PLAY_CARD', playerId: 'p1', cardId: d4_2.id });

    // Assert: Penalty = 14, Recipient = B, Direction remains counter_clockwise
    expect(r4.nextState.turnDirection).toBe('counter_clockwise');
    expect(r4.nextState.pendingActionState?.accumulatedPenalty).toBe(14);
    expect(r4.nextState.pendingActionState?.lastStackedValue).toBe(4);
    expect(r4.nextState.pendingActionState?.targetPlayerId).toBe('p2');
    expect(r4.nextState.currentPlayerIndex).toBe(1);
    assertValidNoMercyGameState(r4.nextState);
  });

  // Test 4 — Consecutive Reverse +4 in two-player game
  it('Test 4: Consecutive Reverse +4 in two-player game — Direction reverses twice (returns to clockwise), penalty = 8, recipient = A', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });

    // A plays WRD4
    const { nextState: s1, card: wrd4_1 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_1.id, chosenColor: 'blue' });
    expect(r1.nextState.turnDirection).toBe('counter_clockwise');
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p1');

    // A stacks another WRD4
    const { nextState: s2, card: wrd4_2 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p1', 'wild_reverse_draw_four');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_2.id, chosenColor: 'red' });

    // Direction reverses twice and returns to clockwise!
    expect(r2.nextState.turnDirection).toBe('clockwise');
    expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
    expect(r2.nextState.pendingActionState?.lastStackedValue).toBe(4);
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r2.nextState.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(r2.nextState);
  });

  // Test 5 — Two-player penalty acceptance
  it('Test 5: Two-player penalty acceptance — A accepts penalty, draws cards, B draws none, turn resumes with B', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });

    const aliceInitialHandCount = state.players[0].hand.length; // 7
    const bobInitialHandCount = state.players[1].hand.length; // 7

    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'blue' });

    // A accepts penalty
    const r2 = NoMercyActionProcessor.process(r1.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p1' });

    // A hand: 7 - 1 (played) + 4 (drawn) = 10
    const alice = r2.nextState.players.find((p) => p.id === 'p1')!;
    const bob = r2.nextState.players.find((p) => p.id === 'p2')!;
    expect(alice.hand.length).toBe(aliceInitialHandCount - 1 + 4);
    expect(bob.hand.length).toBe(bobInitialHandCount); // B draws none

    // Pending penalty clears, stacking threshold resets
    expect(r2.nextState.pendingActionState).toBeNull();
    // Turn advances to B
    expect(r2.nextState.currentPlayerIndex).toBe(1);
    assertValidNoMercyGameState(r2.nextState);
  });

  // Test 6 — Three players, clockwise
  it('Test 6: Three players, clockwise — A plays Reverse +4, direction becomes counter_clockwise, recipient = C', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2, // P1 starts (index 0)
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
    });
    expect(state.turnDirection).toBe('clockwise');

    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'blue' });

    // Direction becomes counter_clockwise, Recipient = C (index 2), Penalty = 4
    expect(r1.nextState.turnDirection).toBe('counter_clockwise');
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p3');
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    expect(r1.nextState.currentPlayerIndex).toBe(2);
    assertValidNoMercyGameState(r1.nextState);
  });

  // Test 7 — Three players, counterclockwise
  it('Test 7: Three players, counterclockwise — Initial direction counter_clockwise, A plays Reverse +4, direction becomes clockwise, recipient = B', () => {
    const baseState = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
    });
    const state: GameState = {
      ...baseState,
      turnDirection: 'counter_clockwise',
    };

    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'yellow' });

    // Direction becomes clockwise, Recipient = B (index 1), Penalty = 4
    expect(r1.nextState.turnDirection).toBe('clockwise');
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p2');
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    expect(r1.nextState.currentPlayerIndex).toBe(1);
    assertValidNoMercyGameState(r1.nextState);
  });

  // Test 8 — Four-player stacking chain
  it('Test 8: Four-player stacking chain — A: +2, B: +4, C: Reverse +4 -> Penalty = 10, Direction = counter_clockwise, Recipient = B', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 3, // P1 starts
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
        { id: 'p4', username: 'Diana' },
      ],
    });

    // 1. A plays +2 -> targets B (+2)
    const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_two', state.activeColor ?? 'blue');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p2');

    // 2. B plays +4 -> targets C (+6)
    const { nextState: s2, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'draw_four', r1.nextState.activeColor ?? 'blue');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4.id });
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p3');

    // 3. C plays Reverse +4 -> reverses to counter_clockwise, targets B (+10)
    const { nextState: s3, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p3', 'wild_reverse_draw_four');
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p3', cardId: wrd4.id, chosenColor: 'red' });

    expect(r3.nextState.turnDirection).toBe('counter_clockwise');
    expect(r3.nextState.pendingActionState?.accumulatedPenalty).toBe(10);
    expect(r3.nextState.pendingActionState?.lastStackedValue).toBe(4);
    expect(r3.nextState.pendingActionState?.targetPlayerId).toBe('p2');
    expect(r3.nextState.currentPlayerIndex).toBe(1);
    assertValidNoMercyGameState(r3.nextState);
  });

  // Test 9 — Repeated direction changes
  it('Test 9: Repeated direction changes — Continue Test 8: B: +4, A: Reverse +4 -> Penalty = 18, Direction = clockwise, Recipient = B; B accepts and turn resumes with C', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 3,
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
        { id: 'p4', username: 'Diana' },
      ],
    });

    // Test 8 setup: A: +2 -> B: +4 -> C: WRD4
    const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_two', state.activeColor ?? 'blue');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
    const { nextState: s2, card: d4_1 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'draw_four', r1.nextState.activeColor ?? 'blue');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4_1.id });
    const { nextState: s3, card: wrd4_1 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p3', 'wild_reverse_draw_four');
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p3', cardId: wrd4_1.id, chosenColor: 'red' });

    // Set Bob's hand size small so 18 cards does not eliminate Bob (>25)
    // Bob hand = 2 cards; after play: 1 + 18 = 19 <= 25 (Active!)
    const r3Adjusted = NoMercyFixtureBuilder.setHandSize(r3.nextState, 'p2', 2);

    // B stacks +4 (red) -> In counter_clockwise from B (1), next player is A (0)
    const { nextState: s4, card: d4_2 } = NoMercyFixtureBuilder.injectPlayableCard(r3Adjusted, 'p2', 'draw_four', 'red');
    const r4 = NoMercyActionProcessor.process(s4, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4_2.id });
    expect(r4.nextState.pendingActionState?.accumulatedPenalty).toBe(14);
    expect(r4.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r4.nextState.turnDirection).toBe('counter_clockwise');

    // A stacks Reverse +4 -> Reverses to clockwise! In clockwise from A (0), next is B (1)
    const { nextState: s5, card: wrd4_2 } = NoMercyFixtureBuilder.injectPlayableCard(r4.nextState, 'p1', 'wild_reverse_draw_four');
    const r5 = NoMercyActionProcessor.process(s5, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_2.id, chosenColor: 'yellow' });
    expect(r5.nextState.turnDirection).toBe('clockwise');
    expect(r5.nextState.pendingActionState?.accumulatedPenalty).toBe(18);
    expect(r5.nextState.pendingActionState?.targetPlayerId).toBe('p2');
    expect(r5.nextState.currentPlayerIndex).toBe(1);

    // B accepts penalty
    const r6 = NoMercyActionProcessor.process(r5.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p2' });
    const bob = r6.nextState.players.find((p) => p.id === 'p2')!;
    expect(bob.isEliminated).toBe(false);
    expect(bob.hand.length).toBe(19);
    expect(r6.nextState.pendingActionState).toBeNull();
    // In clockwise order, after B (index 1), next player is C (index 2)!
    expect(r6.nextState.currentPlayerIndex).toBe(2);
    assertValidNoMercyGameState(r6.nextState);
  });

  // Test 10 — Reverse +4 stacked on Reverse +4 in 3+ players
  it('Test 10: Reverse +4 stacked on Reverse +4 in 3+ players — Directions oscillate and proper recipient selected', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
    });

    // Alice plays WRD4 -> Reverses to counter_clockwise, targets Charlie (index 2)
    const { nextState: s1, card: wrd4_1 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_1.id, chosenColor: 'blue' });
    expect(r1.nextState.turnDirection).toBe('counter_clockwise');
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p3');
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);

    // Charlie stacks another WRD4 -> Reverses to clockwise! From Charlie (2) clockwise is Alice (0)!
    const { nextState: s2, card: wrd4_2 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p3', 'wild_reverse_draw_four');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p3', cardId: wrd4_2.id, chosenColor: 'red' });
    expect(r2.nextState.turnDirection).toBe('clockwise');
    expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(8);
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r2.nextState.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(r2.nextState);
  });

  // Test 11 — Invalid lower-value stacking
  it('Test 11: Invalid lower-value stacking — WRD4 cannot stack on +6 or +10; +2 cannot stack on WRD4; state unmodified', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
    });

    // 1. Setup pending +6 from Alice on Bob
    const { nextState: s1, card: wd6 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_draw_six');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wd6.id, chosenColor: 'blue' });

    // Bob tries to stack WRD4 (+4) onto +6 -> REJECTED
    const { nextState: s2, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'wild_reverse_draw_four');
    const valResult1 = NoMercyMoveValidator.validate(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: wrd4.id, chosenColor: 'red' });
    expect(valResult1.valid).toBe(false);
    expect(valResult1.code).toBe('INVALID_CARD_MATCH');

    // 2. Setup pending WRD4 from Alice on Charlie
    const { nextState: s3, card: wrd4_a } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4_a.id, chosenColor: 'blue' });

    // Charlie tries to stack +2 onto WRD4 -> REJECTED
    const { nextState: s4, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(r3.nextState, 'p3', 'draw_two', 'blue');
    const valResult2 = NoMercyMoveValidator.validate(s4, { type: 'PLAY_CARD', playerId: 'p3', cardId: d2.id });
    expect(valResult2.valid).toBe(false);
    expect(valResult2.code).toBe('INVALID_CARD_MATCH');

    // Assert state is completely unmodified when attempting invalid action
    expect(() => NoMercyActionProcessor.process(s4, { type: 'PLAY_CARD', playerId: 'p3', cardId: d2.id })).toThrow();
  });

  // Test 12 — Higher-value stacking
  it('Test 12: Higher-value stacking — +6 and +10 can legally stack on Reverse +4', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
    });

    // Alice plays WRD4 -> counter_clockwise, targets Charlie (+4)
    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'blue' });

    // Charlie stacks +6 (+6 >= 4) -> counter_clockwise from Charlie (2) is Bob (1) (+10)
    const { nextState: s2, card: wd6 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p3', 'wild_draw_six');
    const val6 = NoMercyMoveValidator.validate(s2, { type: 'PLAY_CARD', playerId: 'p3', cardId: wd6.id, chosenColor: 'green' });
    expect(val6.valid).toBe(true);
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p3', cardId: wd6.id, chosenColor: 'green' });
    expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(10);
    expect(r2.nextState.pendingActionState?.lastStackedValue).toBe(6);
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p2');

    // Bob stacks +10 (+10 >= 6) -> counter_clockwise from Bob (1) is Alice (0) (+20)
    const { nextState: s3, card: wd10 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p2', 'wild_draw_ten');
    const val10 = NoMercyMoveValidator.validate(s3, { type: 'PLAY_CARD', playerId: 'p2', cardId: wd10.id, chosenColor: 'yellow' });
    expect(val10.valid).toBe(true);
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p2', cardId: wd10.id, chosenColor: 'yellow' });
    expect(r3.nextState.pendingActionState?.accumulatedPenalty).toBe(20);
    expect(r3.nextState.pendingActionState?.lastStackedValue).toBe(10);
    expect(r3.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    assertValidNoMercyGameState(r3.nextState);
  });

  // Test 13 — Color selection
  it('Test 13: Color selection — Test all supported Wild colors, reject invalid color or omitted color', () => {
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];

    for (const color of colors) {
      const state = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2,
        players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
      });
      const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');

      const val = NoMercyMoveValidator.validate(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: color });
      expect(val.valid).toBe(true);

      const res = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: color });
      expect(res.nextState.activeColor).toBe(color);
      expect(res.nextState.turnDirection).toBe('counter_clockwise');
      expect(res.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    }

    // Omitted color is rejected
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
    });
    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const valMissing = NoMercyMoveValidator.validate(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id });
    expect(valMissing.valid).toBe(false);
    expect(valMissing.code).toBe('MUST_CHOOSE_COLOR');

    // Invalid color is rejected
    const valInvalid = NoMercyMoveValidator.validate(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'purple' as any });
    expect(valInvalid.valid).toBe(false);
    expect(valInvalid.code).toBe('INVALID_CHOSEN_COLOR');
  });

  // Test 14 — Mercy elimination reduces game to 2 players
  it('Test 14: Mercy elimination — 3 players reduced to 2 by elimination; Reverse +4 then self-targets', () => {
    let state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2, // P1 starts (index 0)
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
    });

    // Eliminate Charlie (p3) by moving his hand to setAsideCards and marking eliminated
    const charlie = state.players.find((p) => p.id === 'p3')!;
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p3' ? { ...p, isEliminated: true, hand: [] } : p)),
      setAsideCards: [...(state.setAsideCards || []), ...charlie.hand],
      eliminatedPlayerIds: ['p3'],
    };

    // Now active players are Alice (p1) and Bob (p2) (exactly 2 active players!)
    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'red' });

    // 2-player self-targeting rule applies: targets Alice!
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(4);
    expect(r1.nextState.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(r1.nextState);
  });

  // Test 15 — Skipping eliminated seats
  it('Test 15: Skipping eliminated seats — 4 players with P2 eliminated; P3 playing WRD4 targets P1 (skips P2)', () => {
    let state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 3,
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
        { id: 'p4', username: 'Diana' },
      ],
    });

    // Eliminate Bob (p2) by moving his hand to setAsideCards and marking eliminated
    const bob = state.players.find((p) => p.id === 'p2')!;
    state = {
      ...state,
      players: state.players.map((p) => (p.id === 'p2' ? { ...p, isEliminated: true, hand: [] } : p)),
      setAsideCards: [...(state.setAsideCards || []), ...bob.hand],
      eliminatedPlayerIds: ['p2'],
      currentPlayerIndex: 2, // Charlie's turn
    };

    // Charlie (p3) plays WRD4
    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p3', 'wild_reverse_draw_four');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p3', cardId: wrd4.id, chosenColor: 'blue' });

    // Direction reversed to counter_clockwise.
    // In counter_clockwise from Charlie (index 2), Bob (index 1) is eliminated, so target is Alice (index 0)!
    expect(r1.nextState.turnDirection).toBe('counter_clockwise');
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r1.nextState.currentPlayerIndex).toBe(0);
    assertValidNoMercyGameState(r1.nextState);
  });

  // Test 16 — Parameterized across supported player counts (2, 3, 4, 5, 6) and both directions
  it('Test 16: Parameterized across player counts (2, 3, 4, 5, 6) and both starting directions', () => {
    const playerCounts = [2, 3, 4, 5, 6];
    const directions: ('clockwise' | 'counter_clockwise')[] = ['clockwise', 'counter_clockwise'];

    for (const count of playerCounts) {
      for (const dir of directions) {
        const players = Array.from({ length: count }, (_, i) => ({
          id: `p${i + 1}`,
          username: `Player_${i + 1}`,
        }));

        const baseState = NoMercyFixtureBuilder.createInitialGameFixture({
          dealerIndex: count - 1, // P1 starts
          players,
        });
        const state: GameState = {
          ...baseState,
          turnDirection: dir,
        };

        const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
        const res = NoMercyActionProcessor.process(s1, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: wrd4.id,
          chosenColor: 'red',
        });

        const expectedDirection = dir === 'clockwise' ? 'counter_clockwise' : 'clockwise';
        expect(res.nextState.turnDirection).toBe(expectedDirection);

        if (count === 2) {
          // Self-targets
          expect(res.nextState.pendingActionState?.targetPlayerId).toBe('p1');
          expect(res.nextState.currentPlayerIndex).toBe(0);
        } else {
          // Targets next active player in reversed direction
          const expectedTargetIndex = expectedDirection === 'clockwise' ? 1 : count - 1;
          expect(res.nextState.pendingActionState?.targetPlayerId).toBe(players[expectedTargetIndex].id);
          expect(res.nextState.currentPlayerIndex).toBe(expectedTargetIndex);
        }
        assertValidNoMercyGameState(res.nextState);
      }
    }
  });

  // Test 17 — Event replay and reconnection
  it('Test 17: Event replay and reconnection — Reconnection projects exact authoritative state without re-triggering penalty or reversal', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
    });

    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');
    const res = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: wrd4.id, chosenColor: 'blue' });

    // Client reconnects: getPlayerGameState is called
    const p3View = getPlayerGameState(res.nextState, 'p3');
    expect(p3View.turnDirection).toBe('counter_clockwise');
    expect(p3View.self.isTargetedByStack).toBe(true);
    expect(p3View.currentPlayerIndex).toBe(2);
    expect(p3View.pendingActionState?.accumulatedPenalty).toBe(4);

    // Call projection multiple times (simulating re-renders or multiple reconnections)
    const p3ViewAgain = getPlayerGameState(res.nextState, 'p3');
    expect(p3ViewAgain).toEqual(p3View);
  });

  // Test 18 — Final-card interactions
  it('Test 18: Final-card interactions — WRD4 played as final card empties hand and resolves round win', () => {
    let state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });

    // Reduce Alice's hand to 1 card while preserving 168 card conservation
    state = NoMercyFixtureBuilder.setHandSize(state, 'p1', 1);
    const { nextState: s1, card: wrd4 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'wild_reverse_draw_four');

    const res = NoMercyActionProcessor.process(s1, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: wrd4.id,
      chosenColor: 'red',
    });

    expect(res.nextState.status).toBe('ROUND_OVER');
    expect(res.nextState.roundWinner?.id).toBe('p1');
    expect(res.nextState.players.find((p) => p.id === 'p1')!.hand.length).toBe(0);
    assertValidNoMercyGameState(res.nextState);
  });

  // Test 19 — Ordinary Reverse regression
  it('Test 19: Ordinary Reverse regression — 2-player gives player another turn without draw penalty; 3-player reverses direction without draw penalty', () => {
    // 2-player
    const state2 = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }],
    });
    const { nextState: s2_1, card: rev2 } = NoMercyFixtureBuilder.injectPlayableCard(state2, 'p1', 'reverse', state2.activeColor ?? 'blue');
    const res2 = NoMercyActionProcessor.process(s2_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: rev2.id });
    expect(res2.nextState.currentPlayerIndex).toBe(0); // Takes another turn
    expect(res2.nextState.pendingActionState).toBeNull(); // ZERO draw penalty

    // 3-player
    const state3 = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 2,
      players: [{ id: 'p1', username: 'Alice' }, { id: 'p2', username: 'Bob' }, { id: 'p3', username: 'Charlie' }],
    });
    const { nextState: s3_1, card: rev3 } = NoMercyFixtureBuilder.injectPlayableCard(state3, 'p1', 'reverse', state3.activeColor ?? 'blue');
    const res3 = NoMercyActionProcessor.process(s3_1, { type: 'PLAY_CARD', playerId: 'p1', cardId: rev3.id });
    expect(res3.nextState.turnDirection).toBe('counter_clockwise');
    expect(res3.nextState.currentPlayerIndex).toBe(2); // Next player is Charlie
    expect(res3.nextState.pendingActionState).toBeNull(); // ZERO draw penalty
  });

  // Test 20 — Other draw-card regressions
  it('Test 20: Other draw-card regressions — Stacking sequence +2 -> +4 -> +6 -> +10 accumulates to 22 and resolves correctly', () => {
    const state = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 3,
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
        { id: 'p4', username: 'Diana' },
      ],
    });

    // 1. P1 plays +2 -> targets P2 (+2)
    const { nextState: s1, card: d2 } = NoMercyFixtureBuilder.injectPlayableCard(state, 'p1', 'draw_two', state.activeColor ?? 'blue');
    const r1 = NoMercyActionProcessor.process(s1, { type: 'PLAY_CARD', playerId: 'p1', cardId: d2.id });
    expect(r1.nextState.pendingActionState?.accumulatedPenalty).toBe(2);
    expect(r1.nextState.pendingActionState?.targetPlayerId).toBe('p2');

    // 2. P2 stacks +4 -> targets P3 (+6)
    const { nextState: s2, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(r1.nextState, 'p2', 'draw_four', r1.nextState.activeColor ?? 'blue');
    const r2 = NoMercyActionProcessor.process(s2, { type: 'PLAY_CARD', playerId: 'p2', cardId: d4.id });
    expect(r2.nextState.pendingActionState?.accumulatedPenalty).toBe(6);
    expect(r2.nextState.pendingActionState?.targetPlayerId).toBe('p3');

    // 3. P3 stacks +6 -> targets P4 (+12)
    const { nextState: s3, card: wd6 } = NoMercyFixtureBuilder.injectPlayableCard(r2.nextState, 'p3', 'wild_draw_six');
    const r3 = NoMercyActionProcessor.process(s3, { type: 'PLAY_CARD', playerId: 'p3', cardId: wd6.id, chosenColor: 'red' });
    expect(r3.nextState.pendingActionState?.accumulatedPenalty).toBe(12);
    expect(r3.nextState.pendingActionState?.targetPlayerId).toBe('p4');

    // 4. P4 stacks +10 -> targets P1 (+22)
    const { nextState: s4, card: wd10 } = NoMercyFixtureBuilder.injectPlayableCard(r3.nextState, 'p4', 'wild_draw_ten');
    const r4 = NoMercyActionProcessor.process(s4, { type: 'PLAY_CARD', playerId: 'p4', cardId: wd10.id, chosenColor: 'green' });
    expect(r4.nextState.pendingActionState?.accumulatedPenalty).toBe(22);
    expect(r4.nextState.pendingActionState?.targetPlayerId).toBe('p1');
    expect(r4.nextState.currentPlayerIndex).toBe(0);

    // 5. P1 accepts penalty: had 6 cards, draws 22 -> 28 > 25 -> Eliminated under Mercy rule!
    const r5 = NoMercyActionProcessor.process(r4.nextState, { type: 'ACCEPT_STACK_PENALTY', playerId: 'p1' });
    const alice = r5.nextState.players.find((p) => p.id === 'p1')!;
    expect(alice.isEliminated).toBe(true);
    expect(r5.nextState.eliminatedPlayerIds).toContain('p1');
    assertValidNoMercyGameState(r5.nextState);
  });
});
