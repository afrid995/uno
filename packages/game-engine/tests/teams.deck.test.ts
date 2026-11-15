import { describe, it, expect } from 'vitest';
import { TeamsDeckFactory } from '../src/variants/teams/teams.deck';
import { UNO_TEAMS_RULES, TEAMS_COLORS } from '../src/variants/teams/teams.constants';

describe('UNO Teams Deck Factory (Mattel Product HXT58)', () => {
  const deck = TeamsDeckFactory.createDeck();

  it('generates exactly 112 cards', () => {
    expect(deck.length).toBe(UNO_TEAMS_RULES.TOTAL_CARDS_IN_DECK);
    expect(deck.length).toBe(112);
  });

  it('ensures all cards have variant "uno_teams"', () => {
    expect(deck.every((c) => c.variant === 'uno_teams')).toBe(true);
  });

  it('ensures all card IDs are unique', () => {
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(112);
  });

  it('generates exactly 76 number cards (19 per color: 1x 0, 2x 1-9)', () => {
    const numberCards = deck.filter((c) => c.type === 'number');
    expect(numberCards.length).toBe(76);

    for (const color of TEAMS_COLORS) {
      const colorNumbers = numberCards.filter((c) => c.color === color);
      expect(colorNumbers.length).toBe(19);

      // Check 0
      const zeros = colorNumbers.filter((c) => c.value === '0');
      expect(zeros.length).toBe(1);
      expect(zeros[0].scoreValue).toBe(0);

      // Check 1-9
      for (let n = 1; n <= 9; n++) {
        const cardsOfN = colorNumbers.filter((c) => c.value === String(n));
        expect(cardsOfN.length).toBe(2);
        expect(cardsOfN[0].scoreValue).toBe(n);
        expect(cardsOfN[1].scoreValue).toBe(n);
      }
    }
  });

  it('generates exactly 36 passing symbol number cards (9 per color on 1-9)', () => {
    const passingCards = deck.filter((c) => c.hasPassingSymbol);
    expect(passingCards.length).toBe(36);

    for (const color of TEAMS_COLORS) {
      const colorPassing = passingCards.filter((c) => c.color === color);
      expect(colorPassing.length).toBe(9);
      for (let n = 1; n <= 9; n++) {
        expect(colorPassing.some((c) => c.value === String(n))).toBe(true);
      }
    }
  });

  it('generates exactly 24 action cards (8 Skip, 8 Reverse, 8 Draw Two: 2 per color)', () => {
    const actionCards = deck.filter((c) => c.type === 'action');
    expect(actionCards.length).toBe(24);

    for (const color of TEAMS_COLORS) {
      const skips = actionCards.filter((c) => c.color === color && c.value === 'skip');
      const reverses = actionCards.filter((c) => c.color === color && c.value === 'reverse');
      const drawTwos = actionCards.filter((c) => c.color === color && c.value === 'draw_two');

      expect(skips.length).toBe(2);
      expect(reverses.length).toBe(2);
      expect(drawTwos.length).toBe(2);

      expect(skips[0].scoreValue).toBe(20);
      expect(reverses[0].scoreValue).toBe(20);
      expect(drawTwos[0].scoreValue).toBe(20);
    }
  });

  it('generates exactly 12 Wild cards (4 Wild, 4 Wild Team Play, 4 Wild Team Draw Four)', () => {
    const wildCards = deck.filter((c) => c.type === 'wild');
    expect(wildCards.length).toBe(12);

    const standardWilds = wildCards.filter((c) => c.value === 'wild');
    const teamPlayWilds = wildCards.filter((c) => c.value === 'wild_team_play');
    const teamDrawFourWilds = wildCards.filter((c) => c.value === 'wild_team_draw_four');

    expect(standardWilds.length).toBe(4);
    expect(teamPlayWilds.length).toBe(4);
    expect(teamDrawFourWilds.length).toBe(4);

    expect(standardWilds.every((c) => c.scoreValue === 50 && c.color === null)).toBe(true);
    expect(teamPlayWilds.every((c) => c.scoreValue === 50 && c.color === null)).toBe(true);
    expect(teamDrawFourWilds.every((c) => c.scoreValue === 50 && c.color === null)).toBe(true);
  });
});
