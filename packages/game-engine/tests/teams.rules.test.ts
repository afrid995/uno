import { describe, it, expect } from 'vitest';
import { TeamsFixtureBuilder } from '../src/variants/teams/teams.fixture';
import { TeamsDeckFactory } from '../src/variants/teams/teams.deck';
import { VariantRegistry } from '../src/variants/variant.types';
import { assertValidTeamsGameState } from '../src/variants/teams/teams.invariants';
import '../src/variants/teams/teams.adapter';

describe('UNO Teams Rule Fidelity & State Transitions (Mattel Product HXT58)', () => {
  const adapter = VariantRegistry.get('uno_teams');
  const fullDeck = TeamsDeckFactory.createDeck();

  describe('Setup & Initial Card Pass (Rule 6)', () => {
    it('requires all players to submit a card before regular play starts', () => {
      const state = TeamsFixtureBuilder.createInitialGameFixture();
      expect(state.pendingActionState?.type).toBe('AWAITING_TEAM_INITIAL_PASS');

      // Player 0 (Alice) submits card
      const c0 = state.players[0].hand[0];
      const res0 = adapter.processAction(state, {
        type: 'TEAM_INITIAL_PASS',
        playerId: state.players[0].id,
        cardId: c0.id,
      });

      expect(res0.nextState.pendingActionState?.type).toBe('AWAITING_TEAM_INITIAL_PASS');
      expect((res0.nextState.pendingActionState as any).selections[state.players[0].id]).toBe(c0.id);

      // Other 3 players submit
      const c1 = state.players[1].hand[0];
      const res1 = adapter.processAction(res0.nextState, {
        type: 'TEAM_INITIAL_PASS',
        playerId: state.players[1].id,
        cardId: c1.id,
      });

      const c2 = state.players[2].hand[0];
      const res2 = adapter.processAction(res1.nextState, {
        type: 'TEAM_INITIAL_PASS',
        playerId: state.players[2].id,
        cardId: c2.id,
      });

      const c3 = state.players[3].hand[0];
      const finalRes = adapter.processAction(res2.nextState, {
        type: 'TEAM_INITIAL_PASS',
        playerId: state.players[3].id,
        cardId: c3.id,
      });

      // All passed! Transition to active gameplay
      expect(finalRes.nextState.pendingActionState).toBeNull();
      expect(finalRes.nextState.status).toBe('IN_PROGRESS');

      // Verify Player 0 received c2 (Charlie's card), Player 2 received c0 (Alice's card)
      expect(finalRes.nextState.players[0].hand.some((c) => c.id === c2.id)).toBe(true);
      expect(finalRes.nextState.players[2].hand.some((c) => c.id === c0.id)).toBe(true);

      // Verify Player 1 received c3 (Dave's card), Player 3 received c1 (Bob's card)
      expect(finalRes.nextState.players[1].hand.some((c) => c.id === c3.id)).toBe(true);
      expect(finalRes.nextState.players[3].hand.some((c) => c.id === c1.id)).toBe(true);

      assertValidTeamsGameState(finalRes.nextState);
    });
  });

  describe('Passing Symbol Cards', () => {
    it('triggers AWAITING_TEAM_CARD_PASS when played by an active player', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const passCard = fullDeck.find((c) => c.id === 'teams_red_5_1' && c.hasPassingSymbol)!;
      const extra1 = fullDeck.find((c) => c.id === 'teams_blue_1_0')!;
      const extra2 = fullDeck.find((c) => c.id === 'teams_green_1_0')!;
      const extra3 = fullDeck.find((c) => c.id === 'teams_yellow_1_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [passCard, extra1],
          p2: [extra2],
          p3: [extra3],
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: passCard.id,
      });

      expect(res.nextState.pendingActionState?.type).toBe('AWAITING_TEAM_CARD_PASS');
      const pending = res.nextState.pendingActionState as any;
      expect(pending.player1Id).toBe('p1');
      expect(pending.player2Id).toBe('p3');

      // p1 selects extra1 to pass
      const passP1 = adapter.processAction(res.nextState, {
        type: 'TEAM_CARD_PASS',
        playerId: 'p1',
        cardId: extra1.id,
      });
      expect(passP1.nextState.pendingActionState?.type).toBe('AWAITING_TEAM_CARD_PASS');

      // p3 selects extra3 to pass
      const passP3 = adapter.processAction(passP1.nextState, {
        type: 'TEAM_CARD_PASS',
        playerId: 'p3',
        cardId: extra3.id,
      });

      // Pass completed!
      expect(passP3.nextState.pendingActionState).toBeNull();
      // p1 now has extra3, p3 now has extra1
      expect(passP3.nextState.players[0].hand.some((c) => c.id === extra3.id)).toBe(true);
      expect(passP3.nextState.players[2].hand.some((c) => c.id === extra1.id)).toBe(true);

      // Turn advances to next player (p2)
      expect(passP3.nextState.currentPlayerIndex).toBe(1);

      assertValidTeamsGameState(passP3.nextState);
    });

    it('does NOT trigger passing symbol if partner is currently out of the game', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const passCard = fullDeck.find((c) => c.id === 'teams_red_5_1' && c.hasPassingSymbol)!;
      const extra1 = fullDeck.find((c) => c.id === 'teams_blue_1_0')!;
      const extra2 = fullDeck.find((c) => c.id === 'teams_green_1_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [passCard, extra1],
          p2: [extra2],
          p3: [], // partner p3 is OUT of the game!
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: passCard.id,
      });

      // Partner is out, so pass is skipped and turn advances normally!
      expect(res.nextState.pendingActionState).toBeNull();
      expect(res.nextState.currentPlayerIndex).toBe(1);
      assertValidTeamsGameState(res.nextState);
    });
  });

  describe('Wild Team Play', () => {
    it('skips directly to partner when partner has a playable card', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const wildTeamPlay = fullDeck.find((c) => c.id === 'teams_wild_team_play_0')!;
      const partnerPlayable = fullDeck.find((c) => c.id === 'teams_green_4_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildTeamPlay, fullDeck.find((c) => c.id === 'teams_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [partnerPlayable], // partner p3 has green 4
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      // p1 plays Wild Team Play and chooses green
      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildTeamPlay.id,
        chosenColor: 'green',
      });

      expect(res.nextState.activeColor).toBe('green');
      // Turn SKIPS directly to partner p3 (index 2)!
      expect(res.nextState.currentPlayerIndex).toBe(2);

      assertValidTeamsGameState(res.nextState);
    });

    it('imposes 2-card draw penalty on card player if partner CANNOT play a card', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const wildTeamPlay = fullDeck.find((c) => c.id === 'teams_wild_team_play_0')!;
      const partnerUnplayable = fullDeck.find((c) => c.id === 'teams_yellow_9_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildTeamPlay, fullDeck.find((c) => c.id === 'teams_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'teams_blue_2_0')!],
          p3: [partnerUnplayable], // partner p3 only has yellow 9, cannot play green!
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      // p1 plays Wild Team Play and chooses green
      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildTeamPlay.id,
        chosenColor: 'green',
      });

      // Partner could not play!
      // p1 must draw 2 penalty cards! p1 had 1 card remaining + 2 penalty = 3 cards!
      expect(res.nextState.players[0].hand.length).toBe(3);

      // Play continues from partner: turn advances to player after partner (p4, index 3)
      expect(res.nextState.currentPlayerIndex).toBe(3);

      assertValidTeamsGameState(res.nextState);
    });
  });

  describe('Wild Team Draw Four', () => {
    it('forces next player to draw 2 and skip, AND their partner to draw 2 (even if currently out)', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const wildTeamDrawFour = fullDeck.find((c) => c.id === 'teams_wild_team_draw_four_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [wildTeamDrawFour, fullDeck.find((c) => c.id === 'teams_blue_1_0')!],
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!], // p2 is on Team 2
          p3: [fullDeck.find((c) => c.id === 'teams_green_1_0')!],
          p4: [], // p4 (p2's partner) is OUT with 0 cards!
        },
        top
      );

      expect(custom.players[3].isOut).toBe(true);

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: wildTeamDrawFour.id,
        chosenColor: 'blue',
      });

      // Next player (p2) draws 2: was 1 -> now 3 cards!
      expect(res.nextState.players[1].hand.length).toBe(3);

      // Teammate (p4) draws 2: was 0 -> now 2 cards, and tagged back in!
      expect(res.nextState.players[3].hand.length).toBe(2);
      expect(res.nextState.players[3].isOut).toBe(false);

      // p2 is skipped, turn advances to p3 (index 2)
      expect(res.nextState.currentPlayerIndex).toBe(2);

      assertValidTeamsGameState(res.nextState);
    });
  });

  describe('Going Out & Partner Hand-Off', () => {
    it('splits partner hand (passes floor(n/2) cards) when partner has > 1 card', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const lastCard = fullDeck.find((c) => c.id === 'teams_red_7_0')!;

      // Partner p3 has 3 cards
      const p3c1 = fullDeck.find((c) => c.id === 'teams_blue_1_0')!;
      const p3c2 = fullDeck.find((c) => c.id === 'teams_blue_2_0')!;
      const p3c3 = fullDeck.find((c) => c.id === 'teams_blue_3_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [lastCard], // p1 plays their last card
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [p3c1, p3c2, p3c3], // partner has 3 cards
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: lastCard.id,
      });

      // Partner had 3 cards: floor(3/2) = 1 card passed to p1! Partner keeps 2 cards.
      expect(res.nextState.players[0].hand.length).toBe(1);
      expect(res.nextState.players[2].hand.length).toBe(2);
      expect(res.nextState.players[0].isOut).toBe(false);

      assertValidTeamsGameState(res.nextState);
    });

    it('sets player to isOut when partner has exactly 1 card remaining', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const lastCard = fullDeck.find((c) => c.id === 'teams_red_7_0')!;
      const partnerSingleCard = fullDeck.find((c) => c.id === 'teams_blue_1_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [lastCard], // p1 plays last card
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [partnerSingleCard], // partner only has 1 card left!
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: lastCard.id,
      });

      // Partner keeps their 1 card, p1 stays out of the game!
      expect(res.nextState.players[0].hand.length).toBe(0);
      expect(res.nextState.players[0].isOut).toBe(true);
      expect(res.nextState.players[2].hand.length).toBe(1);

      assertValidTeamsGameState(res.nextState);
    });

    it('declares TEAM VICTORY when both partners empty their hands (0 cards each)', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const lastCard = fullDeck.find((c) => c.id === 'teams_red_7_0')!;

      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [lastCard], // p1 plays last card
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [], // partner p3 ALREADY had 0 cards!
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      const res = adapter.processAction(custom, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardId: lastCard.id,
      });

      // BOTH PARTNERS AT 0 CARDS! ROUND FINISHED!
      expect(res.nextState.status).toBe('ROUND_OVER');
      expect(res.nextState.roundWinner).not.toBeNull();
      // Round score = points in p2 and p4 hands
      expect(res.nextState.roundWinner?.roundScore).toBeGreaterThan(0);

      assertValidTeamsGameState(res.nextState);
    });
  });

  describe('Tagging Back In', () => {
    it('tags out player back in when active partner draws cards on turn', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [fullDeck.find((c) => c.id === 'teams_blue_1_0')!], // p1 has 1 card
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [], // partner p3 is OUT!
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      expect(custom.players[2].isOut).toBe(true);

      // p1 draws a card
      const res = adapter.processAction(custom, {
        type: 'DRAW_CARD',
        playerId: 'p1',
      });

      // p1 had 1 card + drew 1 = 2 cards! Half (1 card) passed to p3!
      expect(res.nextState.players[0].hand.length).toBe(1);
      expect(res.nextState.players[2].hand.length).toBe(1);
      // p3 is tagged back in!
      expect(res.nextState.players[2].isOut).toBe(false);

      assertValidTeamsGameState(res.nextState);
    });
  });

  describe('Calling UNO & Teammate Privilege', () => {
    it('allows a partner to call UNO on behalf of their teammate', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const baseCustom = TeamsFixtureBuilder.setCustomState(
        initial,
        {
          p1: [fullDeck.find((c) => c.id === 'teams_blue_1_0')!, fullDeck.find((c) => c.id === 'teams_blue_2_0')!],
          p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
          p3: [fullDeck.find((c) => c.id === 'teams_green_1_0')!], // p3 has 1 card
          p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
        },
        top
      );

      // Explicitly set p3 hasDeclaredUno to false
      const custom = {
        ...baseCustom,
        players: baseCustom.players.map((p) => (p.id === 'p3' ? { ...p, hasDeclaredUno: false } : p)),
      };

      // p1 calls UNO on behalf of teammate p3
      const res = adapter.processAction(custom, {
        type: 'CALL_UNO',
        playerId: 'p1',
        targetPlayerId: 'p3',
      });

      expect(res.nextState.players[2].hasDeclaredUno).toBe(true);
      assertValidTeamsGameState(res.nextState);
    });

    it('prevents challenging your own teammate for missed UNO', () => {
      const top = fullDeck.find((c) => c.id === 'teams_red_2_0')!;
      const initial = TeamsFixtureBuilder.createInitialGameFixture();
      const custom = {
        ...TeamsFixtureBuilder.setCustomState(
          initial,
          {
            p1: [fullDeck.find((c) => c.id === 'teams_blue_1_0')!],
            p2: [fullDeck.find((c) => c.id === 'teams_yellow_1_0')!],
            p3: [fullDeck.find((c) => c.id === 'teams_green_1_0')!],
            p4: [fullDeck.find((c) => c.id === 'teams_yellow_2_0')!],
          },
          top
        ),
        unoVulnerablePlayerId: 'p3',
      };

      // p1 tries to challenge their teammate p3
      expect(() => {
        adapter.processAction(custom, {
          type: 'CHALLENGE_UNO_FAILURE',
          challengerPlayerId: 'p1',
          targetPlayerId: 'p3',
        });
      }).toThrow(/cannot challenge your own teammate/i);
    });
  });
});
