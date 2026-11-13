import { describe, it, expect } from 'vitest';
import { FlipDealerSelector } from '../src/variants/flip/flip.dealer';
import { FlipDeckFactory } from '../src/variants/flip/flip.deck';
import { FlipMoveValidator } from '../src/variants/flip/flip.validator';
import { FlipActionProcessor } from '../src/variants/flip/flip.actions';
import { UnoFlipAdapter } from '../src/variants/flip/flip.adapter';
import { VariantRegistry } from '../src/variants/variant.types';
import '../src/variants/classic/classic.adapter';
import '../src/variants/flip/flip.adapter';
import { GameFactory } from '../src/game/game.factory';
import { ActionProcessor } from '../src/actions/action.processor';
import { MoveValidator } from '../src/validation/move.validator';
import { Card, CardColor, PhysicalFlipCard } from '../src/cards/card.types';
import { GameConfig, GameState } from '../src/game/game.types';
import { RandomNumberGenerator } from '../src/deck/deck.shuffle';

/**
 * Deterministically constructs an RNG that places a specific card matching the predicate
 * directly onto the top of the initial discard pile after dealing 7 cards to each player.
 */
function createSeededRngForStartingCard(
  predicate: (c: Card) => boolean,
  playerCount: number = 3,
  cardsPerHand: number = 7
): RandomNumberGenerator {
  const initialDeck = FlipDeckFactory.createFlipDeck();
  const sourceIndex = initialDeck.findIndex(predicate);
  if (sourceIndex === -1) {
    throw new Error('Predicate did not match any card in initial flip deck');
  }

  const targetPos = 112 - playerCount * cardsPerHand - 1;
  let callCount = 0;

  return (): number => {
    callCount++;
    const i = 112 - callCount;

    if (i > 0) {
      if (sourceIndex > targetPos) {
        if (i > sourceIndex) return 0.999999999;
        if (i === sourceIndex) return 0; // swap sourceIndex with index 0
        if (i > targetPos) return 0.999999999;
        if (i === targetPos) return 0; // swap index 0 with targetPos
        return 0.999999999;
      } else {
        if (i > targetPos) return 0.999999999;
        if (i === targetPos) return sourceIndex / (targetPos + 1); // swap sourceIndex with targetPos
        return 0.999999999;
      }
    }

    return 0.5;
  };
}

describe('UNO Flip Official Mattel GDR44 Rules', () => {
  // --- SECTION 1: DEALER SELECTION (GDR44) ---
  describe('Dealer Selection (Mattel GDR44)', () => {
    it('evaluates number cards 1-9 as face value and symbols as zero', () => {
      const numCard: Card = {
        id: 'c1',
        color: 'blue',
        value: '7',
        type: 'number',
        scoreValue: 7,
        lightFace: { color: 'blue', value: '7', type: 'number', scoreValue: 7 },
        darkFace: { color: 'pink', value: '7', type: 'number', scoreValue: 7 },
      };
      expect(FlipDealerSelector.getDealerScoreForCard(numCard)).toBe(7);

      const actionCard: Card = {
        id: 'c2',
        color: 'red',
        value: 'draw_one',
        type: 'action',
        scoreValue: 10,
        lightFace: { color: 'red', value: 'draw_one', type: 'action', scoreValue: 10 },
        darkFace: { color: 'teal', value: 'draw_five', type: 'action', scoreValue: 20 },
      };
      // In GDR44 setup: symbols count as ZERO
      expect(FlipDealerSelector.getDealerScoreForCard(actionCard)).toBe(0);

      const wildCard: Card = {
        id: 'c3',
        color: null,
        value: 'wild',
        type: 'wild',
        scoreValue: 40,
        lightFace: { color: null, value: 'wild', type: 'wild', scoreValue: 40 },
        darkFace: { color: null, value: 'wild', type: 'wild', scoreValue: 40 },
      };
      expect(FlipDealerSelector.getDealerScoreForCard(wildCard)).toBe(0);
    });

    it('resolves ties via candidate redraws with deterministic fallback ceiling', () => {
      // RNG that preserves deck order so candidates repeatedly draw symbol cards scoring 0
      const tieRng = () => 0.999;
      const result = FlipDealerSelector.determineDealerDetailed(3, tieRng, 3);

      expect(result.tieRounds).toBe(3);
      expect(result.resolvedByFallback).toBe(true);
      expect(result.dealerIndex).toBe(0); // lowest candidate index fallback
    });
  });

  // --- SECTION 2: OPENING CARD RULES (GDR44) ---
  describe('Opening Starting Card Effects (Deterministic GDR44)', () => {
    const createConfig = (playerCount: 2 | 3 | 4, dealerIndex: number = 0): GameConfig => ({
      roomId: 'room_flip_test',
      players: Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i + 1}`,
        username: `Player ${i + 1}`,
      })),
      variant: 'uno_flip',
      dealerIndex,
    });

    it('handles starting Reverse: dealer plays first counter-clockwise across 2, 3, and 4 players', () => {
      const adapter = VariantRegistry.get('uno_flip');

      // 2 Players: dealer is index 0. Counter-clockwise with 2 players means dealer plays, then player 1.
      const rng2 = createSeededRngForStartingCard((c) => c.lightFace.value === 'reverse', 2);
      const state2 = adapter.createGame(createConfig(2, 0), rng2);
      expect(state2.topDiscardCard.value).toBe('reverse');
      expect(state2.turnDirection).toBe('counter_clockwise');
      expect(state2.currentPlayerIndex).toBe(0); // Dealer plays first!
      expect(state2.activeSide).toBe('LIGHT');

      // 3 Players: dealer is index 0. Play moves counter-clockwise: next player after dealer is index 2!
      const rng3 = createSeededRngForStartingCard((c) => c.lightFace.value === 'reverse', 3);
      const state3 = adapter.createGame(createConfig(3, 0), rng3);
      expect(state3.topDiscardCard.value).toBe('reverse');
      expect(state3.turnDirection).toBe('counter_clockwise');
      expect(state3.currentPlayerIndex).toBe(0); // Dealer plays first!

      // 4 Players: dealer is index 1. Next player after dealer is index 0 ((1 - 1 + 4) % 4 = 0)
      const rng4 = createSeededRngForStartingCard((c) => c.lightFace.value === 'reverse', 4);
      const state4 = adapter.createGame(createConfig(4, 1), rng4);
      expect(state4.topDiscardCard.value).toBe('reverse');
      expect(state4.turnDirection).toBe('counter_clockwise');
      expect(state4.currentPlayerIndex).toBe(1); // Dealer plays first!
    });

    it('handles starting Reverse in subsequent rounds via startNextRound', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const baseRng = createSeededRngForStartingCard((c) => c.lightFace.value === '7', 3);
      const round1State = adapter.createGame(createConfig(3, 0), baseRng);

      // Finish round 1
      const endedState: GameState = {
        ...round1State,
        status: 'ROUND_OVER',
        roundWinner: 'p1',
      };

      // Start round 2 with deterministic Reverse
      const rngRevRound2 = createSeededRngForStartingCard((c) => c.lightFace.value === 'reverse', 3);
      const round2State = adapter.startNextRound(endedState, rngRevRound2);

      expect(round2State.roundNumber).toBe(2);
      expect(round2State.topDiscardCard.value).toBe('reverse');
      expect(round2State.turnDirection).toBe('counter_clockwise');
      // Dealer rotates to (0 + 1) % 3 = 1
      expect(round2State.dealerIndex).toBe(1);
      expect(round2State.currentPlayerIndex).toBe(1); // Dealer plays first in UNO Flip!
    });

    it('handles starting Draw One: player to dealer left draws 1 and loses turn', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'draw_one', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      expect(state.topDiscardCard.value).toBe('draw_one');
      expect(state.activeSide).toBe('LIGHT');
      // Dealer is p1 (index 0). Left of dealer is p2 (index 1).
      // p2 draws 1 card (7 + 1 = 8) and loses turn!
      expect(state.players[1].hand.length).toBe(8);
      expect(state.players[0].hand.length).toBe(7);
      expect(state.players[2].hand.length).toBe(7);
      // Play skips p2 and moves to p3 (index 2)
      expect(state.currentPlayerIndex).toBe(2);

      // Total cards conserved = 112
      const totalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;
      expect(totalCards).toBe(112);
    });

    it('handles starting Skip: player to dealer left is skipped', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'skip', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      expect(state.topDiscardCard.value).toBe('skip');
      expect(state.activeSide).toBe('LIGHT');
      // Player to dealer left (p2, index 1) is skipped. Next player (p3, index 2) starts!
      expect(state.currentPlayerIndex).toBe(2);
      expect(state.players[0].hand.length).toBe(7);
      expect(state.players[1].hand.length).toBe(7);
      expect(state.players[2].hand.length).toBe(7);
    });

    it('handles starting Flip: active side flips to DARK immediately and hands are Dark', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'flip', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      expect(state.activeSide).toBe('DARK');
      // Discard pile top card is Dark Face
      expect(state.topDiscardCard.color).not.toBeNull();
      // All player hands must reflect DARK faces
      for (const player of state.players) {
        expect(player.hand).toHaveLength(7);
        for (const card of player.hand) {
          expect(card.color).toBe(card.darkFace.color);
          expect(card.value).toBe(card.darkFace.value);
        }
      }
    });

    it('handles starting Wild Draw Two: reshuffled back into deck per GDR44', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild_draw_two', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      // Per GDR44, Wild Draw Two is NEVER allowed to remain top discard card. It must be reshuffled.
      expect(state.topDiscardCard.value).not.toBe('wild_draw_two');
      // Total cards conserved = 112
      const totalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;
      expect(totalCards).toBe(112);
    });
  });

  // --- SECTION 2.5: STARTING WILD COLOR SELECTION (GDR44 / FIX B) ---
  describe('Starting Wild Color Selection (Mattel GDR44)', () => {
    const createConfig = (playerCount: 2 | 3 | 4, dealerIndex: number = 0): GameConfig => ({
      roomId: 'room_flip_wild_test',
      players: Array.from({ length: playerCount }, (_, i) => ({
        id: `p${i + 1}`,
        username: `Player ${i + 1}`,
      })),
      variant: 'uno_flip',
      dealerIndex,
    });

    it('initiates starting Wild state: activeColor null, pending selection for player to dealer left', () => {
      const adapter = VariantRegistry.get('uno_flip');

      // 3 Players, dealer 0 (p1). Player to left is p2 (index 1).
      const rng3 = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const state3 = adapter.createGame(createConfig(3, 0), rng3);

      expect(state3.topDiscardCard.value).toBe('wild');
      expect(state3.activeColor).toBeNull();
      expect(state3.pendingActionState).toEqual({
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: 'p2',
      });
      expect(state3.currentPlayerIndex).toBe(1); // p2 will play the first card once color is chosen
    });

    it('blocks normal card play and drawing while starting Wild color selection is pending', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      // Attempting to play a card before choosing starting color must fail
      const cardToPlay = state.players[1].hand[0];
      const playValidation = adapter.validateMove(state, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: cardToPlay.id,
      });
      expect(playValidation.valid).toBe(false);
      if (!playValidation.valid) {
        expect(playValidation.code).toBe('PENDING_ACTION_REQUIRED');
      }

      // Attempting to draw a card before choosing starting color must fail
      const drawValidation = adapter.validateMove(state, {
        type: 'DRAW_CARD',
        playerId: 'p2',
      });
      expect(drawValidation.valid).toBe(false);
      if (!drawValidation.valid) {
        expect(drawValidation.code).toBe('PENDING_ACTION_REQUIRED');
      }
    });

    it('rejects color choice from unauthorized players', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      // Dealer (p1) is NOT authorized; only p2 (to dealer left) is authorized
      const unauthorizedValidation = adapter.validateMove(state, {
        type: 'CHOOSE_STARTING_WILD_COLOR',
        playerId: 'p1',
        chosenColor: 'blue',
      });
      expect(unauthorizedValidation.valid).toBe(false);
      if (!unauthorizedValidation.valid) {
        expect(unauthorizedValidation.code).toBe('UNAUTHORIZED_CHOOSER');
      }
    });

    it('rejects invalid colors (non-Light colors or null)', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      // Pink is a Dark Side color, not valid on Light Side
      const invalidValidation = adapter.validateMove(state, {
        type: 'CHOOSE_STARTING_WILD_COLOR',
        playerId: 'p2',
        chosenColor: 'pink' as CardColor,
      });
      expect(invalidValidation.valid).toBe(false);
      if (!invalidValidation.valid) {
        expect(invalidValidation.code).toBe('INVALID_CHOSEN_COLOR');
      }
    });

    it('accepts valid Light color, unblocks play, and preserves designated player turn', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const rng = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const state = adapter.createGame(createConfig(3, 0), rng);

      const action = {
        type: 'CHOOSE_STARTING_WILD_COLOR' as const,
        playerId: 'p2',
        chosenColor: 'blue' as CardColor,
      };

      const validation = adapter.validateMove(state, action);
      expect(validation.valid).toBe(true);

      const result = adapter.processAction(state, action);
      expect(result.nextState.activeColor).toBe('blue');
      expect(result.nextState.pendingActionState).toBeNull();
      // Designated player (p2) is still the current player to play the first card!
      expect(result.nextState.currentPlayerIndex).toBe(1);
      expect(result.events.some((e) => e.type === 'STARTING_WILD_COLOR_CHOSEN')).toBe(true);
    });

    it('supports starting Wild color selection across subsequent rounds via startNextRound', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const baseRng = createSeededRngForStartingCard((c) => c.lightFace.value === '7', 3);
      const round1 = adapter.createGame(createConfig(3, 0), baseRng);

      const endedRound1: GameState = {
        ...round1,
        status: 'ROUND_OVER',
        roundWinner: 'p1',
      };

      // Round 2: dealer rotates to index 1 (p2). Player to left is index 2 (p3).
      const rngWildRound2 = createSeededRngForStartingCard((c) => c.lightFace.value === 'wild', 3);
      const round2 = adapter.startNextRound(endedRound1, rngWildRound2);

      expect(round2.roundNumber).toBe(2);
      expect(round2.topDiscardCard.value).toBe('wild');
      expect(round2.activeColor).toBeNull();
      expect(round2.pendingActionState).toEqual({
        type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
        designatedPlayerId: 'p3',
      });
      expect(round2.currentPlayerIndex).toBe(2);
    });
  });

  // --- SECTION 3: FLIP CARD MECHANIC ---
  describe('Flip Card Mechanic', () => {
    it('executes atomic flip transition: flips discard pile, draw pile, hands and activeSide', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const flipCard = deck.find((c) => c.lightFace.value === 'flip' && c.lightFace.color === 'blue')!;
      const blueSeven = deck.find((c) => c.lightFace.value === '7' && c.lightFace.color === 'blue')!;
      const yellowFive = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'yellow')!;

      // Setup state on LIGHT side
      const state: GameState = {
        id: 'game_flip_test',
        roomId: 'room_1',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          {
            id: 'p1',
            username: 'Alice',
            hand: [flipCard],
            hasDeclaredUno: false,
            hasDrawnThisTurn: false,
            drawnCardId: null,
            score: 0,
          },
          {
            id: 'p2',
            username: 'Bob',
            hand: [yellowFive],
            hasDeclaredUno: false,
            hasDrawnThisTurn: false,
            drawnCardId: null,
            score: 0,
          },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.filter((c) => c.id !== flipCard.id && c.id !== blueSeven.id && c.id !== yellowFive.id),
        discardPile: [blueSeven],
        topDiscardCard: blueSeven,
        activeColor: 'blue',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Play the flip card
      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: flipCard.id,
      });

      const nextState = result.nextState;

      // 1. Active side flipped to DARK
      expect(nextState.activeSide).toBe('DARK');

      // 2. Discard pile: flipCard is at the bottom, blueSeven (flipped to dark) is top!
      expect(nextState.discardPile).toHaveLength(2);
      expect(nextState.discardPile[0].id).toBe(flipCard.id);
      expect(nextState.discardPile[0].currentSide).toBe('DARK');
      expect(nextState.discardPile[1].id).toBe(blueSeven.id);
      expect(nextState.discardPile[1].currentSide).toBe('DARK');
      expect(nextState.topDiscardCard.id).toBe(blueSeven.id);
      expect(nextState.topDiscardCard.currentSide).toBe('DARK');
      expect(nextState.activeColor).toBe(blueSeven.darkFace!.color);

      // 3. Hands are flipped to DARK
      expect(nextState.players[1].hand[0].currentSide).toBe('DARK');
      expect(nextState.players[1].hand[0].color).toBe(yellowFive.darkFace!.color);

      // 4. Draw pile is flipped to DARK
      expect(nextState.drawPile.every((c) => c.currentSide === 'DARK')).toBe(true);

      // 5. Total card conservation: 112 cards
      const total =
        nextState.players.reduce((sum, p) => sum + p.hand.length, 0) +
        nextState.drawPile.length +
        nextState.discardPile.length;
      expect(total).toBe(112);
    });
  });

  // --- SECTION 4: LIGHT SIDE ACTIONS (GDR44) ---
  describe('Light Side Action Cards', () => {
    it('executes Draw One (+1): victim draws 1 card and loses turn', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const drawOneCard = deck.find((c) => c.lightFace.value === 'draw_one' && c.lightFace.color === 'red')!;
      const redTwo = deck.find((c) => c.lightFace.value === '2' && c.lightFace.color === 'red')!;
      const filler1 = deck.find((c) => c.lightFace.value === '3' && c.lightFace.color === 'blue')!;
      const filler2 = deck.find((c) => c.lightFace.value === '4' && c.lightFace.color === 'green')!;

      const state: GameState = {
        id: 'g1',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [drawOneCard, filler1], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [filler2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p3', username: 'P3', hand: [filler2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2', 'p3'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.filter((c) => ![drawOneCard.id, redTwo.id, filler1.id, filler2.id].includes(c.id)),
        discardPile: [redTwo],
        topDiscardCard: redTwo,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: drawOneCard.id,
      });

      // P2 was victim: received 1 card (hand was 1 -> now 2)
      expect(result.nextState.players[1].hand).toHaveLength(2);
      // Turn skips P2 and goes to P3 (index 2)
      expect(result.nextState.currentPlayerIndex).toBe(2);
    });

    it('handles Wild Draw Two challenge: guilty attacker draws 2 cards', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const wildDrawTwo = deck.find((c) => c.lightFace.value === 'wild_draw_two')!;
      const matchingRed = deck.find((c) => c.lightFace.value === '1' && c.lightFace.color === 'red')!;
      const redTop = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'red')!;
      const p2Card = deck.find((c) => c.lightFace.value === '9' && c.lightFace.color === 'blue')!;

      // P1 plays Wild Draw Two while ILLEGALLY holding matchingRed
      const state: GameState = {
        id: 'g2',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [wildDrawTwo, matchingRed], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [p2Card], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.filter((c) => ![wildDrawTwo.id, matchingRed.id, redTop.id, p2Card.id].includes(c.id)),
        discardPile: [redTop],
        topDiscardCard: redTop,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Play Wild Draw Two choosing 'blue'
      const playRes = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildDrawTwo.id,
        chosenColor: 'blue',
      });

      expect(playRes.nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_TWO_RESOLUTION');

      // P2 challenges
      const chalRes = FlipActionProcessor.process(playRes.nextState, {
        type: 'CHALLENGE_WILD_DRAW_TWO',
        challengerPlayerId: 'p2',
      });

      // Attacker P1 was guilty: P1 draws 2 cards
      expect(chalRes.nextState.players[0].hand).toHaveLength(3); // had matchingRed + drawn 2 = 3
      // Challenger P2 gets to take their turn
      expect(chalRes.nextState.currentPlayerIndex).toBe(1);
    });

    it('handles Wild Draw Two challenge: innocent attacker forces challenger to draw 4 cards', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const wildDrawTwo = deck.find((c) => c.lightFace.value === 'wild_draw_two')!;
      const nonMatchingBlue = deck.find((c) => c.lightFace.value === '1' && c.lightFace.color === 'blue')!;
      const redTop = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'red')!;
      const p2Card = deck.find((c) => c.lightFace.value === '9' && c.lightFace.color === 'blue')!;

      // P1 plays Wild Draw Two LEGALLY (holds nonMatchingBlue, top is red)
      const state: GameState = {
        id: 'g3',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [wildDrawTwo, nonMatchingBlue], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [p2Card], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.filter((c) => ![wildDrawTwo.id, nonMatchingBlue.id, redTop.id, p2Card.id].includes(c.id)),
        discardPile: [redTop],
        topDiscardCard: redTop,
        activeColor: 'red',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const playRes = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildDrawTwo.id,
        chosenColor: 'blue',
      });

      const chalRes = FlipActionProcessor.process(playRes.nextState, {
        type: 'CHALLENGE_WILD_DRAW_TWO',
        challengerPlayerId: 'p2',
      });

      // P1 was innocent: Challenger P2 draws 4 cards (2 + 2 penalty) and loses turn!
      expect(chalRes.nextState.players[1].hand).toHaveLength(5); // had 1 + 4 = 5
      // In 2-player game, since P2 loses turn, P1 plays again
      expect(chalRes.nextState.currentPlayerIndex).toBe(0);
    });
  });

  // --- SECTION 5: DARK SIDE ACTIONS (GDR44) ---
  describe('Dark Side Action Cards', () => {
    it('executes Draw Five (+5): next player draws 5 cards and loses turn', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      // Find card with darkFace draw_five
      const drawFiveCard = deck.find((c) => c.darkFace.value === 'draw_five' && c.darkFace.color === 'pink')!;
      const pinkCard = deck.find((c) => c.darkFace.value === '3' && c.darkFace.color === 'pink')!;
      const filler1 = deck.find((c) => c.darkFace.value === '1' && c.darkFace.color === 'teal')!;
      const filler2 = deck.find((c) => c.darkFace.value === '2' && c.darkFace.color === 'orange')!;

      // Flip card to DARK
      const activeDrawFive = FlipDeckFactory.flipCard(drawFiveCard, 'DARK');
      const activePink = FlipDeckFactory.flipCard(pinkCard, 'DARK');

      const state: GameState = {
        id: 'g4',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'DARK',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [activeDrawFive, filler1], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [filler2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p3', username: 'P3', hand: [filler2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2', 'p3'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        discardPile: [activePink],
        topDiscardCard: activePink,
        activeColor: 'pink',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: activeDrawFive.id,
      });

      // P2 draws 5 cards (had 1 -> now 6)
      expect(result.nextState.players[1].hand).toHaveLength(6);
      // Turn skips P2 and advances to P3
      expect(result.nextState.currentPlayerIndex).toBe(2);
    });

    it('executes Skip Everyone: skips all other players and grants active player another turn', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const skipAllCard = deck.find((c) => c.darkFace.value === 'skip_everyone' && c.darkFace.color === 'purple')!;
      const purpleCard = deck.find((c) => c.darkFace.value === '4' && c.darkFace.color === 'purple')!;
      const filler = deck.find((c) => c.darkFace.value === '1' && c.darkFace.color === 'teal')!;

      const activeSkipAll = FlipDeckFactory.flipCard(skipAllCard, 'DARK');
      const activePurple = FlipDeckFactory.flipCard(purpleCard, 'DARK');

      const state: GameState = {
        id: 'g5',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'DARK',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [activeSkipAll, filler], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [filler], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p3', username: 'P3', hand: [filler], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2', 'p3'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        discardPile: [activePurple],
        topDiscardCard: activePurple,
        activeColor: 'purple',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: activeSkipAll.id,
      });

      // Active player P1 gets another turn!
      expect(result.nextState.currentPlayerIndex).toBe(0);
      expect(result.events.some((e) => e.type === 'EVERYONE_SKIPPED')).toBe(true);
    });

    it('executes Wild Draw Color: target draws until matching chosen color and loses turn', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const wildDrawColor = deck.find((c) => c.darkFace.value === 'wild_draw_color')!;
      const purpleCard = deck.find((c) => c.darkFace.value === '6' && c.darkFace.color === 'purple')!;
      const filler = deck.find((c) => c.darkFace.value === '1' && c.darkFace.color === 'pink')!;

      const activeWildDrawColor = FlipDeckFactory.flipCard(wildDrawColor, 'DARK');
      const activePurple = FlipDeckFactory.flipCard(purpleCard, 'DARK');

      // Controlled draw pile where top 2 are non-teal, and 3rd is teal
      const nonTeal1 = FlipDeckFactory.flipCard(deck.find((c) => c.darkFace.color === 'pink' && c.darkFace.value === '1')!, 'DARK');
      const nonTeal2 = FlipDeckFactory.flipCard(deck.find((c) => c.darkFace.color === 'purple' && c.darkFace.value === '2')!, 'DARK');
      const targetTeal = FlipDeckFactory.flipCard(deck.find((c) => c.darkFace.color === 'teal' && c.darkFace.value === '5')!, 'DARK');

      // Draw pile pops from the end
      const controlledDrawPile = [targetTeal, nonTeal2, nonTeal1];

      const state: GameState = {
        id: 'g6',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'DARK',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [activeWildDrawColor, filler], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [filler], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: controlledDrawPile,
        discardPile: [activePurple],
        topDiscardCard: activePurple,
        activeColor: 'purple',
        turnNumber: 1,
        sequenceNumber: 1,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // P1 plays Wild Draw Color choosing 'teal'
      const playRes = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: activeWildDrawColor.id,
        chosenColor: 'teal',
      });

      expect(playRes.nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_COLOR_RESOLUTION');

      // P2 accepts
      const acceptRes = FlipActionProcessor.process(playRes.nextState, {
        type: 'ACCEPT_WILD_DRAW_COLOR',
        playerId: 'p2',
      });

      // P2 drew until 'teal' was drawn (drew 3 cards total: nonTeal1, nonTeal2, targetTeal)
      expect(acceptRes.nextState.players[1].hand).toHaveLength(4); // had 1 + 3 = 4
      // P2 loses turn, in 2-player game P1 plays again
      expect(acceptRes.nextState.currentPlayerIndex).toBe(0);
      expect(acceptRes.nextState.activeColor).toBe('teal');
    });
  });

  // --- SECTION 6: UNO PENALTY & SCORING ---
  describe('UNO Declaration & Scoring (GDR44)', () => {
    it('applies 2-card penalty for missed UNO call per Mattel GDR44', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const card1 = deck[0];
      const card2 = deck[1];

      const state: GameState = {
        id: 'g7',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [card1], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [card2], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 1, // P1 just played, P2's turn
        turnDirection: 'clockwise',
        drawPile: deck.slice(2),
        discardPile: [card1],
        topDiscardCard: card1,
        activeColor: card1.lightFace!.color ?? 'red',
        turnNumber: 2,
        sequenceNumber: 2,
        unoVulnerablePlayerId: 'p1', // P1 forgot to call UNO
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      // Per GDR44: draws exactly 2 cards (Classic UNO is 4 cards)
      expect(result.nextState.players[0].hand).toHaveLength(3); // 1 + 2 = 3
    });

    it('scores Dark Side cards correctly including 60 points for Wild Draw Color', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const wildDrawColor = deck.find((c) => c.darkFace.value === 'wild_draw_color')!;
      const winCard = deck.find((c) => c.darkFace.value === '1' && c.darkFace.color === 'teal')!;
      const tealDiscard = deck.find((c) => c.darkFace.value === '2' && c.darkFace.color === 'teal')!;

      const activeWin = FlipDeckFactory.flipCard(winCard, 'DARK');
      const activeDiscard = FlipDeckFactory.flipCard(tealDiscard, 'DARK');
      const activeWildDrawColor = FlipDeckFactory.flipCard(wildDrawColor, 'DARK');

      const state: GameState = {
        id: 'g8',
        roomId: 'r1',
        variant: 'uno_flip',
        activeSide: 'DARK',
        status: 'IN_PROGRESS',
        roundNumber: 1,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [activeWin], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          { id: 'p2', username: 'P2', hand: [activeWildDrawColor], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.slice(3).map((c) => FlipDeckFactory.flipCard(c, 'DARK')),
        discardPile: [activeDiscard],
        topDiscardCard: activeDiscard,
        activeColor: 'teal',
        turnNumber: 5,
        sequenceNumber: 10,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: activeWin.id,
      });

      expect(result.nextState.status).toBe('ROUND_OVER');
      expect(result.nextState.roundWinner?.id).toBe('p1');
      // P2 held Wild Draw Color on Dark side = 60 points!
      expect(result.nextState.roundWinner?.roundScore).toBe(60);
      expect(result.nextState.players[0].score).toBe(60);
    });

    it('verifies exact Mattel GDR44 score values for all card categories on both sides', () => {
      const deck = FlipDeckFactory.createFlipDeck();

      // Light Side assertions:
      const lightDrawOne = deck.find((c) => c.lightFace.value === 'draw_one')!;
      expect(lightDrawOne.lightFace.scoreValue).toBe(10);

      const lightReverse = deck.find((c) => c.lightFace.value === 'reverse')!;
      expect(lightReverse.lightFace.scoreValue).toBe(20);

      const lightSkip = deck.find((c) => c.lightFace.value === 'skip')!;
      expect(lightSkip.lightFace.scoreValue).toBe(20);

      const lightFlip = deck.find((c) => c.lightFace.value === 'flip')!;
      expect(lightFlip.lightFace.scoreValue).toBe(20);

      const lightWild = deck.find((c) => c.lightFace.value === 'wild')!;
      expect(lightWild.lightFace.scoreValue).toBe(40);

      const lightWildDrawTwo = deck.find((c) => c.lightFace.value === 'wild_draw_two')!;
      expect(lightWildDrawTwo.lightFace.scoreValue).toBe(50);

      // Dark Side assertions:
      const darkDrawFive = deck.find((c) => c.darkFace.value === 'draw_five')!;
      expect(darkDrawFive.darkFace.scoreValue).toBe(20);

      const darkReverse = deck.find((c) => c.darkFace.value === 'reverse')!;
      expect(darkReverse.darkFace.scoreValue).toBe(20);

      const darkSkipEveryone = deck.find((c) => c.darkFace.value === 'skip_everyone')!;
      expect(darkSkipEveryone.darkFace.scoreValue).toBe(30);

      const darkFlip = deck.find((c) => c.darkFace.value === 'flip')!;
      expect(darkFlip.darkFace.scoreValue).toBe(20);

      const darkWild = deck.find((c) => c.darkFace.value === 'wild')!;
      expect(darkWild.darkFace.scoreValue).toBe(40);

      const darkWildDrawColor = deck.find((c) => c.darkFace.value === 'wild_draw_color')!;
      expect(darkWildDrawColor.darkFace.scoreValue).toBe(60);

      // Number cards 1-9 on both sides: face value
      for (let n = 1; n <= 9; n++) {
        const lightNum = deck.find((c) => c.lightFace.value === String(n))!;
        expect(lightNum.lightFace.scoreValue).toBe(n);

        const darkNum = deck.find((c) => c.darkFace.value === String(n))!;
        expect(darkNum.darkFace.scoreValue).toBe(n);
      }
    });

    it('proves that the same physical card produces different scores depending on active face', () => {
      const deck = FlipDeckFactory.createFlipDeck();

      // Find a card with draw_one (10) on Light side and draw_five (20) on Dark side
      const drawCard = deck.find(
        (c) => c.lightFace.value === 'draw_one' && c.darkFace.value === 'draw_five'
      );
      if (drawCard) {
        const asLight = FlipDeckFactory.flipCard(drawCard, 'LIGHT');
        expect(asLight.scoreValue).toBe(10);

        const asDark = FlipDeckFactory.flipCard(drawCard, 'DARK');
        expect(asDark.scoreValue).toBe(20);
      }

      // Find a card with skip (20) on Light side and skip_everyone (30) on Dark side
      const skipCard = deck.find(
        (c) => c.lightFace.value === 'skip' && c.darkFace.value === 'skip_everyone'
      );
      if (skipCard) {
        const asLight = FlipDeckFactory.flipCard(skipCard, 'LIGHT');
        expect(asLight.scoreValue).toBe(20);

        const asDark = FlipDeckFactory.flipCard(skipCard, 'DARK');
        expect(asDark.scoreValue).toBe(30);
      }

      // Find a card with wild_draw_two (50) on Light side and wild_draw_color (60) on Dark side
      const wildAttackCard = deck.find(
        (c) => c.lightFace.value === 'wild_draw_two' && c.darkFace.value === 'wild_draw_color'
      );
      if (wildAttackCard) {
        const asLight = FlipDeckFactory.flipCard(wildAttackCard, 'LIGHT');
        expect(asLight.scoreValue).toBe(50);

        const asDark = FlipDeckFactory.flipCard(wildAttackCard, 'DARK');
        expect(asDark.scoreValue).toBe(60);
      }
    });

    it('scores a round ending on Light Side using Light Side values', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const lightDrawOne = deck.find((c) => c.lightFace.value === 'draw_one')!;
      const lightWild = deck.find((c) => c.lightFace.value === 'wild')!;
      const lightNum5 = deck.find((c) => c.lightFace.value === '5')!;

      // Hand containing Draw One (10) + Wild (40) + 5 (5) = 55 points on Light Side
      const loserHand = [lightDrawOne, lightWild, lightNum5];
      const handScore = FlipActionProcessor.calculateHandScore(loserHand, 'LIGHT');
      expect(handScore).toBe(55); // 10 + 40 + 5
    });

    it('scores a round ending on Dark Side using Dark Side values', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const darkSkipEveryone = deck.find((c) => c.darkFace.value === 'skip_everyone')!;
      const darkWildDrawColor = deck.find((c) => c.darkFace.value === 'wild_draw_color')!;
      const darkNum9 = deck.find((c) => c.darkFace.value === '9')!;

      // Hand containing Skip Everyone (30) + Wild Draw Color (60) + 9 (9) = 99 points on Dark Side
      const loserHand = [darkSkipEveryone, darkWildDrawColor, darkNum9];
      const handScore = FlipActionProcessor.calculateHandScore(loserHand, 'DARK');
      expect(handScore).toBe(99); // 30 + 60 + 9
    });

    it('accumulates multi-round score until reaching 500-point target score and completing match', () => {
      const deck = FlipDeckFactory.createFlipDeck();
      const winCard = deck.find((c) => c.lightFace.value === '2' && c.lightFace.color === 'blue')!;
      const discardCard = deck.find((c) => c.lightFace.value === '3' && c.lightFace.color === 'blue')!;

      // Loser holds 4 Wild Draw Color cards (each is 50 on Light side) + 2 Wild (40 each) = 200 + 80 = 280 pts
      const wild2a = deck.filter((c) => c.lightFace.value === 'wild_draw_two');
      const wildCards = deck.filter((c) => c.lightFace.value === 'wild').slice(0, 2);
      const heavyHand = [...wild2a, ...wildCards]; // 4 * 50 + 2 * 40 = 280 points

      const state: GameState = {
        id: 'match_500',
        roomId: 'room_500',
        variant: 'uno_flip',
        activeSide: 'LIGHT',
        status: 'IN_PROGRESS',
        roundNumber: 2,
        dealerIndex: 0,
        targetScore: 500,
        players: [
          { id: 'p1', username: 'P1', hand: [winCard], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 300 },
          { id: 'p2', username: 'P2', hand: heavyHand, hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 100 },
        ],
        playerOrder: ['p1', 'p2'],
        currentPlayerIndex: 0,
        turnDirection: 'clockwise',
        drawPile: deck.slice(10),
        discardPile: [discardCard],
        topDiscardCard: discardCard,
        activeColor: 'blue',
        turnNumber: 15,
        sequenceNumber: 30,
        unoVulnerablePlayerId: null,
        pendingActionState: null,
        inspectionHand: null,
        roundWinner: null,
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = FlipActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: winCard.id,
      });

      // P1 wins round, scores 280 points. Total = 300 + 280 = 580 >= 500 targetScore!
      expect(result.nextState.status).toBe('COMPLETED');
      expect(result.nextState.roundWinner?.roundScore).toBe(280);
      expect(result.nextState.players[0].score).toBe(580);
      expect(result.nextState.winner?.id).toBe('p1');
      expect(result.nextState.winner?.score).toBe(580);
    });

    // --- FIX F: FINAL CARD EFFECTS & SCORING REGRESSION TESTS ---
    describe('Final Card Effects & Scoring Resolutions (Fix F)', () => {
      it('going out with Draw One forces next player to draw 1 card before round score is calculated', () => {
        const deck = FlipDeckFactory.createFlipDeck();
        const drawOneCard = deck.find((c) => c.lightFace.value === 'draw_one' && c.lightFace.color === 'blue')!;
        const blueDiscard = deck.find((c) => c.lightFace.value === '3' && c.lightFace.color === 'blue')!;
        const loserCard = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'red')!; // 5 pts
        const drawnCard = deck.find((c) => c.lightFace.value === '7' && c.lightFace.color === 'yellow')!; // 7 pts

        const state: GameState = {
          id: 'g_final_draw_one',
          roomId: 'r1',
          variant: 'uno_flip',
          activeSide: 'LIGHT',
          status: 'IN_PROGRESS',
          roundNumber: 1,
          dealerIndex: 0,
          targetScore: 500,
          players: [
            { id: 'p1', username: 'P1', hand: [drawOneCard], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
            { id: 'p2', username: 'P2', hand: [loserCard], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          ],
          playerOrder: ['p1', 'p2'],
          currentPlayerIndex: 0,
          turnDirection: 'clockwise',
          drawPile: [drawnCard], // Top of draw pile will be popped
          discardPile: [blueDiscard],
          topDiscardCard: blueDiscard,
          activeColor: 'blue',
          turnNumber: 5,
          sequenceNumber: 10,
          unoVulnerablePlayerId: null,
          pendingActionState: null,
          inspectionHand: null,
          roundWinner: null,
          winner: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = FlipActionProcessor.process(state, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: drawOneCard.id,
        });

        expect(result.nextState.status).toBe('ROUND_OVER');
        expect(result.nextState.roundWinner?.id).toBe('p1');
        // P2 drew drawnCard (7 pts) so held loserCard (5 pts) + drawnCard (7 pts) = 12 pts total!
        expect(result.nextState.players[1].hand).toHaveLength(2);
        expect(result.nextState.roundWinner?.roundScore).toBe(12);
        expect(result.nextState.players[0].score).toBe(12);
      });

      it('going out with Draw Five on Dark Side forces next player to draw 5 cards before scoring', () => {
        const deck = FlipDeckFactory.createFlipDeck();
        const drawFiveCard = FlipDeckFactory.flipCard(
          deck.find((c) => c.darkFace.value === 'draw_five' && c.darkFace.color === 'teal')!,
          'DARK'
        );
        const tealDiscard = FlipDeckFactory.flipCard(
          deck.find((c) => c.darkFace.value === '1' && c.darkFace.color === 'teal')!,
          'DARK'
        );
        const loserCard = FlipDeckFactory.flipCard(
          deck.find((c) => c.darkFace.value === '4' && c.darkFace.color === 'pink')!,
          'DARK'
        ); // 4 pts

        // 5 cards for draw pile (each number 2 = 2 pts, 5 * 2 = 10 pts)
        const drawnCards = deck
          .filter((c) => c.darkFace.value === '2')
          .slice(0, 5)
          .map((c) => FlipDeckFactory.flipCard(c, 'DARK'));

        const state: GameState = {
          id: 'g_final_draw_five',
          roomId: 'r1',
          variant: 'uno_flip',
          activeSide: 'DARK',
          status: 'IN_PROGRESS',
          roundNumber: 1,
          dealerIndex: 0,
          targetScore: 500,
          players: [
            { id: 'p1', username: 'P1', hand: [drawFiveCard], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
            { id: 'p2', username: 'P2', hand: [loserCard], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          ],
          playerOrder: ['p1', 'p2'],
          currentPlayerIndex: 0,
          turnDirection: 'clockwise',
          drawPile: drawnCards,
          discardPile: [tealDiscard],
          topDiscardCard: tealDiscard,
          activeColor: 'teal',
          turnNumber: 8,
          sequenceNumber: 20,
          unoVulnerablePlayerId: null,
          pendingActionState: null,
          inspectionHand: null,
          roundWinner: null,
          winner: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = FlipActionProcessor.process(state, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: drawFiveCard.id,
        });

        expect(result.nextState.status).toBe('ROUND_OVER');
        expect(result.nextState.roundWinner?.id).toBe('p1');
        // P2 had 1 card + 5 drawn cards = 6 cards!
        expect(result.nextState.players[1].hand).toHaveLength(6);
        // Score: 4 (initial loser card) + 10 (5 cards * 2) = 14 pts
        expect(result.nextState.roundWinner?.roundScore).toBe(14);
      });

      it('going out with Wild Draw Two pauses round until resolution, and scores newly drawn cards', () => {
        const deck = FlipDeckFactory.createFlipDeck();
        const wildDrawTwo = deck.find((c) => c.lightFace.value === 'wild_draw_two')!;
        const blueDiscard = deck.find((c) => c.lightFace.value === '8' && c.lightFace.color === 'blue')!;
        const loserCard = deck.find((c) => c.lightFace.value === '3' && c.lightFace.color === 'green')!; // 3 pts
        const drawn1 = deck.find((c) => c.lightFace.value === '4' && c.lightFace.color === 'yellow')!; // 4 pts
        const drawn2 = deck.find((c) => c.lightFace.value === '6' && c.lightFace.color === 'red')!; // 6 pts

        const state: GameState = {
          id: 'g_final_wild_two',
          roomId: 'r1',
          variant: 'uno_flip',
          activeSide: 'LIGHT',
          status: 'IN_PROGRESS',
          roundNumber: 1,
          dealerIndex: 0,
          targetScore: 500,
          players: [
            { id: 'p1', username: 'P1', hand: [wildDrawTwo], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
            { id: 'p2', username: 'P2', hand: [loserCard], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          ],
          playerOrder: ['p1', 'p2'],
          currentPlayerIndex: 0,
          turnDirection: 'clockwise',
          drawPile: [drawn2, drawn1],
          discardPile: [blueDiscard],
          topDiscardCard: blueDiscard,
          activeColor: 'blue',
          turnNumber: 9,
          sequenceNumber: 22,
          unoVulnerablePlayerId: null,
          pendingActionState: null,
          inspectionHand: null,
          roundWinner: null,
          winner: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const playRes = FlipActionProcessor.process(state, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: wildDrawTwo.id,
          chosenColor: 'green',
        });

        // Round does NOT end yet — victim must accept or challenge
        expect(playRes.nextState.status).toBe('IN_PROGRESS');
        expect(playRes.nextState.pendingActionState?.type).toBe('AWAITING_WILD_DRAW_TWO_RESOLUTION');

        // P2 accepts
        const acceptRes = FlipActionProcessor.process(playRes.nextState, {
          type: 'ACCEPT_WILD_DRAW_TWO',
          playerId: 'p2',
        });

        expect(acceptRes.nextState.status).toBe('ROUND_OVER');
        expect(acceptRes.nextState.roundWinner?.id).toBe('p1');
        // P2 held loserCard (3) + drew drawn1 (4) + drawn2 (6) = 13 points total
        expect(acceptRes.nextState.roundWinner?.roundScore).toBe(13);
        expect(acceptRes.nextState.players[1].hand).toHaveLength(3);
      });

      it('going out with Flip card flips active side and calculates score on the NEW side', () => {
        const deck = FlipDeckFactory.createFlipDeck();
        const flipCard = deck.find((c) => c.lightFace.value === 'flip' && c.lightFace.color === 'blue')!;
        const blueDiscard = deck.find((c) => c.lightFace.value === '7' && c.lightFace.color === 'blue')!;

        // Loser holds a card whose lightFace is draw_one (10 pts) and darkFace is draw_five (20 pts)
        const loserCard = deck.find(
          (c) => c.lightFace.value === 'draw_one' && c.darkFace.value === 'draw_five'
        )!;

        const state: GameState = {
          id: 'g_final_flip',
          roomId: 'r1',
          variant: 'uno_flip',
          activeSide: 'LIGHT',
          status: 'IN_PROGRESS',
          roundNumber: 1,
          dealerIndex: 0,
          targetScore: 500,
          players: [
            { id: 'p1', username: 'P1', hand: [flipCard], hasDeclaredUno: true, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
            { id: 'p2', username: 'P2', hand: [loserCard], hasDeclaredUno: false, hasDrawnThisTurn: false, drawnCardId: null, score: 0 },
          ],
          playerOrder: ['p1', 'p2'],
          currentPlayerIndex: 0,
          turnDirection: 'clockwise',
          drawPile: deck.slice(5),
          discardPile: [blueDiscard],
          topDiscardCard: blueDiscard,
          activeColor: 'blue',
          turnNumber: 12,
          sequenceNumber: 28,
          unoVulnerablePlayerId: null,
          pendingActionState: null,
          inspectionHand: null,
          roundWinner: null,
          winner: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const result = FlipActionProcessor.process(state, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: flipCard.id,
        });

        expect(result.nextState.status).toBe('ROUND_OVER');
        expect(result.nextState.roundWinner?.id).toBe('p1');
        // Side flipped from LIGHT to DARK!
        expect(result.nextState.activeSide).toBe('DARK');
        // Loser hand is scored at DARK face value (draw_five = 20 pts), NOT Light face (draw_one = 10 pts)!
        expect(result.nextState.roundWinner?.roundScore).toBe(20);
        expect(result.nextState.players[0].score).toBe(20);
      });
    });
  });
});
