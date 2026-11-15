import { describe, it, expect } from 'vitest';
import { TeamsFixtureBuilder } from '../src/variants/teams/teams.fixture';
import { TeamsDeckFactory } from '../src/variants/teams/teams.deck';
import { assertValidTeamsGameState } from '../src/variants/teams/teams.invariants';

describe('UNO Teams Fixture Builder', () => {
  it('creates a valid initial game state with 4 players in 2 teams', () => {
    const state = TeamsFixtureBuilder.createInitialGameFixture();
    expect(state.variant).toBe('uno_teams');
    expect(state.players.length).toBe(4);
    expect(state.players[0].teamId).toBe('team_1');
    expect(state.players[1].teamId).toBe('team_2');
    expect(state.players[2].teamId).toBe('team_1');
    expect(state.players[3].teamId).toBe('team_2');

    // Setup step 6: begins with AWAITING_TEAM_INITIAL_PASS
    expect(state.pendingActionState?.type).toBe('AWAITING_TEAM_INITIAL_PASS');
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);

    assertValidTeamsGameState(state);
  });

  it('completes initial pass transitioning state to live play', () => {
    const initial = TeamsFixtureBuilder.createInitialGameFixture();
    const live = TeamsFixtureBuilder.completeInitialPass(initial);

    expect(live.pendingActionState).toBeNull();
    expect(live.status).toBe('IN_PROGRESS');
    expect(live.players.every((p) => p.hand.length === 7)).toBe(true);
    assertValidTeamsGameState(live);
  });

  it('sets custom state maintaining 112 cards conservation', () => {
    const deck = TeamsDeckFactory.createDeck();
    const c1 = deck.find((c) => c.id === 'teams_red_5_0')!;
    const c2 = deck.find((c) => c.id === 'teams_blue_7_0')!;
    const top = deck.find((c) => c.id === 'teams_red_0_0')!;

    const initial = TeamsFixtureBuilder.createInitialGameFixture();
    const custom = TeamsFixtureBuilder.setCustomState(
      initial,
      {
        p1: [c1],
        p2: [c2],
        p3: [],
        p4: [],
      },
      top
    );

    expect(custom.players[0].hand[0].id).toBe(c1.id);
    expect(custom.players[1].hand[0].id).toBe(c2.id);
    expect(custom.topDiscardCard.id).toBe(top.id);
    expect(custom.players[2].isOut).toBe(true);
    expect(custom.players[3].isOut).toBe(true);

    assertValidTeamsGameState(custom);
  });
});
