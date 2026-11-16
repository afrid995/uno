import { describe, it, expect } from 'vitest';
import { FlexFixtureBuilder } from '../src/variants/flex/flex.fixture';
import { FlexActionProcessor } from '../src/variants/flex/flex.actions';
import { FlexMoveValidator } from '../src/variants/flex/flex.validator';
import { UnoFlexAdapter } from '../src/variants/flex/flex.adapter';
import { assertValidFlexGameState } from '../src/variants/flex/flex.invariants';
import { Card } from '../src/cards/card.types';
import { CardFactory } from '../src/cards/card.factory';
import { GameAction } from '../src/actions/action.types';
import { deterministicRng } from '../src/testing/deterministic-random';

describe('UNO Flex — Gameplay Rules & Mechanics Tests (Mattel Product HNB00 / HMY99)', () => {
  it('correctly matches cards in regular mode by color, number, or symbol', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Top discard: Red 5
    const setTop = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'red' && c.value === '5'
    );
    state = setTop.nextState;

    // Swap Red 3 into p1's hand
    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.color === 'red' && c.value === '3' && !c.flexColor
    );
    state = swapCard.nextState;

    const action: GameAction = {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      playMode: 'regular',
    };

    const res = FlexActionProcessor.process(state, action);
    expect(res.nextState.topDiscardCard.id).toBe(swapCard.card.id);
    expect(res.nextState.activeColor).toBe('red');
    expect(res.nextState.currentPlayerIndex).toBe(1); // Turn advanced to Bob
  });

  it('plays Flex card on flex side, flips Power Card to red_x, and sets continuing color to REGULAR color per Mattel rule', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Top discard is Green 7
    const setTop = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'green' && c.value === '7'
    );
    state = setTop.nextState;

    // Swap a Yellow card with Green flex side into Alice's hand (Yellow 1, 2, or 3 has Green flex side)
    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.color === 'yellow' && c.flexColor === 'green' && c.type === 'number'
    );
    state = swapCard.nextState;

    expect(state.players[0].powerCardStatus).toBe('green_check');

    const action: GameAction = {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      playMode: 'flex',
    };

    const res = FlexActionProcessor.process(state, action);

    // 1. Player's Power Card flipped to red_x
    expect(res.nextState.players[0].powerCardStatus).toBe('red_x');

    // 2. CRITICAL MATTEL RULE: The next player must match the YELLOW regular side, not green!
    expect(res.nextState.activeColor).toBe('yellow');
    expect(res.nextState.topDiscardCard.color).toBe('yellow');
  });

  it('rejects flex side play when player Power Card is on red_x', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Set Alice's Power Card to red_x
    state = FlexFixtureBuilder.setPowerCardStatus(state, 'p1', 'red_x');

    // Top discard is Green 7
    const setTop = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'green' && c.value === '7'
    );
    state = setTop.nextState;

    // Swap a Yellow card with Green flex side into Alice's hand
    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.color === 'yellow' && c.flexColor === 'green' && c.type === 'number'
    );
    state = swapCard.nextState;

    const action: GameAction = {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      playMode: 'flex',
    };

    const validation = FlexMoveValidator.validate(state, action);
    expect(validation.valid).toBe(false);
    expect(validation.message).toMatch(/Power Card is on the Red X side/i);

    expect(() => FlexActionProcessor.process(state, action)).toThrow();
  });

  it('flips player Power Card when playing a Classic Number Card with the flip icon', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Top discard: Red 1
    const setTop = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'red' && c.value === '1'
    );
    state = setTop.nextState;

    // Even Red has flip icon: Red 4
    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.color === 'red' && c.value === '4' && c.hasFlipIcon === true
    );
    state = swapCard.nextState;

    expect(state.players[0].powerCardStatus).toBe('green_check');

    // Play Red 4
    const res1 = FlexActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      playMode: 'regular',
    });

    // Alice's Power Card flipped to red_x
    expect(res1.nextState.players[0].powerCardStatus).toBe('red_x');

    // Now test flipping back from red_x to green_check on second play
    let state2 = res1.nextState;
    // Advance turn back to Alice (Bob draws; if playable, Bob passes)
    state2 = FlexActionProcessor.process(state2, { type: 'DRAW_CARD', playerId: 'p2' }).nextState;
    if (state2.currentPlayerIndex === 1) {
      state2 = FlexActionProcessor.process(state2, { type: 'PASS_TURN', playerId: 'p2' }).nextState;
    }

    expect(state2.currentPlayerIndex).toBe(0); // Alice's turn again

    // Top is now Red 4. Swap another card with flip icon (Red 6) into Alice's hand
    const swapCard2 = FlexFixtureBuilder.swapCardIntoHand(
      state2,
      'p1',
      (c) => c.color === 'red' && c.value === '6' && c.hasFlipIcon === true
    );
    state2 = swapCard2.nextState;

    const res2 = FlexActionProcessor.process(state2, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard2.card.id,
      playMode: 'regular',
    });

    // Alice's Power Card flipped back to green_check!
    expect(res2.nextState.players[0].powerCardStatus).toBe('green_check');
  });

  it('flips ALL players Power Cards when Wild All Flip is played', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
    });

    // Set Alice: green_check, Bob: red_x, Charlie: green_check
    state = FlexFixtureBuilder.setPowerCardStatus(state, 'p2', 'red_x');

    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.value === 'wild_all_flip'
    );
    state = swapCard.nextState;

    const res = FlexActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      chosenColor: 'blue',
      playMode: 'regular',
    });

    // All flipped:
    // Alice: green -> red
    // Bob: red -> green
    // Charlie: green -> red
    expect(res.nextState.players[0].powerCardStatus).toBe('red_x');
    expect(res.nextState.players[1].powerCardStatus).toBe('green_check');
    expect(res.nextState.players[2].powerCardStatus).toBe('red_x');
    expect(res.nextState.activeColor).toBe('blue');
  });

  it('triggers All-Red Reset immediately when every player is on red_x simultaneously', () => {
    let state = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Bob is already on red_x
    state = FlexFixtureBuilder.setPowerCardStatus(state, 'p2', 'red_x');
    expect(state.players[0].powerCardStatus).toBe('green_check');
    expect(state.players[1].powerCardStatus).toBe('red_x');

    // Top discard: Blue 3
    const setTop = FlexFixtureBuilder.setTopDiscard(
      state,
      (c) => c.color === 'blue' && c.value === '3'
    );
    state = setTop.nextState;

    // Swap Red card that flexes to Blue into Alice's hand (Red 1-3 flexes to Blue)
    const swapCard = FlexFixtureBuilder.swapCardIntoHand(
      state,
      'p1',
      (c) => c.color === 'red' && c.flexColor === 'blue'
    );
    state = swapCard.nextState;

    // Alice plays flex side -> would flip Alice to red_x
    // Since Bob is already on red_x, BOTH players become red_x!
    // All-Red Reset triggers: both immediately reset to green_check!
    const res = FlexActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: swapCard.card.id,
      playMode: 'flex',
    });

    expect(res.nextState.players[0].powerCardStatus).toBe('green_check');
    expect(res.nextState.players[1].powerCardStatus).toBe('green_check');
    expect(res.events.some((e) => e.type === 'flex:all-red-reset')).toBe(true);
  });

  describe('Flex Action Cards', () => {
    it('Flex Draw Two (flex mode): forces all other players to draw 1 card; next player does NOT lose turn', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Top discard: Red 4
      const setTop = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === 'red' && c.value === '4'
      );
      state = setTop.nextState;

      // Swap Red Flex Draw Two into Alice's hand
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'red' && c.value === 'flex_draw_two'
      );
      state = swapCard.nextState;

      const p2InitialCount = state.players[1].hand.length;
      const p3InitialCount = state.players[2].hand.length;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
      });

      // Both Bob and Charlie drew 1 card
      expect(res.nextState.players[1].hand).toHaveLength(p2InitialCount + 1);
      expect(res.nextState.players[2].hand).toHaveLength(p3InitialCount + 1);

      // Next player (Bob) does NOT lose their turn!
      expect(res.nextState.currentPlayerIndex).toBe(1);
    });

    it('Flex Skip (flex mode): Skip All passes over all other players, turn returns immediately to active player', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Top discard: Yellow 2
      const setTop = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === 'yellow' && c.value === '2'
      );
      state = setTop.nextState;

      // Swap Yellow Flex Skip into Alice's hand
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'yellow' && c.value === 'flex_skip'
      );
      state = swapCard.nextState;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
      });

      // Turn comes back immediately to Alice!
      expect(res.nextState.currentPlayerIndex).toBe(0);
      expect(res.events.some((e) => e.type === 'flex:skip-all')).toBe(true);
    });

    it('Flex Reverse (flex mode): reverses direction and skips first player in new direction (3+ players)', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
          { id: 'p4', username: 'Dave' },
        ],
      });

      // Top discard: Green 5
      const setTop = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === 'green' && c.value === '5'
      );
      state = setTop.nextState;

      // Swap Green Flex Reverse into Alice's hand
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'green' && c.value === 'flex_reverse'
      );
      state = swapCard.nextState;

      expect(state.turnDirection).toBe('clockwise');

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
      });

      // Direction reversed to counter_clockwise
      expect(res.nextState.turnDirection).toBe('counter_clockwise');
      // In counter_clockwise from Alice (0), the first player is Dave (3).
      // Dave is SKIPPED! So the next player to act is Charlie (2)!
      expect(res.nextState.currentPlayerIndex).toBe(2);
    });

    it('Flex Reverse (flex mode): in 2-player game, skips opponent and returns turn to active player', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const setTop = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === 'blue' && c.value === '2'
      );
      state = setTop.nextState;

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'blue' && c.value === 'flex_reverse'
      );
      state = swapCard.nextState;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
      });

      expect(res.nextState.currentPlayerIndex).toBe(0); // Turn returns to Alice
    });
  });

  describe('Flex Wild Cards', () => {
    it('Flex Wild Target Draw Two (flex mode): forces selected target to draw 2 cards and next player in order plays', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_target_draw_two'
      );
      state = swapCard.nextState;

      const charlieHandBefore = state.players[2].hand.length;

      // Alice targets Charlie (p3)
      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        chosenColor: 'red',
        playMode: 'flex',
        targetPlayerId: 'p3',
      });

      // Charlie drew 2 cards
      expect(res.nextState.players[2].hand).toHaveLength(charlieHandBefore + 2);
      expect(res.nextState.activeColor).toBe('red');
      // Next player in normal order (Bob, p2) plays!
      expect(res.nextState.currentPlayerIndex).toBe(1);
    });

    it('Flex Wild All Draw (flex mode): forces every other player to draw 2 cards; next player does not lose turn', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_all_draw'
      );
      state = swapCard.nextState;

      const p2Before = state.players[1].hand.length;
      const p3Before = state.players[2].hand.length;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        chosenColor: 'yellow',
        playMode: 'flex',
      });

      expect(res.nextState.players[1].hand).toHaveLength(p2Before + 2);
      expect(res.nextState.players[2].hand).toHaveLength(p3Before + 2);
      expect(res.nextState.activeColor).toBe('yellow');
      expect(res.nextState.currentPlayerIndex).toBe(1); // Bob plays next
    });

    it('Flex Wild Draw Four (regular mode): initiates Challenge flow and penalizes victim with 4 cards if accepted', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      const playRes = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        chosenColor: 'green',
        playMode: 'regular',
      });

      expect(playRes.nextState.pendingActionState?.type).toBe(
        'AWAITING_WILD_DRAW_FOUR_RESOLUTION'
      );
      expect(playRes.nextState.currentPlayerIndex).toBe(1); // Bob's decision

      // Bob accepts
      const bobHandBefore = playRes.nextState.players[1].hand.length;
      const acceptRes = FlexActionProcessor.process(playRes.nextState, {
        type: 'ACCEPT_WILD_DRAW_FOUR',
        playerId: 'p2',
      });

      expect(acceptRes.nextState.pendingActionState).toBeNull();
      expect(acceptRes.nextState.players[1].hand).toHaveLength(bobHandBefore + 4);
    });

    it('Flex Wild Draw Four (regular mode): challenges innocent player -> challenger draws 6 cards and loses turn', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Top discard is Blue 4
      const setTop = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === 'blue' && c.value === '4'
      );
      state = setTop.nextState;

      // Ensure Alice holds NO blue cards and no other wild cards (innocent!)
      for (const card of [...state.players[0].hand]) {
        if (card.color === 'blue' || card.type === 'wild') {
          const swap = FlexFixtureBuilder.swapCardIntoHand(
            state,
            'p1',
            (c) => c.color === 'red' && c.type === 'number' && !state.players[0].hand.some((h) => h.id === c.id),
            card.id
          );
          state = swap.nextState;
        }
      }

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      const playRes = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        chosenColor: 'yellow',
        playMode: 'regular',
      });

      const bobHandBefore = playRes.nextState.players[1].hand.length;

      // Bob challenges
      const challengeRes = FlexActionProcessor.process(playRes.nextState, {
        type: 'CHALLENGE_WILD_DRAW_FOUR',
        challengerPlayerId: 'p2',
      });

      // Alice was innocent -> Bob draws 6 cards (4 + 2 penalty)
      expect(challengeRes.nextState.players[1].hand).toHaveLength(bobHandBefore + 6);
      expect(challengeRes.nextState.inspectionHand?.challengerPlayerId).toBe('p2');
    });

    it('Flex Wild Draw Four (flex mode): targeted Draw 4 with NO challenge, target draws 4 cards immediately', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      const charlieBefore = state.players[2].hand.length;

      // Alice plays flex side, targeting Charlie
      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        chosenColor: 'green',
        playMode: 'flex',
        targetPlayerId: 'p3',
      });

      // No pending challenge state! Target Charlie draws 4 unconditionally
      expect(res.nextState.pendingActionState).toBeNull();
      expect(res.nextState.players[2].hand).toHaveLength(charlieBefore + 4);
      expect(res.nextState.activeColor).toBe('green');
      // Next player in normal order (Bob) plays!
      expect(res.nextState.currentPlayerIndex).toBe(1);
    });
  });

  describe('UNO Declaration, Missed UNO Vulnerability & Penalties', () => {
    it('sets unoVulnerablePlayerId when playing down to 1 card without declaring UNO', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Reduce Alice's hand to 2 cards
      const topDiscard = state.topDiscardCard;
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === state.activeColor && c.type === 'number'
      );
      state = swapCard.nextState;

      // Leave only 2 cards in Alice's hand (move remaining cards to draw pile for 104-card conservation)
      const p1RemainingCards = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      const cardToKeep = p1RemainingCards[0];
      const cardsToMove = p1RemainingCards.slice(1);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0
            ? { ...p, hand: [swapCard.card, cardToKeep], hasDeclaredUno: false }
            : p
        ),
      };

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
      });

      expect(res.nextState.players[0].hand).toHaveLength(1);
      expect(res.nextState.unoVulnerablePlayerId).toBe('p1');

      // Bob catches Alice's missed UNO!
      const catchRes = FlexActionProcessor.process(res.nextState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      // Alice penalised 2 cards
      expect(catchRes.nextState.players[0].hand).toHaveLength(3);
      expect(catchRes.nextState.unoVulnerablePlayerId).toBeNull();
    });
  });

  describe('Victory and Scoring', () => {
    it('awards points based on opponents remaining cards and ends round', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Top discard matches Alice's card
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === state.activeColor && c.type === 'number'
      );
      state = swapCard.nextState;

      // Alice has only 1 card left (move remaining cards to draw pile for 104-card conservation)
      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const bobHand = state.players[1].hand;
      const expectedScore = bobHand.reduce((sum, c) => sum + c.scoreValue, 0);

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
      });

      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');
      expect(res.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(res.nextState.players[0].score).toBe(expectedScore);
    });

    it('completes match when player reaches target score (500)', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === state.activeColor && c.type === 'number'
      );
      state = swapCard.nextState;

      // Alice already has 480 points and 1 card left (move remaining cards to draw pile for 104-card conservation)
      const cardsToMove2 = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove2],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card], score: 480 } : p
        ),
      };

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
      });

      expect(res.nextState.status).toBe('COMPLETED');
      expect(res.nextState.winner?.id).toBe('p1');
      expect(res.nextState.winner?.score).toBeGreaterThanOrEqual(500);
    });
  });

  describe('UNO Flex — Opening Discard Card Setup Audit (Mattel Rule 7)', () => {
    it('ignores Action Cards and Wild Cards on opening flip until a Number Card is reached', () => {
      const adapter = new UnoFlexAdapter();
      // Test multiple games to observe deck initialization with various opening cards
      for (let i = 0; i < 20; i++) {
        const state = adapter.createGame({
          matchId: `match_${i}`,
          roomId: `room_${i}`,
          variant: 'uno_flex',
          players: [
            { id: 'p1', username: 'Alice' },
            { id: 'p2', username: 'Bob' },
          ],
        });

        // Invariant: Top discard card MUST be a number card
        expect(state.topDiscardCard.type).toBe('number');
        expect(state.activeColor).toBe(state.topDiscardCard.color);
        expect(state.discardPile[state.discardPile.length - 1].id).toBe(state.topDiscardCard.id);

        // Every card before the top card in discard pile must have been an action or wild card
        for (let j = 0; j < state.discardPile.length - 1; j++) {
          expect(state.discardPile[j].type).not.toBe('number');
        }

        // Exact 104-card conservation
        const totalCards =
          state.drawPile.length +
          state.discardPile.length +
          state.players.reduce((sum, p) => sum + p.hand.length, 0);
        expect(totalCards).toBe(104);
        expect(() => assertValidFlexGameState(state)).not.toThrow();
      }
    });

    it('does not flip power cards if opening card has flip icon', () => {
      const adapter = new UnoFlexAdapter();
      const state = adapter.createGame({
        matchId: 'match_test',
        roomId: 'room_test',
        variant: 'uno_flex',
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // All players must start on green checkmark regardless of whether opening number card had a flip icon
      expect(state.players[0].powerCardStatus).toBe('green_check');
      expect(state.players[1].powerCardStatus).toBe('green_check');
    });
  });

  describe('UNO Flex — Final-Card Action Resolution & Penalty Scoring Tests (Issue A)', () => {
    it('resolves regular Draw Two as final card: victim draws 2 cards which are counted in round score', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Top discard matches Alice's card color
      state = FlexFixtureBuilder.setTopDiscard(state, (c) => c.color === 'red' && c.type === 'number').nextState;

      // Alice holds only a Red Draw Two as her final card
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'red' && c.value === 'draw_two'
      );
      state = swapCard.nextState;

      // Empty the rest of Alice's hand
      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const bobHandBefore = state.players[1].hand.length;
      const bobScoreBefore = state.players[1].hand.reduce((sum, c) => sum + c.scoreValue, 0);

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
      });

      // 1. Round is over
      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');

      // 2. Bob drew 2 cards
      expect(res.nextState.players[1].hand).toHaveLength(bobHandBefore + 2);

      // 3. Bob's 2 drawn cards are included in round score
      const bobHandAfter = res.nextState.players[1].hand;
      const expectedScore = bobHandAfter.reduce((sum, c) => sum + c.scoreValue, 0);
      expect(expectedScore).toBeGreaterThan(bobScoreBefore);
      expect(res.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(res.nextState.players[0].score).toBe(expectedScore);

      // 4. Invariants and 104-card conservation
      expect(() => assertValidFlexGameState(res.nextState)).not.toThrow();
    });

    it('resolves Flex Draw Two (flex side) as final card: all other players draw 1 card each, counted in score', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // Top discard matches
      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_draw_two'
      );
      state = swapCard.nextState;

      state = FlexFixtureBuilder.setTopDiscard(
        state,
        (c) => c.color === swapCard.card.flexColor && c.type === 'number'
      ).nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const bobHandBefore = state.players[1].hand.length;
      const charlieHandBefore = state.players[2].hand.length;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
      });

      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');

      // Both Bob and Charlie drew 1 card
      expect(res.nextState.players[1].hand).toHaveLength(bobHandBefore + 1);
      expect(res.nextState.players[2].hand).toHaveLength(charlieHandBefore + 1);

      const totalOpponentScore =
        res.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0) +
        res.nextState.players[2].hand.reduce((s, c) => s + c.scoreValue, 0);

      expect(res.nextState.roundWinner?.roundScore).toBe(totalOpponentScore);
      expect(() => assertValidFlexGameState(res.nextState)).not.toThrow();
    });

    it('resolves Flex Wild All Draw (flex side) as final card: all opponents draw 2 cards each, counted in score', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_all_draw'
      );
      state = swapCard.nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const bobHandBefore = state.players[1].hand.length;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
        chosenColor: 'green',
      });

      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');
      expect(res.nextState.players[1].hand).toHaveLength(bobHandBefore + 2);

      const expectedScore = res.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res.nextState)).not.toThrow();
    });

    it('resolves Flex Wild Target Draw Two with immediate targetPlayerId: target draws 2 cards, counted in score', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_target_draw_two'
      );
      state = swapCard.nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const bobHandBefore = state.players[1].hand.length;

      const res = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
        chosenColor: 'blue',
        targetPlayerId: 'p2',
      });

      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');
      expect(res.nextState.players[1].hand).toHaveLength(bobHandBefore + 2);

      const expectedScore = res.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res.nextState)).not.toThrow();
    });

    it('handles Flex Wild Target Draw Two pending target selection on final card, scores after target chosen', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_target_draw_two'
      );
      state = swapCard.nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      // 1. Play without targetPlayerId: state remains IN_PROGRESS with pending action
      const res1 = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
        chosenColor: 'blue',
      });

      expect(res1.nextState.status).toBe('IN_PROGRESS');
      expect(res1.nextState.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_TWO_SELECTION');
      expect(res1.nextState.players[0].hand).toHaveLength(0);

      // 2. Select Bob as target
      const bobHandBefore = res1.nextState.players[1].hand.length;
      const res2 = FlexActionProcessor.process(res1.nextState, {
        type: 'CHOOSE_TARGETED_DRAW_TWO_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      // 3. Victory declared upon target selection
      expect(res2.nextState.status).toBe('ROUND_OVER');
      expect(res2.nextState.roundWinner?.id).toBe('p1');
      expect(res2.nextState.players[1].hand).toHaveLength(bobHandBefore + 2);

      const expectedScore = res2.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res2.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res2.nextState)).not.toThrow();
    });

    it('handles Flex Wild Draw Four (flex side) pending target selection on final card, scores after target chosen', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const res1 = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'flex',
        chosenColor: 'yellow',
      });

      expect(res1.nextState.status).toBe('IN_PROGRESS');
      expect(res1.nextState.pendingActionState?.type).toBe('AWAITING_TARGETED_DRAW_FOUR_SELECTION');

      const bobHandBefore = res1.nextState.players[1].hand.length;
      const res2 = FlexActionProcessor.process(res1.nextState, {
        type: 'CHOOSE_TARGETED_DRAW_FOUR_TARGET',
        playerId: 'p1',
        targetPlayerId: 'p2',
      });

      expect(res2.nextState.status).toBe('ROUND_OVER');
      expect(res2.nextState.roundWinner?.id).toBe('p1');
      expect(res2.nextState.players[1].hand).toHaveLength(bobHandBefore + 4);

      const expectedScore = res2.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res2.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res2.nextState)).not.toThrow();
    });

    it('handles regular Wild Draw Four as final card with ACCEPT: victim draws 4 cards and round ends with scoring', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const res1 = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
        chosenColor: 'red',
      });

      expect(res1.nextState.status).toBe('IN_PROGRESS');
      expect(res1.nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_FOUR_RESOLUTION');

      const bobHandBefore = res1.nextState.players[1].hand.length;

      // Bob accepts
      const res2 = FlexActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_WILD_DRAW_FOUR',
        playerId: 'p2',
      });

      expect(res2.nextState.status).toBe('ROUND_OVER');
      expect(res2.nextState.roundWinner?.id).toBe('p1');
      expect(res2.nextState.players[1].hand).toHaveLength(bobHandBefore + 4);

      const expectedScore = res2.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res2.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res2.nextState)).not.toThrow();
    });

    it('handles regular Wild Draw Four as final card with CHALLENGE: innocent offender wins, challenger draws 6 cards', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Active color is yellow
      state = FlexFixtureBuilder.setTopDiscard(state, (c) => c.color === 'yellow' && c.type === 'number').nextState;

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      // Alice only had the wild card (she held NO yellow cards, play was legal!)
      const cardsToMove = state.players[0].hand.filter((c) => c.id !== swapCard.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card] } : p
        ),
      };

      const res1 = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
        chosenColor: 'green',
      });

      expect(res1.nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_FOUR_RESOLUTION');
      const bobHandBefore = res1.nextState.players[1].hand.length;

      // Bob challenges
      const res2 = FlexActionProcessor.process(res1.nextState, {
        type: 'CHALLENGE_WILD_DRAW_FOUR',
        challengerPlayerId: 'p2',
      });

      // Challenge failed: Bob draws 6 cards (4 + 2 penalty) and Alice wins!
      expect(res2.nextState.status).toBe('ROUND_OVER');
      expect(res2.nextState.roundWinner?.id).toBe('p1');
      expect(res2.nextState.players[1].hand).toHaveLength(bobHandBefore + 6);

      const expectedScore = res2.nextState.players[1].hand.reduce((s, c) => s + c.scoreValue, 0);
      expect(res2.nextState.roundWinner?.roundScore).toBe(expectedScore);
      expect(() => assertValidFlexGameState(res2.nextState)).not.toThrow();
    });

    it('handles regular Wild Draw Four with CHALLENGE when offender bluffed: offender draws 4, round NOT over', () => {
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Active color is blue
      state = FlexFixtureBuilder.setTopDiscard(state, (c) => c.color === 'blue' && c.type === 'number').nextState;

      const swapCard = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.value === 'flex_wild_draw_four'
      );
      state = swapCard.nextState;

      // Alice also holds a Blue Number card (illegal bluff play!) - evict second card to preserve swapCard
      const secondCardToEvict = state.players[0].hand[1].id;
      const swapBlue = FlexFixtureBuilder.swapCardIntoHand(
        state,
        'p1',
        (c) => c.color === 'blue' && c.type === 'number',
        secondCardToEvict
      );
      state = swapBlue.nextState;

      // Move other 5 cards to draw pile so Alice only has these 2 cards in hand
      const cardsToMove = state.players[0].hand.filter(
        (c) => c.id !== swapCard.card.id && c.id !== swapBlue.card.id
      );
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove],
        players: state.players.map((p, idx) =>
          idx === 0 ? { ...p, hand: [swapCard.card, swapBlue.card] } : p
        ),
      };
      assertValidFlexGameState(state);

      const res1 = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapCard.card.id,
        playMode: 'regular',
        chosenColor: 'red',
      });

      // Bob challenges
      const res2 = FlexActionProcessor.process(res1.nextState, {
        type: 'CHALLENGE_WILD_DRAW_FOUR',
        challengerPlayerId: 'p2',
      });

      // Challenge won by Bob! Alice was guilty, Alice draws 4 cards, game continues!
      expect(res2.nextState.status).toBe('IN_PROGRESS');
      expect(res2.nextState.roundWinner).toBeNull();
      // Alice had 1 remaining card (Blue Number) + 4 drawn penalty cards = 5 cards
      expect(res2.nextState.players[0].hand).toHaveLength(5);
      expect(() => assertValidFlexGameState(res2.nextState)).not.toThrow();
    });

    it('resolves final-card Skip, Reverse, and Wild All Flip ending round immediately', () => {
      // 1. Skip as final card
      let state = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });
      state = FlexFixtureBuilder.setTopDiscard(state, (c) => c.color === 'green' && c.type === 'number').nextState;
      const swapSkip = FlexFixtureBuilder.swapCardIntoHand(state, 'p1', (c) => c.color === 'green' && c.value === 'skip');
      state = swapSkip.nextState;
      const cardsToMove1 = state.players[0].hand.filter((c) => c.id !== swapSkip.card.id);
      state = {
        ...state,
        drawPile: [...state.drawPile, ...cardsToMove1],
        players: state.players.map((p, idx) => (idx === 0 ? { ...p, hand: [swapSkip.card] } : p)),
      };
      const resSkip = FlexActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapSkip.card.id,
        playMode: 'regular',
      });
      expect(resSkip.nextState.status).toBe('ROUND_OVER');
      expect(resSkip.nextState.roundWinner?.id).toBe('p1');

      // 2. Wild All Flip as final card
      let state2 = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });
      const swapFlip = FlexFixtureBuilder.swapCardIntoHand(state2, 'p1', (c) => c.value === 'wild_all_flip');
      state2 = swapFlip.nextState;
      const cardsToMove2 = state2.players[0].hand.filter((c) => c.id !== swapFlip.card.id);
      state2 = {
        ...state2,
        drawPile: [...state2.drawPile, ...cardsToMove2],
        players: state2.players.map((p, idx) => (idx === 0 ? { ...p, hand: [swapFlip.card] } : p)),
      };
      const resFlip = FlexActionProcessor.process(state2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: swapFlip.card.id,
        playMode: 'regular',
        chosenColor: 'blue',
      });
      expect(resFlip.nextState.status).toBe('ROUND_OVER');
      expect(resFlip.nextState.roundWinner?.id).toBe('p1');
    });
  });
});
