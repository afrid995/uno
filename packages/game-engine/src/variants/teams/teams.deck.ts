import { Card, NumberCardValue } from '../../cards/card.types';
import { TEAMS_COLORS, getTeamsCardScore, UNO_TEAMS_RULES } from './teams.constants';

export class TeamsDeckFactory {
  static createDeck(): Card[] {
    const deck: Card[] = [];

    // 1. Number Cards (76 total)
    for (const color of TEAMS_COLORS) {
      // One 0 card
      deck.push({
        id: `teams_${color}_0_0`,
        color,
        value: '0',
        type: 'number',
        scoreValue: 0,
        variant: 'uno_teams',
        hasPassingSymbol: false,
      });

      // Two of each 1-9
      for (let num = 1; num <= 9; num++) {
        const valStr = String(num) as NumberCardValue;
        // First copy: standard
        deck.push({
          id: `teams_${color}_${num}_0`,
          color,
          value: valStr,
          type: 'number',
          scoreValue: num,
          variant: 'uno_teams',
          hasPassingSymbol: false,
        });
        // Second copy: has passing symbol
        deck.push({
          id: `teams_${color}_${num}_1`,
          color,
          value: valStr,
          type: 'number',
          scoreValue: num,
          variant: 'uno_teams',
          hasPassingSymbol: true,
        });
      }
    }

    // 2. Action Cards (24 total: 2 Skips, 2 Reverses, 2 Draw Twos per color)
    for (const color of TEAMS_COLORS) {
      for (let i = 0; i < 2; i++) {
        deck.push({
          id: `teams_${color}_skip_${i}`,
          color,
          value: 'skip',
          type: 'action',
          scoreValue: getTeamsCardScore('action', 'skip'),
          variant: 'uno_teams',
        });
        deck.push({
          id: `teams_${color}_reverse_${i}`,
          color,
          value: 'reverse',
          type: 'action',
          scoreValue: getTeamsCardScore('action', 'reverse'),
          variant: 'uno_teams',
        });
        deck.push({
          id: `teams_${color}_draw_two_${i}`,
          color,
          value: 'draw_two',
          type: 'action',
          scoreValue: getTeamsCardScore('action', 'draw_two'),
          variant: 'uno_teams',
        });
      }
    }

    // 3. Wild Cards (12 total: 4 Wild, 4 Wild Team Play, 4 Wild Team Draw Four)
    for (let i = 0; i < 4; i++) {
      deck.push({
        id: `teams_wild_${i}`,
        color: null,
        value: 'wild',
        type: 'wild',
        scoreValue: getTeamsCardScore('wild', 'wild'),
        variant: 'uno_teams',
      });
      deck.push({
        id: `teams_wild_team_play_${i}`,
        color: null,
        value: 'wild_team_play',
        type: 'wild',
        scoreValue: getTeamsCardScore('wild', 'wild_team_play'),
        variant: 'uno_teams',
      });
      deck.push({
        id: `teams_wild_team_draw_four_${i}`,
        color: null,
        value: 'wild_team_draw_four',
        type: 'wild',
        scoreValue: getTeamsCardScore('wild', 'wild_team_draw_four'),
        variant: 'uno_teams',
      });
    }

    if (deck.length !== UNO_TEAMS_RULES.TOTAL_CARDS_IN_DECK) {
      throw new Error(
        `Teams deck generation failed: expected ${UNO_TEAMS_RULES.TOTAL_CARDS_IN_DECK} cards, got ${deck.length}`
      );
    }

    return deck;
  }
}
