import { describe, it, expect } from 'vitest';
import { ActionProcessor } from '../src/actions/action.processor';
import { MoveValidator } from '../src/validation/move.validator';
import { CardFactory } from '../src/cards/card.factory';
import { GameState } from '../src/game/game.types';
import { getPlayerGameState } from '../src/projections/player-state';
import { FlipDeckFactory } from '../src/variants/flip/flip.deck';
import { FlipActionProcessor } from '../src/variants/flip/flip.actions';
import '../src/variants/flip/flip.adapter';
import { AllWildFixtureBuilder } from '../src/variants/all-wild/all-wild.fixture';
import { AllWildActionProcessor } from '../src/variants/all-wild/all-wild.actions';
import { AllWildMoveValidator } from '../src/variants/all-wild/all-wild.validator';
import { AllWildDeckFactory } from '../src/variants/all-wild/all-wild.deck';
import '../src/variants/all-wild/all-wild.adapter';
import { FlexFixtureBuilder } from '../src/variants/flex/flex.fixture';
import { FlexActionProcessor } from '../src/variants/flex/flex.actions';
import '../src/variants/flex/flex.adapter';
import { TeamsFixtureBuilder } from '../src/variants/teams/teams.fixture';
import { TeamsActionProcessor } from '../src/variants/teams/teams.actions';
import '../src/variants/teams/teams.adapter';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { NoMercyActionProcessor } from '../src/variants/no-mercy/no-mercy.actions';
import { NoMercyMoveValidator } from '../src/variants/no-mercy/no-mercy.validator';
import '../src/variants/no-mercy/no-mercy.adapter';
import { AttackFixtureBuilder } from '../src/variants/attack/attack.fixture';
import { AttackActionProcessor } from '../src/variants/attack/attack.actions';
import { AttackLauncher } from '../src/variants/attack/attack.launcher';
import '../src/variants/attack/attack.adapter';

describe('UNO Ultimate — Variant-Specific Draw Rules Implementation & Verification', () => {
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

  // =========================================================================
  // 1. UNO FLIP — CUSTOM RULES (OWNER SPECIFICATION)
  // =========================================================================
  describe('1. UNO Flip — Custom Rules (Owner Specification)', () => {
    it('draws exactly one card on normal draw', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
      const cardToDraw = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '9' && c.id !== red5.id)!;
      const cardRemaining = deck.find((c) => c.id !== red5.id && c.id !== cardToDraw.id)!;

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
          { id: 'p1', username: 'Alice', hand: [], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'Bob', hand: [], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: [cardRemaining, cardToDraw],
        discardPile: [red5],
        topDiscardCard: red5,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
      };

      const result = FlipActionProcessor.process(flipState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(result.nextState.players[0].hand).toHaveLength(1);
      expect(result.nextState.players[0].hand[0].id).toBe(cardToDraw.id);
      expect(result.nextState.drawPile).toHaveLength(1);
    });

    it('draws a playable card: turn remains with player, offers Play vs Keep (canPass is true), does NOT force play', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
      const playableRed7 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '7')!;
      const blue2 = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '2')!;

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
          { id: 'p1', username: 'Alice', hand: [blue2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'Bob', hand: [blue2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: [playableRed7],
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

      expect(nextState.currentPlayerIndex).toBe(0);
      expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
      expect(nextState.players[0].drawnCardId).toBe(playableRed7.id);
      expect(nextState.topDiscardCard.id).toBe(red5.id); // Not auto-played!

      const projection = getPlayerGameState(nextState, 'p1');
      expect(projection.self.canPass).toBe(true);
      expect(projection.self.playableCardIds).toEqual([playableRed7.id]);
    });

    it('draws a playable card and chooses to keep it (PASS_TURN): retains card in hand and advances turn', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
      const playableRed7 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '7')!;
      const blue2 = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '2')!;

      const flipState: GameState = {
        id: 'flip_g3',
        roomId: 'flip_r3',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 1,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'Alice', hand: [blue2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'Bob', hand: [blue2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: [playableRed7],
        discardPile: [red5],
        topDiscardCard: red5,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
      };

      const drawRes = FlipActionProcessor.process(flipState, { type: 'DRAW_CARD', playerId: 'p1' });
      const passRes = FlipActionProcessor.process(drawRes.nextState, { type: 'PASS_TURN', playerId: 'p1' });

      expect(passRes.nextState.currentPlayerIndex).toBe(1);
      expect(passRes.nextState.players[0].hand).toHaveLength(2); // Retained card
      expect(passRes.nextState.players[0].hasDrawnThisTurn).toBe(false);
      expect(passRes.nextState.topDiscardCard.id).toBe(red5.id);
    });

    it('draws an unplayable card: automatically advances turn to next player', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const red5 = deck.find((c) => c.lightFace.color === 'red' && c.lightFace.value === '5')!;
      const unplayableBlue9 = deck.find((c) => c.lightFace.color === 'blue' && c.lightFace.value === '9')!;
      const green2 = deck.find((c) => c.lightFace.color === 'green' && c.lightFace.value === '2')!;

      const flipState: GameState = {
        id: 'flip_g4',
        roomId: 'flip_r4',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 1,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'Alice', hand: [green2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'Bob', hand: [green2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: [unplayableBlue9],
        discardPile: [red5],
        topDiscardCard: red5,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
      };

      const result = FlipActionProcessor.process(flipState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(result.nextState.currentPlayerIndex).toBe(1);
      expect(result.nextState.players[0].hand).toHaveLength(2);
      expect(result.nextState.players[0].hasDrawnThisTurn).toBe(false);
    });
  });

  // =========================================================================
  // 2. UNO NO MERCY — CUSTOM RULES (OWNER SPECIFICATION)
  // =========================================================================
  describe('2. UNO Show \'em No Mercy — Custom Rules (Owner Specification)', () => {
    it('normal draw draws exactly ONE card and completely eliminates the draw-until-playable loop', () => {
      let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1, // P1 (Alice) starts
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Move an unplayable card to the end of draw pile
      const unmatchingIdx = nmState.drawPile.findIndex(
        (c) => c.color !== nmState.activeColor && c.value !== nmState.topDiscardCard.value && c.type !== 'wild'
      );
      const unmatchingCard = nmState.drawPile[unmatchingIdx];
      const newDrawPile = [...nmState.drawPile];
      newDrawPile.splice(unmatchingIdx, 1);
      newDrawPile.push(unmatchingCard);
      nmState = { ...nmState, drawPile: newDrawPile, currentPlayerIndex: 0 };

      const initialHandSize = nmState.players[0].hand.length;

      // Draw card
      const result = NoMercyActionProcessor.process(nmState, { type: 'DRAW_CARD', playerId: 'p1' });
      const nextState = result.nextState;

      // Under custom rule, exactly ONE card was drawn (not looped until playable!)
      expect(nextState.players[0].hand).toHaveLength(initialHandSize + 1);
      expect(nextState.players[0].hand.some((c) => c.id === unmatchingCard.id)).toBe(true);
      // Because unmatchingCard was unplayable, turn ended immediately and advanced to Bob
      expect(nextState.currentPlayerIndex).toBe(1);
    });

    it('draws a playable card: turn remains with player, offers Play vs Keep (canPass is true), does NOT force play', () => {
      let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Move a playable number card to the end of draw pile
      const matchingIdx = nmState.drawPile.findIndex(
        (c) => c.color === nmState.activeColor && c.type === 'number' && c.value !== '0' && c.value !== '7'
      );
      const matchingCard = nmState.drawPile[matchingIdx];
      const newDrawPile = [...nmState.drawPile];
      newDrawPile.splice(matchingIdx, 1);
      newDrawPile.push(matchingCard);
      nmState = { ...nmState, drawPile: newDrawPile, currentPlayerIndex: 0 };

      const initialTopDiscard = nmState.topDiscardCard;

      const result = NoMercyActionProcessor.process(nmState, { type: 'DRAW_CARD', playerId: 'p1' });
      const nextState = result.nextState;

      // 1. Not auto-played
      expect(nextState.topDiscardCard.id).toBe(initialTopDiscard.id);
      // 2. Turn remains on Alice
      expect(nextState.currentPlayerIndex).toBe(0);
      expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
      expect(nextState.players[0].drawnCardId).toBe(matchingCard.id);
      // 3. canPass is TRUE (owner custom rule)
      const projection = getPlayerGameState(nextState, 'p1');
      expect(projection.self.canPass).toBe(true);
      expect(projection.self.playableCardIds).toEqual([matchingCard.id]);
    });

    it('allows player to PASS_TURN after drawing a playable card (keep card decision)', () => {
      let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const matchingIdx = nmState.drawPile.findIndex(
        (c) => c.color === nmState.activeColor && c.type === 'number' && c.value !== '0' && c.value !== '7'
      );
      const matchingCard = nmState.drawPile[matchingIdx];
      const newDrawPile = [...nmState.drawPile];
      newDrawPile.splice(matchingIdx, 1);
      newDrawPile.push(matchingCard);
      nmState = { ...nmState, drawPile: newDrawPile, currentPlayerIndex: 0 };

      const initialHandSize = nmState.players[0].hand.length;

      // Draw card
      const drawRes = NoMercyActionProcessor.process(nmState, { type: 'DRAW_CARD', playerId: 'p1' });
      // Pass turn
      const passRes = NoMercyActionProcessor.process(drawRes.nextState, { type: 'PASS_TURN', playerId: 'p1' });

      expect(passRes.nextState.currentPlayerIndex).toBe(1); // Advanced to Bob
      expect(passRes.nextState.players[0].hand).toHaveLength(initialHandSize + 1); // Retained card
      expect(passRes.nextState.players[0].hasDrawnThisTurn).toBe(false);
      expect(passRes.nextState.topDiscardCard.id).toBe(nmState.topDiscardCard.id);
    });

    it('rejects playing an older card from hand during draw decision', () => {
      let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 1,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      // Ensure Alice has a matching card in hand
      const { nextState: stateWithPlayable, card: olderPlayableCard } = NoMercyFixtureBuilder.swapCardIntoHand(
        nmState,
        'p1',
        (c) => c.color === nmState.activeColor && c.type === 'number' && c.value !== '0' && c.value !== '7'
      );

      // Now place another playable card at the end of draw pile
      const matchingIdx = stateWithPlayable.drawPile.findIndex(
        (c) => c.color === stateWithPlayable.activeColor && c.type === 'number' && c.id !== olderPlayableCard.id
      );
      const matchingCard = stateWithPlayable.drawPile[matchingIdx];
      const newDrawPile = [...stateWithPlayable.drawPile];
      newDrawPile.splice(matchingIdx, 1);
      newDrawPile.push(matchingCard);
      const preparedState = { ...stateWithPlayable, drawPile: newDrawPile, currentPlayerIndex: 0 };

      const drawRes = NoMercyActionProcessor.process(preparedState, { type: 'DRAW_CARD', playerId: 'p1' });

      // Alice tries to play the older card instead of the drawn card
      const validation = NoMercyMoveValidator.validate(drawRes.nextState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: olderPlayableCard.id,
      });

      expect(validation.valid).toBe(false);
      if (!validation.valid) {
        expect(validation.code).toBe('INVALID_CARD_MATCH');
      }

      expect(() => {
        NoMercyActionProcessor.process(drawRes.nextState, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: olderPlayableCard.id,
        });
      }).toThrow(/INVALID_CARD_MATCH|only play the card that was just drawn/);
    });

    it('preserves No Mercy stacking and special-card mechanics unchanged', () => {
      let nmState = NoMercyFixtureBuilder.createInitialGameFixture({
        dealerIndex: 2,
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
          { id: 'p3', username: 'Charlie' },
        ],
      });

      // P1 plays Draw 4
      const { nextState: s1, card: d4 } = NoMercyFixtureBuilder.injectPlayableCard(
        nmState,
        'p1',
        'draw_four',
        nmState.activeColor ?? 'blue'
      );
      const res1 = NoMercyActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d4.id,
      });

      expect(res1.nextState.pendingActionState).toEqual({
        type: 'AWAITING_STACK_RESOLUTION',
        targetPlayerId: 'p2',
        playedByPlayerId: 'p1',
        accumulatedPenalty: 4,
        lastStackedValue: 4,
        lastCardValue: 'draw_four',
      });

      // Bob accepts stack penalty
      const bobInitialHandSize = res1.nextState.players[1].hand.length;
      const res2 = NoMercyActionProcessor.process(res1.nextState, {
        type: 'ACCEPT_STACK_PENALTY',
        playerId: 'p2',
      });

      expect(res2.nextState.players[1].hand.length).toBe(bobInitialHandSize + 4);
      expect(res2.nextState.pendingActionState).toBeNull();
      // Turn skips Bob, advances to Charlie
      expect(res2.nextState.currentPlayerIndex).toBe(2);
    });
  });

  // =========================================================================
  // 3. CLASSIC UNO — OFFICIAL MATTEL RULES (MATTEL 42001)
  // =========================================================================
  describe('3. Classic UNO — Official Mattel 42001 Rules', () => {
    it('draws 1 card; if playable, player may play it or keep/pass; turn remains active', () => {
      const state = createClassicState();
      const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
      state.drawPile = [playableDrawnCard];

      const result = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const nextState = result.nextState;

      expect(nextState.players[0].hand).toHaveLength(2);
      expect(nextState.topDiscardCard.id).toBe(state.topDiscardCard.id); // Not auto-played
      expect(nextState.currentPlayerIndex).toBe(0);
      expect(nextState.players[0].hasDrawnThisTurn).toBe(true);
      expect(nextState.players[0].drawnCardId).toBe(playableDrawnCard.id);
    });

    it('draws an unplayable card: adds to hand and immediately ends turn per official rules', () => {
      const state = createClassicState();
      const unplayableDrawnCard = CardFactory.createNumberCard('yellow', '8', 20);
      state.drawPile = [unplayableDrawnCard];

      const result = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const nextState = result.nextState;

      expect(nextState.players[0].hand).toHaveLength(2);
      expect(nextState.currentPlayerIndex).toBe(1); // Turn passed to Bob
      expect(nextState.players[0].hasDrawnThisTurn).toBe(false);
    });

    it('player explicitly plays drawn card, card is discarded and turn advances', () => {
      const state = createClassicState();
      const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
      state.drawPile = [playableDrawnCard];

      const drawResult = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const playResult = ActionProcessor.process(drawResult.nextState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: playableDrawnCard.id,
      });

      expect(playResult.nextState.topDiscardCard.id).toBe(playableDrawnCard.id);
      expect(playResult.nextState.currentPlayerIndex).toBe(1);
    });

    it('penalty draws (+2) force next player to draw 2 cards and skip their turn', () => {
      const state = createClassicState();
      const d2Card = CardFactory.createActionCard('red', 'draw_two', 1);
      state.players[0].hand = [d2Card];
      state.drawPile = [
        CardFactory.createNumberCard('red', '1', 101),
        CardFactory.createNumberCard('red', '2', 102),
      ];

      const initialP2HandLength = state.players[1].hand.length;

      const { nextState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: d2Card.id,
      });

      expect(nextState.players[1].hand.length).toBe(initialP2HandLength + 2);
      expect(nextState.topDiscardCard.id).toBe(d2Card.id);
      expect(nextState.players[1].hasDrawnThisTurn).toBe(false);
    });
  });

  // =========================================================================
  // 4. UNO ALL WILD — OFFICIAL MATTEL RULES (MATTEL HHL33)
  // =========================================================================
  describe('4. UNO All Wild — Official Mattel HHL33 Rules', () => {
    it('draws 1 wild card; player may play it or pass turn per HHL33', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({ dealerIndex: 1 });
      const topDrawnCard = state.drawPile[state.drawPile.length - 1];

      // Draw card
      const drawRes = AllWildActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(drawRes.nextState.currentPlayerIndex).toBe(0);
      expect(drawRes.nextState.players[0].hasDrawnThisTurn).toBe(true);
      expect(drawRes.nextState.players[0].drawnCardId).toBe(topDrawnCard.id);

      // Pass turn
      const passRes = AllWildActionProcessor.process(drawRes.nextState, { type: 'PASS_TURN', playerId: 'p1' });
      expect(passRes.nextState.currentPlayerIndex).toBe(1);
      expect(passRes.nextState.players[0].hasDrawnThisTurn).toBe(false);
    });

    it('rejects playing older card from hand after drawing in All Wild', () => {
      const state = AllWildFixtureBuilder.createInitialGameFixture({ dealerIndex: 1 });
      const olderCard = state.players[0].hand[0];

      const drawRes = AllWildActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });

      const validation = AllWildMoveValidator.validate(drawRes.nextState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: olderCard.id,
      });

      expect(validation.valid).toBe(false);
      if (!validation.valid) {
        expect(validation.code).toBe('INVALID_CARD_MATCH');
      }
    });
  });

  // =========================================================================
  // 5. UNO FLEX — OFFICIAL MATTEL RULES (MATTEL HNB00 / HMY99)
  // =========================================================================
  describe('5. UNO Flex — Official Mattel HNB00 Rules', () => {
    it('draws 1 card; if regular or flex match with green check, keeps turn and allows choice', () => {
      let flexState = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const setTop = FlexFixtureBuilder.setTopDiscard(
        flexState,
        (c) => c.color === 'red' && c.value === '5'
      );
      flexState = setTop.nextState;

      const matchingIdx = flexState.drawPile.findIndex((c) => c.color === 'red' && c.value === '7');
      const matchingCard = flexState.drawPile[matchingIdx];
      const newDrawPile = [...flexState.drawPile];
      newDrawPile.splice(matchingIdx, 1);
      newDrawPile.push(matchingCard);
      flexState = { ...flexState, drawPile: newDrawPile };

      const result = FlexActionProcessor.process(flexState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(result.nextState.currentPlayerIndex).toBe(0);
      expect(result.nextState.players[0].hasDrawnThisTurn).toBe(true);
      expect(result.nextState.players[0].drawnCardId).toBe(matchingCard.id);
    });

    it('draws an unplayable card: immediately ends turn and advances to next player', () => {
      let flexState = FlexFixtureBuilder.createInitialGameFixture({
        players: [
          { id: 'p1', username: 'Alice' },
          { id: 'p2', username: 'Bob' },
        ],
      });

      const setTop = FlexFixtureBuilder.setTopDiscard(
        flexState,
        (c) => c.color === 'red' && c.value === '5'
      );
      flexState = setTop.nextState;

      const unmatchingIdx = flexState.drawPile.findIndex(
        (c) => c.color === 'blue' && c.value === '8' && c.flexColor !== 'red'
      );
      const unmatchingCard = flexState.drawPile[unmatchingIdx];
      const newDrawPile = [...flexState.drawPile];
      newDrawPile.splice(unmatchingIdx, 1);
      newDrawPile.push(unmatchingCard);
      flexState = { ...flexState, drawPile: newDrawPile };

      const result = FlexActionProcessor.process(flexState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(result.nextState.currentPlayerIndex).toBe(1);
      expect(result.nextState.players[0].hasDrawnThisTurn).toBe(false);
    });
  });

  // =========================================================================
  // 6. UNO TEAMS — OFFICIAL MATTEL RULES (MATTEL HXT58 / JDM40)
  // =========================================================================
  describe('6. UNO Teams — Official Mattel HXT58 Rules', () => {
    it('draws 1 card; if playable, keeps turn and allows choice; if unplayable, advances turn', () => {
      let teamsState = TeamsFixtureBuilder.createInitialGameFixture();
      teamsState = TeamsFixtureBuilder.completeInitialPass(teamsState);

      const matchingIdx = teamsState.drawPile.findIndex((c) => c.color === teamsState.activeColor);
      const matchingCard = teamsState.drawPile[matchingIdx];
      const newDrawPile = [...teamsState.drawPile];
      newDrawPile.splice(matchingIdx, 1);
      newDrawPile.push(matchingCard);
      teamsState = { ...teamsState, drawPile: newDrawPile, currentPlayerIndex: 0 };

      // Case A: Playable
      const resA = TeamsActionProcessor.process(teamsState, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(resA.nextState.currentPlayerIndex).toBe(0);
      expect(resA.nextState.players[0].hasDrawnThisTurn).toBe(true);

      // Case B: Unplayable
      const unmatchingIdx = teamsState.drawPile.findIndex(
        (c) =>
          c.color !== teamsState.activeColor &&
          c.value !== teamsState.topDiscardCard.value &&
          c.type !== 'wild'
      );
      const unmatchingCard = teamsState.drawPile[unmatchingIdx];
      const newDrawPileB = [...teamsState.drawPile];
      newDrawPileB.splice(unmatchingIdx, 1);
      newDrawPileB.push(unmatchingCard);
      const teamsStateB = { ...teamsState, drawPile: newDrawPileB, currentPlayerIndex: 0 };

      const resB = TeamsActionProcessor.process(teamsStateB, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(resB.nextState.currentPlayerIndex).toBe(1);
      expect(resB.nextState.players[0].hasDrawnThisTurn).toBe(false);
    });
  });

  // =========================================================================
  // 7. UNO ATTACK — OFFICIAL MATTEL RULES (MATTEL GTX66)
  // =========================================================================
  describe('7. UNO Attack — Official Mattel GTX66 Rules', () => {
    it('pressing launcher with 0 cards launched: turn ends immediately', () => {
      let attackState = AttackFixtureBuilder.createInitialGameFixture(2);
      attackState = {
        ...attackState,
        currentPlayerIndex: 0,
        pendingActionState: null,
        activeColor: attackState.activeColor || 'red',
      };

      AttackLauncher.setDeterministicOverride(0);
      try {
        const result = AttackActionProcessor.process(
          attackState,
          { type: 'DRAW_CARD', playerId: 'p1' }
        );

        expect(result.nextState.currentPlayerIndex).toBe(1);
        expect(result.nextState.players[0].hasDrawnThisTurn).toBe(false);
      } finally {
        AttackLauncher.setDeterministicOverride(null);
      }
    });

    it('pressing launcher with 1+ cards launched: cards added to hand, TURN ENDS IMMEDIATELY, cards cannot be played', () => {
      let attackState = AttackFixtureBuilder.createInitialGameFixture(2);
      attackState = {
        ...attackState,
        currentPlayerIndex: 0,
        pendingActionState: null,
        activeColor: attackState.activeColor || 'red',
      };
      const initialHandCount = attackState.players[0].hand.length;

      AttackLauncher.setDeterministicOverride(3);
      try {
        const result = AttackActionProcessor.process(
          attackState,
          { type: 'DRAW_CARD', playerId: 'p1' }
        );

        // Exactly 3 cards added to hand
        expect(result.nextState.players[0].hand.length).toBe(initialHandCount + 3);
        // Per Mattel GTX66, turn ends immediately and player may NOT play any launched card!
        expect(result.nextState.currentPlayerIndex).toBe(1);
        expect(result.nextState.players[0].hasDrawnThisTurn).toBe(false);
      } finally {
        AttackLauncher.setDeterministicOverride(null);
      }
    });
  });

  // =========================================================================
  // 8. SHARED REGRESSION & INTEGRITY TESTS
  // =========================================================================
  describe('8. Shared Regression & Integrity Tests', () => {
    it('rejects duplicate draw attempts within the same turn', () => {
      const state = createClassicState();
      const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
      state.drawPile = [playableDrawnCard, CardFactory.createNumberCard('red', '8', 11)];

      const drawResult = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      const validation = MoveValidator.validate(drawResult.nextState, { type: 'DRAW_CARD', playerId: 'p1' });

      expect(validation.valid).toBe(false);
      if (!validation.valid) {
        expect(validation.code).toBe('ALREADY_DRAWN');
      }
    });

    it('rejects passing when the player has not drawn a card', () => {
      const state = createClassicState();
      const validation = MoveValidator.validate(state, { type: 'PASS_TURN', playerId: 'p1' });

      expect(validation.valid).toBe(false);
      if (!validation.valid) {
        expect(validation.code).toBe('INVALID_PASS');
      }
    });

    it('draw-state fields reset cleanly across turn completions and round transitions', () => {
      const state = createClassicState();
      const playableDrawnCard = CardFactory.createNumberCard('red', '9', 10);
      state.drawPile = [playableDrawnCard];

      // Draw (Case A)
      const drawRes = ActionProcessor.process(state, { type: 'DRAW_CARD', playerId: 'p1' });
      expect(drawRes.nextState.players[0].hasDrawnThisTurn).toBe(true);

      // Play card
      const playRes = ActionProcessor.process(drawRes.nextState, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: playableDrawnCard.id,
      });

      // Reset
      expect(playRes.nextState.players[0].hasDrawnThisTurn).toBe(false);
      expect(playRes.nextState.players[0].drawnCardId).toBeNull();
      expect(playRes.nextState.players[1].hasDrawnThisTurn).toBe(false);
      expect(playRes.nextState.players[1].drawnCardId).toBeNull();
    });
  });
});
