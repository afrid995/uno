import { describe, it, expect } from 'vitest';
import { Card } from '../src/cards/card.types';
import { sortPlayerHand, COLOR_ORDER_MAP } from '../src/cards/card.sort';

describe('Player Hand Sorting & Organization Engine', () => {
  it('correctly sorts cards by color: Red -> Blue -> Green -> Yellow -> Wild', () => {
    const cards: Card[] = [
      { id: 'w1', color: null, type: 'wild', value: 'wild', scoreValue: 50, variant: 'classic' },
      { id: 'y1', color: 'yellow', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
      { id: 'g1', color: 'green', type: 'number', value: '2', scoreValue: 2, variant: 'classic' },
      { id: 'b1', color: 'blue', type: 'number', value: '8', scoreValue: 8, variant: 'classic' },
      { id: 'r1', color: 'red', type: 'number', value: '1', scoreValue: 1, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(cards);
    expect(sorted.map((c) => c.color)).toEqual(['red', 'blue', 'green', 'yellow', null]);
    expect(sorted.map((c) => c.id)).toEqual(['r1', 'b1', 'g1', 'y1', 'w1']);
  });

  it('sorts numeric cards in ascending order within the same color group', () => {
    const cards: Card[] = [
      { id: 'r9', color: 'red', type: 'number', value: '9', scoreValue: 9, variant: 'classic' },
      { id: 'r0', color: 'red', type: 'number', value: '0', scoreValue: 0, variant: 'classic' },
      { id: 'r3', color: 'red', type: 'number', value: '3', scoreValue: 3, variant: 'classic' },
      { id: 'r7', color: 'red', type: 'number', value: '7', scoreValue: 7, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(cards);
    expect(sorted.map((c) => c.value)).toEqual(['0', '3', '7', '9']);
  });

  it('places action cards after numeric cards within the same color group', () => {
    const cards: Card[] = [
      { id: 'b_skip', color: 'blue', type: 'action', value: 'skip', scoreValue: 20, variant: 'classic' },
      { id: 'b7', color: 'blue', type: 'number', value: '7', scoreValue: 7, variant: 'classic' },
      { id: 'b_d2', color: 'blue', type: 'action', value: 'draw_two', scoreValue: 20, variant: 'classic' },
      { id: 'b1', color: 'blue', type: 'number', value: '1', scoreValue: 1, variant: 'classic' },
      { id: 'b_rev', color: 'blue', type: 'action', value: 'reverse', scoreValue: 20, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(cards);
    // Numbers 1, 7 first; then actions draw_two, reverse, skip
    expect(sorted.map((c) => c.value)).toEqual(['1', '7', 'draw_two', 'reverse', 'skip']);
  });

  it('groups all Wild cards after colored cards and sorts them consistently', () => {
    const cards: Card[] = [
      { id: 'wd4', color: null, type: 'wild', value: 'wild_draw_four', scoreValue: 50, variant: 'classic' },
      { id: 'g4', color: 'green', type: 'number', value: '4', scoreValue: 4, variant: 'classic' },
      { id: 'w_plain', color: null, type: 'wild', value: 'wild', scoreValue: 50, variant: 'classic' },
      { id: 'r2', color: 'red', type: 'number', value: '2', scoreValue: 2, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(cards);
    expect(sorted.map((c) => c.id)).toEqual(['r2', 'g4', 'w_plain', 'wd4']);
  });

  it('preserves duplicate cards with stable ordering', () => {
    const cards: Card[] = [
      { id: 'r5_b', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
      { id: 'r5_a', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
      { id: 'wd4_2', color: null, type: 'wild', value: 'wild_draw_four', scoreValue: 50, variant: 'classic' },
      { id: 'wd4_1', color: null, type: 'wild', value: 'wild_draw_four', scoreValue: 50, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(cards);
    expect(sorted.length).toBe(4);
    expect(sorted.map((c) => c.id)).toEqual(['r5_a', 'r5_b', 'wd4_1', 'wd4_2']);
  });

  it('correctly handles UNO Flip cards in both Light and Dark modes', () => {
    // In Dark mode, colors are pink, teal, orange, purple
    const darkCards: Card[] = [
      { id: 'wdc', color: null, type: 'wild', value: 'wild_draw_color', scoreValue: 60, variant: 'uno_flip', currentSide: 'DARK' },
      { id: 'pur_5', color: 'purple', type: 'number', value: '5', scoreValue: 5, variant: 'uno_flip', currentSide: 'DARK' },
      { id: 'teal_3', color: 'teal', type: 'number', value: '3', scoreValue: 3, variant: 'uno_flip', currentSide: 'DARK' },
      { id: 'pink_7', color: 'pink', type: 'number', value: '7', scoreValue: 7, variant: 'uno_flip', currentSide: 'DARK' },
      { id: 'ora_9', color: 'orange', type: 'number', value: '9', scoreValue: 9, variant: 'uno_flip', currentSide: 'DARK' },
      { id: 'w_flip', color: null, type: 'wild', value: 'wild', scoreValue: 40, variant: 'uno_flip', currentSide: 'DARK' },
    ];

    const sortedDark = sortPlayerHand(darkCards);
    // Order: pink -> teal -> orange -> purple -> Wild (score 40) -> Wild Draw Color (score 60)
    expect(sortedDark.map((c) => c.id)).toEqual(['pink_7', 'teal_3', 'ora_9', 'pur_5', 'w_flip', 'wdc']);
  });

  it('correctly sorts UNO Show em No Mercy hands with high-impact cards', () => {
    const noMercyCards: Card[] = [
      { id: 'nm_wd10', color: null, type: 'wild', value: 'wild_draw_ten', scoreValue: 50, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_r_d4', color: 'red', type: 'action', value: 'draw_four', scoreValue: 20, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_r_0', color: 'red', type: 'number', value: '0', scoreValue: 0, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_r_da', color: 'red', type: 'action', value: 'discard_all', scoreValue: 20, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_w_plain', color: null, type: 'wild', value: 'wild', scoreValue: 50, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_wd6', color: null, type: 'wild', value: 'wild_draw_six', scoreValue: 50, variant: 'uno_show_em_no_mercy' },
      { id: 'nm_wrd4', color: null, type: 'wild', value: 'wild_reverse_draw_four', scoreValue: 50, variant: 'uno_show_em_no_mercy' },
    ];

    const sorted = sortPlayerHand(noMercyCards);
    // Red 0 -> Red Draw 4 -> Red Discard All -> Wild -> Wild Reverse Draw 4 -> Wild Draw 6 -> Wild Draw 10
    expect(sorted.map((c) => c.value)).toEqual([
      '0',
      'draw_four',
      'discard_all',
      'wild',
      'wild_reverse_draw_four',
      'wild_draw_six',
      'wild_draw_ten',
    ]);
  });

  it('safely handles empty hand or single card without crashing', () => {
    expect(sortPlayerHand([])).toEqual([]);
    const single: Card = { id: 'c1', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'classic' };
    expect(sortPlayerHand([single])).toEqual([single]);
  });

  it('safely handles cards with undefined or missing color/scoreValue', () => {
    const weirdCards: Card[] = [
      { id: 'w1', color: undefined as any, type: 'number', value: '2', scoreValue: undefined as any, variant: 'classic' },
      { id: 'r1', color: 'red', type: 'number', value: '5', scoreValue: 5, variant: 'classic' },
    ];

    const sorted = sortPlayerHand(weirdCards);
    expect(sorted.length).toBe(2);
    expect(sorted[0].id).toBe('r1');
    expect(sorted[1].id).toBe('w1');
  });
});
