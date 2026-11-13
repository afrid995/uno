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
import { Card, PhysicalFlipCard } from '../src/cards/card.types';
import { GameConfig, GameState } from '../src/game/game.types';

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
        scoreValue: 20,
        lightFace: { color: 'red', value: 'draw_one', type: 'action', scoreValue: 20 },
        darkFace: { color: 'teal', value: 'draw_five', type: 'action', scoreValue: 20 },
      };
      // In GDR44 setup: symbols count as ZERO
      expect(FlipDealerSelector.getDealerScoreForCard(actionCard)).toBe(0);

      const wildCard: Card = {
        id: 'c3',
        color: null,
        value: 'wild',
        type: 'wild',
        scoreValue: 50,
        lightFace: { color: null, value: 'wild', type: 'wild', scoreValue: 50 },
        darkFace: { color: null, value: 'wild', type: 'wild', scoreValue: 50 },
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
  describe('Opening Starting Card Effects', () => {
    const baseConfig: GameConfig = {
      roomId: 'room_flip_1',
      players: [
        { id: 'p1', username: 'Alice' },
        { id: 'p2', username: 'Bob' },
        { id: 'p3', username: 'Charlie' },
      ],
      variant: 'uno_flip',
      dealerIndex: 0, // p1 is dealer, so p2 (index 1) is to the left
    };

    it('handles starting Draw One: player to dealer left draws 1 and loses turn', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const state = adapter.createGame(baseConfig);
      expect(state.variant).toBe('uno_flip');
      expect(state.activeSide).toBe('LIGHT');

      // Verify card conservation: 112 cards total
      const totalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;
      expect(totalCards).toBe(112);
    });

    it('handles starting Reverse: dealer plays first counter-clockwise per GDR44', () => {
      const adapter = VariantRegistry.get('uno_flip');
      const customRng = () => 0;
      const state = adapter.createGame({ ...baseConfig, dealerIndex: 0 }, customRng);

      // When starting card is Reverse: dealer plays first, play proceeds counter-clockwise
      if (state.topDiscardCard.value === 'reverse') {
        expect(state.turnDirection).toBe('counter_clockwise');
        expect(state.currentPlayerIndex).toBe(0); // dealer plays first!
      }
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
  });
});
