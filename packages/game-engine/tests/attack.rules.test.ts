import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VariantRegistry } from '../src/variants/variant.types';
import { AttackFixtureBuilder } from '../src/variants/attack/attack.fixture';
import { AttackDeckFactory } from '../src/variants/attack/attack.deck';
import { AttackLauncher } from '../src/variants/attack/attack.launcher';
import { assertValidAttackGameState } from '../src/variants/attack/attack.invariants';
import '../src/variants/attack/attack.adapter';

describe('UNO Attack Rule Fidelity & State Transitions (Mattel Product GTX66)', () => {
  const adapter = VariantRegistry.get('uno_attack');
  const fullDeck = AttackDeckFactory.createDeck();

  beforeEach(() => {
    AttackLauncher.setDeterministicOverride(null);
  });

  afterEach(() => {
    AttackLauncher.setDeterministicOverride(null);
  });

  describe('Game Initialization & Opening Card Rules', () => {
    it('initializes a 4-player game with 7 cards each and 112-card conservation', () => {
      const state = adapter.createGame({
        roomId: 'room_attack_init',
        variant: 'uno_attack',
        players: [
          { id: 'p1', username: 'P1' },
          { id: 'p2', username: 'P2' },
          { id: 'p3', username: 'P3' },
          { id: 'p4', username: 'P4' },
        ],
      });

      expect(state.variant).toBe('uno_attack');
      expect(state.players.length).toBe(4);
      expect(state.status).toBe('IN_PROGRESS');
      expect(state.drawPile.length + state.discardPile.length + state.players.reduce((sum, p) => sum + p.hand.length, 0)).toBe(112);

      assertValidAttackGameState(state);
    });

    it('rejects invalid player counts: < 2 or > 10', () => {
      expect(() => {
        adapter.createGame({
          roomId: 'room_1p',
          variant: 'uno_attack',
          players: [{ id: 'p1', username: 'P1' }],
        });
      }).toThrow(/Invalid player count/i);

      expect(() => {
        adapter.createGame({
          roomId: 'room_11p',
          variant: 'uno_attack',
          players: Array.from({ length: 11 }, (_, i) => ({ id: `p${i + 1}`, username: `P${i + 1}` })),
        });
      }).toThrow(/Invalid player count/i);
    });

    it('handles Reverse as opening card: dealer plays first, direction counter-clockwise', () => {
      const topReverse = fullDeck.find((c) => c.value === 'reverse')!;
      const state = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        state,
        {
          p1: [fullDeck.find((c) => c.id === 'attack_red_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_red_2_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_red_3_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_red_4_0')!],
        },
        topReverse
      );

      // In custom state with dealerIndex 0, reverse changes direction and dealer plays first
      expect(custom.topDiscardCard.value).toBe('reverse');
      assertValidAttackGameState(custom);
    });
  });

  describe('Normal Play & Discard All Action', () => {
    it('discards all matching colored cards in hand when playing Discard All', () => {
      const top = fullDeck.find((c) => c.color === 'yellow' && c.value === '5')!;
      const discardAllYellow = fullDeck.find((c) => c.color === 'yellow' && c.value === 'discard_all')!;
      const yellow1 = fullDeck.find((c) => c.color === 'yellow' && c.value === '1')!;
      const yellow2 = fullDeck.find((c) => c.color === 'yellow' && c.value === '2')!;
      const red3 = fullDeck.find((c) => c.color === 'red' && c.value === '3')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [discardAllYellow, yellow1, yellow2, red3], // 3 yellow cards, 1 red card
          p2: [fullDeck.find((c) => c.id === 'attack_blue_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_blue_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_blue_3_0')!],
        },
        top,
        'yellow'
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: discardAllYellow.id,
      });

      // p1 had 4 cards: plays Discard All + discards yellow1 + yellow2. Remaining: 1 card (red3)!
      expect(res.nextState.players[0].hand.length).toBe(1);
      expect(res.nextState.players[0].hand[0].id).toBe(red3.id);
      expect(res.nextState.topDiscardCard.id).toBe(discardAllYellow.id);
      expect(res.nextState.activeColor).toBe('yellow');

      assertValidAttackGameState(res.nextState);
    });
  });

  describe('Hit 2 & Wild Hit 4 Action Cards', () => {
    it('forces next player to hit launcher twice on Hit 2 and loses their turn', () => {
      AttackLauncher.setDeterministicOverride(2); // Launcher dispenses 2 cards

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const hit2 = fullDeck.find((c) => c.color === 'red' && c.value === 'hit_2')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [hit2, fullDeck.find((c) => c.id === 'attack_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!], // victim has 1 card
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: hit2.id,
      });

      // Victim (p2) received 2 cards: had 1 -> now 3 cards!
      expect(res.nextState.players[1].hand.length).toBe(3);
      // Victim's turn skipped: play advances to p3 (index 2)
      expect(res.nextState.currentPlayerIndex).toBe(2);

      assertValidAttackGameState(res.nextState);
    });

    it('in 2-player game, Hit 2 returns play directly to attacker', () => {
      AttackLauncher.setDeterministicOverride(1);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const hit2 = fullDeck.find((c) => c.color === 'red' && c.value === 'hit_2')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(2);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [hit2, fullDeck.find((c) => c.id === 'attack_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: hit2.id,
      });

      // p2 receives 1 card
      expect(res.nextState.players[1].hand.length).toBe(2);
      // 2-player rule: play returns to attacker (p1, index 0)!
      expect(res.nextState.currentPlayerIndex).toBe(0);

      assertValidAttackGameState(res.nextState);
    });

    it('forces next player to hit launcher 4 times on Wild Hit 4', () => {
      AttackLauncher.setDeterministicOverride(4);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const wildHit4 = fullDeck.find((c) => c.value === 'wild_hit_4')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildHit4, fullDeck.find((c) => c.id === 'attack_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildHit4.id,
        chosenColor: 'blue',
      });

      expect(res.nextState.activeColor).toBe('blue');
      expect(res.nextState.players[1].hand.length).toBe(5); // had 1 + 4 = 5
      expect(res.nextState.currentPlayerIndex).toBe(2); // p2 skipped, goes to p3

      assertValidAttackGameState(res.nextState);
    });
  });

  describe('Wild Attack-Attack & Targeting', () => {
    it('allows player to target ANY opponent, who must hit launcher twice, play continues after target', () => {
      AttackLauncher.setDeterministicOverride(2);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const wildAttack = fullDeck.find((c) => c.value === 'wild_attack_attack')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildAttack, fullDeck.find((c) => c.id === 'attack_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!], // p1 chooses to attack p3!
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildAttack.id,
        chosenColor: 'green',
        targetPlayerId: 'p3',
      });

      // p3 was attacked: draws 2 cards
      expect(res.nextState.players[2].hand.length).toBe(3);
      // Play continues with player after attacked player (p4, index 3)!
      expect(res.nextState.currentPlayerIndex).toBe(3);
      expect(res.nextState.activeColor).toBe('green');

      assertValidAttackGameState(res.nextState);
    });

    it('rejects targeting self with Wild Attack-Attack', () => {
      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const wildAttack = fullDeck.find((c) => c.value === 'wild_attack_attack')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildAttack],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      expect(() => {
        adapter.processAction(custom, {
          type: 'PLAY_CARD',
          playerId: 'p1',
          cardId: wildAttack.id,
          chosenColor: 'blue',
          targetPlayerId: 'p1', // Invalid: self target
        });
      }).toThrow(/cannot choose yourself/i);
    });
  });

  describe('Voluntary / Unplayable Turn Launcher Press (DRAW_CARD)', () => {
    it('advances turn immediately when player hits the launcher (Turn Over rule)', () => {
      AttackLauncher.setDeterministicOverride(1);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [fullDeck.find((c) => c.id === 'attack_blue_7_0')!],
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'DRAW_CARD',
        playerId: 'p1',
      });

      // p1 receives 1 card from launcher
      expect(res.nextState.players[0].hand.length).toBe(2);
      // In UNO Attack: "ONCE YOU PRESS THE LAUNCH BUTTON YOUR TURN IS OVER."
      // Turn advances immediately to p2 (index 1)!
      expect(res.nextState.currentPlayerIndex).toBe(1);

      assertValidAttackGameState(res.nextState);
    });
  });

  describe('UNO Declaration & Challenge Penalty', () => {
    it('forces offender to hit launcher twice if challenged for missing UNO declaration', () => {
      AttackLauncher.setDeterministicOverride(2);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const red5 = fullDeck.find((c) => c.color === 'red' && c.value === '5')!;
      const blue7 = fullDeck.find((c) => c.color === 'blue' && c.value === '7')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [red5, blue7], // 2 cards, plays red5 down to 1 card without calling UNO
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!],
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!],
        },
        top
      );

      // p1 plays card down to 1 card
      const afterPlay = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: red5.id,
      });

      expect(afterPlay.nextState.unoVulnerablePlayerId).toBe('p1');

      // Opponent p2 challenges p1
      const afterChallenge = adapter.processAction(afterPlay.nextState, {
        type: 'CHALLENGE_UNO_FAILURE',
        challengerPlayerId: 'p2',
        targetPlayerId: 'p1',
      });

      // p1 had 1 card + 2 launcher penalty cards = 3 cards!
      expect(afterChallenge.nextState.players[0].hand.length).toBe(3);
      expect(afterChallenge.nextState.unoVulnerablePlayerId).toBeNull();

      assertValidAttackGameState(afterChallenge.nextState);
    });
  });

  describe('Final-Card Action Resolution & Round Victory', () => {
    it('resolves Wild Attack-Attack action before declaring round victory when played as final card', () => {
      AttackLauncher.setDeterministicOverride(3);

      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const wildAttack = fullDeck.find((c) => c.value === 'wild_attack_attack')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      const custom = AttackFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildAttack], // p1 has only this final card!
          p2: [fullDeck.find((c) => c.id === 'attack_green_1_0')!], // 1 pt
          p3: [fullDeck.find((c) => c.id === 'attack_green_2_0')!], // 2 pts
          p4: [fullDeck.find((c) => c.id === 'attack_green_3_0')!], // 3 pts
        },
        top
      );

      // p1 attacks p3 as final card
      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildAttack.id,
        chosenColor: 'blue',
        targetPlayerId: 'p3',
      });

      // Official Rule: Target p3 must serve the 2 presses and collect cards BEFORE game ends
      expect(res.nextState.players[2].hand.length).toBe(4); // had 1 + 3 = 4 cards
      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner?.id).toBe('p1');

      assertValidAttackGameState(res.nextState);
    });

    it('declares match victory (status COMPLETED) when accumulated score reaches 500', () => {
      const top = fullDeck.find((c) => c.color === 'red' && c.value === '2')!;
      const finalCard = fullDeck.find((c) => c.color === 'red' && c.value === '7')!;

      const initial = AttackFixtureBuilder.createInitialGameFixture(4);
      // Give p1 480 starting score
      const stateWithScore = {
        ...initial,
        players: initial.players.map((p) => (p.id === 'p1' ? { ...p, score: 480 } : p)),
      };

      // Opponents hold cards worth 50 + 20 = 70 points
      const wildCard = fullDeck.find((c) => c.id === 'attack_wild_0')!;
      const skipCard = fullDeck.find((c) => c.id === 'attack_red_skip_0')!;

      const custom = AttackFixtureBuilder.setCustomState(
        stateWithScore,
        {
          p1: [finalCard],
          p2: [wildCard], // 50 pts
          p3: [skipCard], // 20 pts
          p4: [],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: finalCard.id,
      });

      // Round ends, p1 scores 70 pts. Total: 480 + 70 = 550 >= 500!
      expect(res.nextState.status).toBe('COMPLETED');
      expect(res.nextState.winner?.id).toBe('p1');
      expect(res.nextState.winner?.score).toBe(550);

      assertValidAttackGameState(res.nextState);
    });
  });
});
