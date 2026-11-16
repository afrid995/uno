import { describe, it, expect } from 'vitest';
import { ActionProcessor } from '../src/actions/action.processor';
import { MoveValidator } from '../src/validation/move.validator';
import { CardFactory } from '../src/cards/card.factory';
import { GameState } from '../src/game/game.types';
import { getPlayerGameState } from '../src/projections/player-state';
import { FlipDeckFactory } from '../src/variants/flip/flip.deck';
import { FlipActionProcessor } from '../src/variants/flip/flip.actions';
import '../src/variants/flip/flip.adapter';
import { FlexFixtureBuilder } from '../src/variants/flex/flex.fixture';
import { FlexActionProcessor } from '../src/variants/flex/flex.actions';
import '../src/variants/flex/flex.adapter';
import { TeamsFixtureBuilder } from '../src/variants/teams/teams.fixture';
import { TeamsActionProcessor } from '../src/variants/teams/teams.actions';
import '../src/variants/teams/teams.adapter';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { NoMercyActionProcessor } from '../src/variants/no-mercy/no-mercy.actions';
import '../src/variants/no-mercy/no-mercy.adapter';
import '../src/variants/attack/attack.adapter';

describe('Global Card Draw Verification — Elimination of Automatic Force-Play Across All Variants', () => {
  // Helper to create basic Classic UNO state
  const createClassicState = (): GameState => {
    const cRed5 = CardFactory.createNumberCard('red', '5', 1);
    const cBlue7 = CardFactory.createNumberCard('blue', '7', 1);
    const cGreen2 = CardFactory.createNumberCard('green', '2', 1);

    return {
      id: 'm1',
      roomId: 'r1',
      variant: 'classic',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex: 2,
      targetScore: 500,
      players: [
        {
          id: 'p1',
          username: 'Alice',
          hand: [cBlue7],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
          score: 0,
        },
        {
          id: 'p2',
          username: 'Bob',
          hand: [cGreen2],
          hasDeclaredUno: false,
          hasDrawnThisTurn: false,
          drawnCardId: null,
          score: 0,
        },
      ],
      drawPile: [],
      discardPile: [cRed5],
      topDiscardCard: cRed5,
      activeColor: 'red',
      currentPlayerIndex: 0,
      turnDirection: 'clockwise',
      turnNumber: 1,
      pendingActionState: null,
      unoVulnerablePlayerId: null,
      sequenceNumber: 1,
      matchOptions: {
        cardsPerPlayer: 7,
        customRuleChaining: false,
        customRuleSevenZero: false,
        customRuleJumpIn: false,
        turnTimerSeconds: 30,
        scoreLimit: 500,
      },
    };
  };

  // Scenario 1: Case A (Playable card drawn) in Classic UNO
  it('Scenario 1: Case A (Playable card drawn) in Classic UNO — does NOT auto-play; keeps turn; allows player choice', () => {
    const state = createClassicState();
    // Top discard is red 5. Active color: red.
    // P1 holds blue 7 (unplayable).
    // Draw pile pops from end: place playable red 9 at the end of drawPile.
    const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
    state.drawPile = [playableDrawnCard];

    const result = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // 1. Card added to player's hand
    expect(nextState.players[0].hand).toHaveLength(2);
    expect(nextState.players[0].hand.some((c) => c.id === playableDrawnCard.id)).toBe(true);

    // 2. Card is NOT automatically played (discard pile still red 5)
    expect(nextState.topDiscardCard.id).toBe(state.topDiscardCard.id);
    expect(nextState.discardPile).toHaveLength(1);

    // 3. Player's turn remains active
    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBe(playableDrawnCard.id);

    // 4. Projection shows only the drawn card is playable and canPass is true
    const projection = getPlayerGameState(nextState, 'p1');
    expect(projection.self.hasDrawnThisTurn).toBe(true);
    expect(projection.self.drawnCardId).toBe(playableDrawnCard.id);
    expect(projection.self.canPass).toBe(true);
    expect(projection.self.playableCardIds).toEqual([playableDrawnCard.id]);
  });

  // Scenario 2: Case B (Unplayable card drawn) in Classic UNO
  it('Scenario 2: Case B (Unplayable card drawn) in Classic UNO — adds card and immediately ends turn', () => {
    const state = createClassicState();
    // Top discard is red 5. Active color: red.
    // Unplayable card: yellow 8.
    const unplayableDrawnCard = CardFactory.createNumberCard('yellow', '8', 20);
    state.drawPile = [unplayableDrawnCard];

    const result = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // 1. Card added to hand
    expect(nextState.players[0].hand).toHaveLength(2);
    expect(nextState.players[0].hand.some((c) => c.id === unplayableDrawnCard.id)).toBe(true);

    // 2. Discard pile unchanged
    expect(nextState.topDiscardCard.id).toBe(state.topDiscardCard.id);

    // 3. Turn ends immediately and advances to next player (Bob)
    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(false);
    expect(nextState.players[0].drawnCardId).toBeNull();
    expect(nextState.players[1].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 3: Case C (Player explicitly plays drawn card) in Classic UNO
  it('Scenario 3: Case C (Player explicitly plays drawn card) in Classic UNO — succeeds and advances turn', () => {
    const state = createClassicState();
    const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
    state.drawPile = [playableDrawnCard];

    // Step 1: Draw card (Case A)
    const drawResult = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
    const afterDrawState = drawResult.nextState;
    expect(afterDrawState.currentPlayerIndex).toBe(0);

    // Step 2: Explicitly play drawn card
    const playResult = ActionProcessor.process(afterDrawState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: playableDrawnCard.id,
    });
    const afterPlayState = playResult.nextState;

    // Card is played to discard pile
    expect(afterPlayState.topDiscardCard.id).toBe(playableDrawnCard.id);
    expect(afterPlayState.players[0].hand).toHaveLength(1);
    // Turn advances to player 2
    expect(afterPlayState.currentPlayerIndex).toBe(1);
    expect(afterPlayState.players[0].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 4: Case A + Keep/Pass in Classic UNO
  it('Scenario 4: Case A + Keep/Pass in Classic UNO — player keeps card, calls PASS_TURN, turn advances', () => {
    const state = createClassicState();
    const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
    state.drawPile = [playableDrawnCard];

    // Draw card (Case A)
    const drawResult = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
    const afterDrawState = drawResult.nextState;

    // Explicitly pass turn
    const passResult = ActionProcessor.process(afterDrawState, { type: 'PASS_TURN', playerId: 'p1' });
    const afterPassState = passResult.nextState;

    // Card remains in hand
    expect(afterPassState.players[0].hand).toHaveLength(2);
    expect(afterPassState.topDiscardCard.id).toBe(state.topDiscardCard.id);
    // Turn advances to player 2
    expect(afterPassState.currentPlayerIndex).toBe(1);
    expect(afterPassState.players[0].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 5: Case A in UNO Flip (Light side)
  it('Scenario 5: Case A in UNO Flip — playable card drawn keeps turn with player without auto-playing', () => {
    const deck = FlipDeckFactory.createFlipDeck();
    const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
    const red7 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '7')!;
    const blue2 = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '2')!;
    const yellow3 = deck.find((c) => c.lightFace.color === 'yellow' && c.lightFace.value === '3')!;

    const remainingDeck = deck.filter(
      (c) => ![red5.id, red7.id, blue2.id, yellow3.id].includes(c.id)
    );

    const flipState: GameState = {
      id: 'flip_g1',
      roomId: 'flip_r1',
      variant: 'uno_flip',
      activeSide: 'LIGHT',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex: 1,
      targetScore: 500,
      players: [
        { id: 'p1', username: 'Alice', hand: [blue2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        { id: 'p2', username: 'Bob', hand: [yellow3], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
      ],
      currentPlayerIndex: 0,
      turnDirection: 'clockwise',
      // Place red 7 at end of draw pile (will be drawn first)
      drawPile: [...remainingDeck, red7],
      discardPile: [red5],
      topDiscardCard: red5,
      activeColor: 'red',
      turnNumber: 1,
      sequenceNumber: 1,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
    };

    const result = FlipActionProcessor.process(flipState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // Card added, not auto-played, turn remains with p1
    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBe(red7.id);
    expect(nextState.topDiscardCard.id).toBe(red5.id);
  });

  // Scenario 6: Case B in UNO Flip
  it('Scenario 6: Case B in UNO Flip — unplayable card drawn immediately advances turn', () => {
    const deck = FlipDeckFactory.createFlipDeck();
    const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
    const blue9 = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '9')!;
    const green2 = deck.find((c) => c.lightFace.color === 'green' && c.lightFace.value === '2')!;
    const yellow3 = deck.find((c) => c.lightFace.color === 'yellow' && c.lightFace.value === '3')!;

    const remainingDeck = deck.filter(
      (c) => ![red5.id, blue9.id, green2.id, yellow3.id].includes(c.id)
    );

    const flipState: GameState = {
      id: 'flip_g2',
      roomId: 'flip_r2',
      variant: 'uno_flip',
      activeSide: 'LIGHT',
      status: 'IN_PROGRESS',
      roundNumber: 1,
      dealerIndex: 1,
      targetScore: 500,
      players: [
        { id: 'p1', username: 'Alice', hand: [green2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        { id: 'p2', username: 'Bob', hand: [yellow3], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
      ],
      currentPlayerIndex: 0,
      turnDirection: 'clockwise',
      // Place unplayable blue 9 at end of draw pile
      drawPile: [...remainingDeck, blue9],
      discardPile: [red5],
      topDiscardCard: red5,
      activeColor: 'red',
      turnNumber: 1,
      sequenceNumber: 1,
      unoVulnerablePlayerId: null,
      pendingActionState: null,
    };

    const result = FlipActionProcessor.process(flipState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // Card added to hand, turn immediately advanced to Bob (p2)
    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(false);
    expect(nextState.topDiscardCard.id).toBe(red5.id);
  });

  // Scenario 7: Case A in UNO Flex
  it('Scenario 7: Case A in UNO Flex — playable regular or flex card drawn keeps turn with player', () => {
    let flexState = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Set top discard to Red 5
    const setTop = FlexFixtureBuilder.setTopDiscard(
      flexState,
      (c) => c.color === 'red' && c.value === '5'
    );
    flexState = setTop.nextState;

    // Find a playable red card in draw pile and move to end
    const matchingIdx = flexState.drawPile.findIndex((c) => c.color === 'red' && c.value === '7');
    const matchingCard = flexState.drawPile[matchingIdx];
    const newDrawPile = [...flexState.drawPile];
    newDrawPile.splice(matchingIdx, 1);
    newDrawPile.push(matchingCard);
    flexState = { ...flexState, drawPile: newDrawPile };

    const result = FlexActionProcessor.process(flexState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // Not auto-played, turn remains with p1
    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBe(matchingCard.id);
  });

  // Scenario 8: Case B in UNO Flex
  it('Scenario 8: Case B in UNO Flex — unplayable card drawn immediately advances turn', () => {
    let flexState = FlexFixtureBuilder.createInitialGameFixture({
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Set top discard to Red 5
    const setTop = FlexFixtureBuilder.setTopDiscard(
      flexState,
      (c) => c.color === 'red' && c.value === '5'
    );
    flexState = setTop.nextState;

    // In UNO Flex, number cards are 1-8. Find a blue 8 that doesn't have flexColor red
    const unmatchingIdx = flexState.drawPile.findIndex(
      (c) => c.color === 'blue' && c.value === '8' && c.flexColor !== 'red'
    );
    const unmatchingCard = flexState.drawPile[unmatchingIdx];
    const newDrawPile = [...flexState.drawPile];
    newDrawPile.splice(unmatchingIdx, 1);
    newDrawPile.push(unmatchingCard);
    flexState = { ...flexState, drawPile: newDrawPile };

    const result = FlexActionProcessor.process(flexState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // Turn advances to Bob (p2)
    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 9: Case A in UNO Teams
  it('Scenario 9: Case A in UNO Teams — playable card drawn keeps turn with player without auto-playing', () => {
    let teamsState = TeamsFixtureBuilder.createInitialGameFixture();
    teamsState = TeamsFixtureBuilder.completeInitialPass(teamsState);

    // Reorder draw pile so a card matching activeColor is popped first
    const matchingIdx = teamsState.drawPile.findIndex((c) => c.color === teamsState.activeColor);
    const matchingCard = teamsState.drawPile[matchingIdx];
    const newDrawPile = [...teamsState.drawPile];
    newDrawPile.splice(matchingIdx, 1);
    newDrawPile.push(matchingCard);
    teamsState = { ...teamsState, drawPile: newDrawPile, currentPlayerIndex: 0 };

    const result = TeamsActionProcessor.process(teamsState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBe(matchingCard.id);
  });

  // Scenario 10: Case B in UNO Teams
  it('Scenario 10: Case B in UNO Teams — unplayable card drawn immediately advances turn', () => {
    let teamsState = TeamsFixtureBuilder.createInitialGameFixture();
    teamsState = TeamsFixtureBuilder.completeInitialPass(teamsState);

    // Find an unmatching card (different color, different value, not wild)
    const unmatchingIdx = teamsState.drawPile.findIndex(
      (c) =>
        c.color !== teamsState.activeColor &&
        c.value !== teamsState.topDiscardCard.value &&
        c.type !== 'wild'
    );
    const unmatchingCard = teamsState.drawPile[unmatchingIdx];
    const newDrawPile = [...teamsState.drawPile];
    newDrawPile.splice(unmatchingIdx, 1);
    newDrawPile.push(unmatchingCard);
    teamsState = { ...teamsState, drawPile: newDrawPile, currentPlayerIndex: 0 };

    const result = TeamsActionProcessor.process(teamsState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // Advanced to next player (Bob, index 1)
    expect(nextState.currentPlayerIndex).toBe(1);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 11: Case A in UNO Show 'em No Mercy
  it('Scenario 11: Case A in UNO Show \'em No Mercy — stops draw upon playable card; NO AUTO-PLAY; canPass is false; player plays explicitly', () => {
    let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
      dealerIndex: 1, // P1 (Alice) starts
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
      ],
    });

    // Make sure draw pile ends with an unplayable card followed by a standard number card (not 0 or 7 which trigger special swap effects)
    const matchingIdx = nmState.drawPile.findIndex((c) => c.color === nmState.activeColor && c.type === 'number' && c.value !== '0' && c.value !== '7');
    const matchingCard = nmState.drawPile[matchingIdx];
    const newDrawPile = [...nmState.drawPile];
    newDrawPile.splice(matchingIdx, 1);
    newDrawPile.push(matchingCard);
    nmState = { ...nmState, drawPile: newDrawPile };

    const p1InitialHandSize = nmState.players[0].hand.length;

    // P1 draws
    const result = NoMercyActionProcessor.process(nmState, { type: 'DRAW_CARD', playerId: 'p1' });
    const nextState = result.nextState;

    // 1. NO automatic play occurred! Discard pile is unchanged
    expect(nextState.topDiscardCard.id).toBe(nmState.topDiscardCard.id);

    // 2. Card remains in player's hand (hand increased)
    expect(nextState.players[0].hand.length).toBe(p1InitialHandSize + 1);
    expect(nextState.players[0].hand.some((c) => c.id === matchingCard.id)).toBe(true);

    // 3. Player's turn is active
    expect(nextState.currentPlayerIndex).toBe(0);
    expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
    expect(nextState.players[0].drawnCardId).toBe(matchingCard.id);

    // 4. canPass is false in No Mercy projection (player must play the card)
    const projection = getPlayerGameState(nextState, 'p1');
    expect(projection.self.canPass).toBe(false);
    expect(projection.self.hasDrawnThisTurn).toBe(true);
    expect(projection.self.drawnCardId).toBe(matchingCard.id);

    // 5. Player explicitly plays the drawn card
    const playResult = NoMercyActionProcessor.process(nextState, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: matchingCard.id,
    });
    const afterPlayState = playResult.nextState;

    // Discard pile is updated and turn advances to Bob
    expect(afterPlayState.topDiscardCard.id).toBe(matchingCard.id);
    expect(afterPlayState.currentPlayerIndex).toBe(1);
    expect(afterPlayState.players[0].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 12: Penalty card draws (+2, +4, +6, +10, etc.)
  it('Scenario 12: Penalty card draws — accumulates penalty, draws cards to hand, does NOT auto-play, advances turn immediately', () => {
    // Test Classic UNO Draw Two penalty:
    const state = createClassicState();
    const d2Card = CardFactory.createActionCard('red', 'draw_two', 1);
    state.players[0].hand = [d2Card];
    state.drawPile = [
      CardFactory.createNumberCard('red', '1', 101),
      CardFactory.createNumberCard('red', '2', 102),
    ];

    const initialP2HandLength = state.players[1].hand.length;

    // P1 plays Draw Two
    const { nextState } = ActionProcessor.process(state, {
      type: 'PLAY_CARD',
      playerId: 'p1',
      cardId: d2Card.id,
    });

    // P2 received 2 penalty cards into hand
    expect(nextState.players[1].hand.length).toBe(initialP2HandLength + 2);
    // P2 was skipped, neither penalty card was auto-played, and top discard remains Draw Two
    expect(nextState.topDiscardCard.id).toBe(d2Card.id);
    // P2 does not retain an active turn or drawn card play
    expect(nextState.players[1].hasDrawnThisTurn).toBe(false);
  });

  // Scenario 13: Duplicate draw attempt rejected
  it('Scenario 13: Duplicate draw attempt rejected — player who already drew in Case A cannot draw again', () => {
    const state = createClassicState();
    const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
    state.drawPile = [playableDrawnCard, CardFactory.createNumberCard('red', '8', 11)];

    // Step 1: Draw card (Case A)
    const drawResult = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
    const afterDrawState = drawResult.nextState;
    expect(afterDrawState.players[0].hasDrawnThisTurn).toBe(true);

    // Step 2: Attempting to draw again must be rejected
    const validation = MoveValidator.validate(afterDrawState, { type: 'DRAW_CARD', playerId: 'p1' });
    expect(validation.valid).toBe(false);
    if (!validation.valid) {
      expect(validation.code).toBe('ALREADY_DRAWN');
    }

    expect(() => {
      ActionProcessor.process(afterDrawState, { type: 'DRAW_CARD', playerId: 'p1' });
    }).toThrow(/ALREADY_DRAWN|already drawn/);
  });
});
