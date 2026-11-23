import { describe, it, expect } from 'vitest';
import '../src/index';
import { ActionProcessor } from '../src/actions/action.processor';
import { MoveValidator } from '../src/validation/move.validator';
import { CardFactory } from '../src/cards/card.factory';
import { GameState } from '../src/game/game.types';
import { VariantRegistry } from '../src/variants/variant.types';
import { UnoTeamsAdapter } from '../src/variants/teams/teams.adapter';
import { UnoAttackAdapter } from '../src/variants/attack/attack.adapter';
import { UnoNoMercyAdapter } from '../src/variants/no-mercy/no-mercy.adapter';
import { UnoFlipAdapter } from '../src/variants/flip/flip.adapter';
import { UnoFlexAdapter } from '../src/variants/flex/flex.adapter';
import { UnoAllWildAdapter } from '../src/variants/all-wild/all-wild.adapter';
import { AttackFixtureBuilder } from '../src/variants/attack/attack.fixture';
import { TeamsFixtureBuilder } from '../src/variants/teams/teams.fixture';
import { TeamsMoveValidator } from '../src/variants/teams/teams.validator';
import { NoMercyFixtureBuilder } from '../src/variants/no-mercy/no-mercy.fixture';
import { getPublicGameState } from '../src/projections/public-state';
import { getPlayerGameState } from '../src/projections/player-state';

describe('Authoritative UNO Declaration, Catch, and Penalty Mechanics (All Variants)', () => {
  const cRed1 = CardFactory.createNumberCard('red', '1', 1);
  const cRed2 = CardFactory.createNumberCard('red', '2', 2);
  const cRed3 = CardFactory.createNumberCard('red', '3', 3);
  const cRed4 = CardFactory.createNumberCard('red', '4', 4);
  const cRed5 = CardFactory.createNumberCard('red', '5', 5);
  const cBlue1 = CardFactory.createNumberCard('blue', '1', 6);
  const cBlue2 = CardFactory.createNumberCard('blue', '2', 7);
  const cBlue3 = CardFactory.createNumberCard('blue', '3', 8);

  const createClassicState = (
    p1Hand = [cRed1, cRed2],
    p2Hand = [cBlue1, cBlue2, cBlue3],
    p3Hand = [cRed3, cBlue3]
  ): GameState => ({
    id: 'test-game',
    roomId: 'test-room',
    variant: 'classic',
    status: 'IN_PROGRESS',
    roundNumber: 1,
    dealerIndex: 2,
    targetScore: 500,
    players: [
      {
        id: 'p1',
        username: 'Alice',
        hand: p1Hand,
        score: 0,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        hasDeclaredUno: false,
      },
      {
        id: 'p2',
        username: 'Bob',
        hand: p2Hand,
        score: 0,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        hasDeclaredUno: false,
      },
      {
        id: 'p3',
        username: 'Charlie',
        hand: p3Hand,
        score: 0,
        hasDrawnThisTurn: false,
        drawnCardId: null,
        hasDeclaredUno: false,
      },
    ],
    playerOrder: ['p1', 'p2', 'p3'],
    currentPlayerIndex: 0, // p1's turn
    turnDirection: 'clockwise',
    topDiscardCard: CardFactory.createNumberCard('red', '9', 99),
    activeColor: 'red',
    drawPile: [
      CardFactory.createNumberCard('yellow', '1', 101),
      CardFactory.createNumberCard('yellow', '2', 102),
      CardFactory.createNumberCard('yellow', '3', 103),
      CardFactory.createNumberCard('yellow', '4', 104),
      CardFactory.createNumberCard('yellow', '5', 105),
      CardFactory.createNumberCard('green', '1', 106),
      CardFactory.createNumberCard('green', '2', 107),
    ],
    discardPile: [CardFactory.createNumberCard('red', '9', 99)],
    turnNumber: 1,
    sequenceNumber: 1,
    unoVulnerablePlayerId: null,
    pendingActionState: null,
    inspectionHand: null,
    roundWinner: null,
    winner: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  describe('1. Pre-Play Declaration Restrictions', () => {
    it('Scenario 1: Player holding 5 cards cannot declare UNO', () => {
      const state = createClassicState([cRed1, cRed2, cRed3, cRed4, cRed5]);
      const validation = MoveValidator.validate(state, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('INVALID_UNO_CALL');
    });

    it('Scenario 2: Player holding 3 cards cannot declare UNO', () => {
      const state = createClassicState([cRed1, cRed2, cRed3]);
      const validation = MoveValidator.validate(state, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('INVALID_UNO_CALL');
    });

    it('Scenario 3: Player holding 2 cards on their turn CAN declare UNO beforehand', () => {
      const state = createClassicState([cRed1, cRed2]);
      const validation = MoveValidator.validate(state, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(validation.valid).toBe(true);

      const { nextState, events } = ActionProcessor.process(state, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(nextState.players[0].hasDeclaredUno).toBe(true);
      expect(events.some((e) => e.type === 'UNO_CALLED')).toBe(true);
    });

    it('Scenario 4: Player holding 2 cards OFF-TURN cannot declare UNO', () => {
      const state = createClassicState(); // p1 is currentPlayerIndex 0
      // p3 tries to call UNO off-turn
      const validation = MoveValidator.validate(state, {
        type: 'CALL_UNO',
        playerId: 'p3',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('NOT_YOUR_TURN');
    });

    it('Scenario 5: Player who already declared UNO cannot declare again', () => {
      const state = createClassicState([cRed1, cRed2]);
      state.players[0].hasDeclaredUno = true;

      const validation = MoveValidator.validate(state, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('INVALID_UNO_CALL');
    });
  });

  describe('2. Atomic Card Play & Vulnerability Resolution', () => {
    it('Scenario 6: Atomic declaration on card play down to 1 card protects player', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState, events } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
        declareUno: true,
      });

      expect(nextState.players[0].hand).toHaveLength(1);
      expect(nextState.players[0].hasDeclaredUno).toBe(true);
      expect(nextState.unoVulnerablePlayerId).toBeNull();
      expect(events.some((e) => e.type === 'UNO_CALLED')).toBe(true);

      // Verify projection
      const pubState = getPublicGameState(nextState);
      expect(pubState.players[0].hasDeclaredUno).toBe(true);
      expect(pubState.players[0].isVulnerableToUno).toBe(false);
    });

    it('Scenario 7: Playing down to 1 card without declareUno makes player vulnerable', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
        declareUno: false,
      });

      expect(nextState.players[0].hand).toHaveLength(1);
      expect(nextState.players[0].hasDeclaredUno).toBe(false);
      expect(nextState.unoVulnerablePlayerId).toBe('p1');

      // Verify projections
      const pubState = getPublicGameState(nextState);
      expect(pubState.players[0].isVulnerableToUno).toBe(true);

      const p2State = getPlayerGameState(nextState, 'p2');
      expect(p2State.self.canCatchUno).toBe(true);
    });

    it('Scenario 8: Player holding 1 card CANNOT retroactively declare UNO', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: vulnerableState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      expect(vulnerableState.unoVulnerablePlayerId).toBe('p1');

      // P1 attempts to call UNO retroactively
      const validation = MoveValidator.validate(vulnerableState, {
        type: 'CALL_UNO',
        playerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('NOT_YOUR_TURN'); // It is now p2's turn
    });
  });

  describe('3. UNO Catch / Challenge Execution', () => {
    it('Scenario 9: Opponent catches vulnerable player -> exact 2 cards penalty (Classic Mattel)', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: vulnerableState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      const initialDrawPileCount = vulnerableState.drawPile.length;

      // Bob (p2) catches Alice (p1)
      const validation = MoveValidator.validate(vulnerableState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(true);

      const { nextState: caughtState, events } = ActionProcessor.process(vulnerableState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      // EXACTLY 2 cards penalty
      expect(caughtState.players[0].hand).toHaveLength(1 + 2);
      expect(caughtState.drawPile).toHaveLength(initialDrawPileCount - 2);
      expect(caughtState.unoVulnerablePlayerId).toBeNull();
      expect(caughtState.players[0].hasDeclaredUno).toBe(false);

      const successEv = events.find((e) => e.type === 'UNO_CHALLENGE_SUCCESS');
      expect(successEv).toBeDefined();
      expect(successEv?.payload.penaltyCards).toBe(2);
    });

    it('Scenario 10: Declared player cannot be caught', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: declaredState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
        declareUno: true,
      });

      const validation = MoveValidator.validate(declaredState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('TARGET_NOT_VULNERABLE');
    });

    it('Scenario 11: Self-catching is rejected', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: vulnerableState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      const validation = MoveValidator.validate(vulnerableState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p1',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('CANNOT_CHALLENGE_SELF');
    });

    it('Scenario 12: Turn order does NOT change when catch succeeds', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: vulnerableState } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      const turnIndexBefore = vulnerableState.currentPlayerIndex;
      const turnDirectionBefore = vulnerableState.turnDirection;

      const { nextState: caughtState } = ActionProcessor.process(vulnerableState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      expect(caughtState.currentPlayerIndex).toBe(turnIndexBefore);
      expect(caughtState.turnDirection).toBe(turnDirectionBefore);
    });
  });

  describe('4. Catch Window Closure Triggers', () => {
    it('Scenario 13: Catch window closes when next player plays a card', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: s1 } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      // Next player (p2) plays a card (e.g. cBlue1, matching discard color if we match or set blue)
      s1.activeColor = 'blue';
      const { nextState: s2 } = ActionProcessor.process(s1, {
        type: 'PLAY_CARD',
        playerId: 'p2',
        cardId: cBlue1.id,
      });

      expect(s2.unoVulnerablePlayerId).toBeNull();

      // Catch after window closure is rejected
      const validation = MoveValidator.validate(s2, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('TARGET_NOT_VULNERABLE');
    });

    it('Scenario 14: Catch window closes when next player draws a card', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: s1 } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      // Next player (p2) draws a card
      const { nextState: s2 } = ActionProcessor.process(s1, {
        type: 'DRAW_CARD',
        playerId: 'p2',
      });

      expect(s2.unoVulnerablePlayerId).toBeNull();

      const validation = MoveValidator.validate(s2, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('TARGET_NOT_VULNERABLE');
    });

    it('Scenario 15: Catch window closes when next player passes turn', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: s1 } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      // Simulate p2 has drawn a playable card and now passes
      s1.players[1].hasDrawnThisTurn = true;
      s1.unoVulnerablePlayerId = 'p1';

      const { nextState: s2 } = ActionProcessor.process(s1, {
        type: 'PASS_TURN',
        playerId: 'p2',
      });

      expect(s2.unoVulnerablePlayerId).toBeNull();

      const validation = MoveValidator.validate(s2, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
      expect(validation.valid).toBe(false);
      expect(validation.code).toBe('TARGET_NOT_VULNERABLE');
    });

    it('Scenario 16: Duplicate concurrent catches are safely absorbed', () => {
      const state = createClassicState([cRed1, cRed2]);
      const { nextState: s1 } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      // First catch succeeds
      const { nextState: s2 } = ActionProcessor.process(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });
      expect(s2.players[0].hand).toHaveLength(3);
      expect(s2.unoVulnerablePlayerId).toBeNull();

      // Second catch on the same target is rejected (no double penalty!)
      const val2 = MoveValidator.validate(s2, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p3',
        targetPlayerId: 'p1',
      });
      expect(val2.valid).toBe(false);
      expect(val2.code).toBe('TARGET_NOT_VULNERABLE');
    });

    it('Scenario 17: Card conservation holds strictly', () => {
      const state = createClassicState([cRed1, cRed2]);
      const initialTotalCards =
        state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        state.drawPile.length +
        state.discardPile.length;

      const { nextState: s1 } = ActionProcessor.process(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: cRed1.id,
      });

      const { nextState: s2 } = ActionProcessor.process(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      const finalTotalCards =
        s2.players.reduce((sum, p) => sum + p.hand.length, 0) +
        s2.drawPile.length +
        s2.discardPile.length;

      expect(finalTotalCards).toBe(initialTotalCards);
    });
  });

  describe('5. Variant-Specific Mechanics Verification', () => {
    it('UNO Attack: Penalty for missed UNO is 2 button presses', () => {
      const adapter = VariantRegistry.get('uno_attack') as UnoAttackAdapter;
      const initial = AttackFixtureBuilder.createInitialGameFixture();
      const numCard1 = initial.drawPile.find((c) => c.type === 'number' && c.color === 'red')!;
      const numCard2 = initial.drawPile.find((c) => c.type === 'number' && c.color === 'red' && c.id !== numCard1.id)!;
      const otherCard = initial.drawPile.find((c) => c.id !== numCard1.id && c.id !== numCard2.id)!;
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [numCard1, otherCard], // 2 cards
        },
        numCard2
      );
      custom.activeColor = 'red';

      // P1 plays down to 1 card without declaring UNO
      const { nextState: s1 } = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: numCard1.id,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      // Opponent challenges missed UNO
      const { nextState: s2, events } = adapter.processAction(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      expect(s2.unoVulnerablePlayerId).toBeNull();
      const launcherEv = events.find((e) => e.type === 'ATTACK_LAUNCHER_RESULT');
      expect(launcherEv).toBeDefined();
      expect(launcherEv?.payload.presses).toBe(2);
      expect(launcherEv?.payload.reason).toBe('MISSED_UNO_CHALLENGE_PENALTY');
    });

    it('UNO Show \'em No Mercy: 2 cards penalty + Mercy Rule 25-card limit check', () => {
      const adapter = VariantRegistry.get('uno_show_em_no_mercy') as UnoNoMercyAdapter;
      const initial = NoMercyFixtureBuilder.createInitialGameFixture({ dealerIndex: 1 });
      const numCard = initial.players[0].hand.find((c) => c.type === 'number' && c.value !== '7' && c.value !== '0')!;
      const otherCard = initial.players[0].hand.find((c) => c.id !== numCard.id)!;
      const rest = initial.players[0].hand.filter((c) => c.id !== numCard.id && c.id !== otherCard.id);
      initial.players[0].hand = [numCard, otherCard];
      initial.drawPile.push(...rest);
      initial.activeColor = numCard.color ?? 'red';

      // Play down to 1 card without declareUno
      const { nextState: s1 } = adapter.processAction(initial, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: numCard.id,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      // Opponent catches
      const { nextState: s2, events } = adapter.processAction(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      expect(s2.players[0].hand).toHaveLength(1 + 2);
      expect(s2.unoVulnerablePlayerId).toBeNull();
      expect(events.some((e) => e.type === 'UNO_CHALLENGED')).toBe(true);
    });

    it('UNO Teams: Partner can call UNO on behalf of teammate, teammate cannot catch partner', () => {
      const adapter = VariantRegistry.get('uno_teams') as UnoTeamsAdapter;
      const initial = TeamsFixtureBuilder.createInitialGameFixture();

      // p1 & p3 are partners (team1). p2 & p4 are partners (team2).
      const top = initial.drawPile[0];
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [initial.drawPile[1], initial.drawPile[2]],
          p2: [initial.drawPile[3], initial.drawPile[4]],
          p3: [initial.drawPile[5]], // p3 has 1 card
          p4: [initial.drawPile[6], initial.drawPile[7]],
        },
        top
      );
      custom.players[2].hasDeclaredUno = false;
      custom.unoVulnerablePlayerId = 'p3';

      // Teammate (p1) cannot challenge partner (p3)
      const teammateCatchVal = TeamsMoveValidator.validate(custom, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p1',
        targetPlayerId: 'p3',
      });
      expect(teammateCatchVal.valid).toBe(false);
      expect(teammateCatchVal.code).toBe('CANNOT_CHALLENGE_SELF');

      // Teammate (p1) CAN call UNO on behalf of partner (p3) to protect them
      const teammateCallVal = TeamsMoveValidator.validate(custom, {
        type: 'CALL_UNO',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });
      expect(teammateCallVal.valid).toBe(true);

      const { nextState: rescuedState } = adapter.processAction(custom, {
        type: 'CALL_UNO',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });
      expect(rescuedState.players[2].hasDeclaredUno).toBe(true);
      expect(rescuedState.unoVulnerablePlayerId).toBeNull();
    });

    it('UNO Flip: Atomic declaration works with Flip cards down to 1 card', () => {
      const adapter = VariantRegistry.get('uno_flip') as UnoFlipAdapter;
      const initial = adapter.createGame({
        matchId: 'flip-test',
        roomId: 'flip-room',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_flip',
        dealerIndex: 0,
      });
      initial.currentPlayerIndex = 0;
      const [c1, c2, ...rest] = initial.players[0].hand;
      initial.players[0].hand = [c1, c2];
      initial.drawPile.push(...rest);
      initial.activeColor = c1.color ?? 'blue';
      initial.pendingActionState = null;

      const { nextState } = adapter.processAction(initial, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: c1.id,
        chosenColor: c1.type === 'wild' ? 'blue' : undefined,
        declareUno: true,
      });

      expect(nextState.players[0].hand).toHaveLength(1);
      expect(nextState.players[0].hasDeclaredUno).toBe(true);
      expect(nextState.unoVulnerablePlayerId).toBeNull();
    });

    it('UNO Flex: Missed UNO penalty is 2 cards and preserves power card status', () => {
      const adapter = VariantRegistry.get('uno_flex') as UnoFlexAdapter;
      const initial = adapter.createGame({
        matchId: 'flex-test',
        roomId: 'flex-room',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_flex',
        dealerIndex: 2,
      });
      const c1 = initial.players[0].hand.find((c) => c.type === 'number') ?? initial.players[0].hand[0];
      const remainingHand = initial.players[0].hand.filter((c) => c.id !== c1.id);
      const c2 = remainingHand[0];
      const rest = remainingHand.slice(1);
      initial.players[0].hand = [c1, c2];
      initial.drawPile.push(...rest);
      initial.activeColor = c1.color ?? 'red';
      initial.topDiscardCard = { ...c1, id: 'top-discard-matching' };
      initial.pendingActionState = null;

      const { nextState: s1 } = adapter.processAction(initial, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: c1.id,
        chosenColor: c1.type === 'wild' ? 'red' : undefined,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      const { nextState: s2 } = adapter.processAction(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      expect(s2.players[0].hand).toHaveLength(1 + 2);
      expect(s2.unoVulnerablePlayerId).toBeNull();
    });

    it('UNO All Wild: Atomic declaration works and catch penalty is 2 cards', () => {
      const adapter = VariantRegistry.get('uno_all_wild') as UnoAllWildAdapter;
      const initial = adapter.createGame({
        matchId: 'wild-test',
        roomId: 'wild-room',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_all_wild',
        dealerIndex: 2,
      });
      const [c1, c2, ...rest] = initial.players[0].hand;
      initial.players[0].hand = [c1, c2];
      initial.drawPile.push(...rest);

      // Play with declareUno: true
      const { nextState: declaredState } = adapter.processAction(initial, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: c1.id,
        declareUno: true,
      });
      expect(declaredState.players[0].hand).toHaveLength(1);
      expect(declaredState.players[0].hasDeclaredUno).toBe(true);
      expect(declaredState.unoVulnerablePlayerId).toBeNull();

      // Reset to play without declaration
      const initial2 = adapter.createGame({
        matchId: 'wild-test-2',
        roomId: 'wild-room-2',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
        ],
        variant: 'uno_all_wild',
        dealerIndex: 2,
      });
      const [w1, w2, ...wRest] = initial2.players[0].hand;
      initial2.players[0].hand = [w1, w2];
      initial2.drawPile.push(...wRest);

      const { nextState: s1 } = adapter.processAction(initial2, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: w1.id,
      });
      expect(s1.unoVulnerablePlayerId).toBe('p1');

      const { nextState: s2 } = adapter.processAction(s1, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      expect(s2.players[0].hand).toHaveLength(1 + 2);
      expect(s2.unoVulnerablePlayerId).toBeNull();
    });
  });
});
