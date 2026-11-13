import { describe, it, expect } from 'vitest';
import { TurnManager } from '../src/turns/turn.manager';
import { reverseDirection } from '../src/turns/turn.direction';

describe('Turn Management Verification', () => {
  describe('Standard 3+ Player Turns', () => {
    it('progresses clockwise: 0 -> 1 -> 2 -> 3 -> 0', () => {
      expect(TurnManager.getNextPlayerIndex(0, 4, 'clockwise', 1)).toBe(1);
      expect(TurnManager.getNextPlayerIndex(1, 4, 'clockwise', 1)).toBe(2);
      expect(TurnManager.getNextPlayerIndex(2, 4, 'clockwise', 1)).toBe(3);
      expect(TurnManager.getNextPlayerIndex(3, 4, 'clockwise', 1)).toBe(0);
    });

    it('progresses counter-clockwise: 0 -> 3 -> 2 -> 1 -> 0', () => {
      expect(TurnManager.getNextPlayerIndex(0, 4, 'counter_clockwise', 1)).toBe(3);
      expect(TurnManager.getNextPlayerIndex(3, 4, 'counter_clockwise', 1)).toBe(2);
      expect(TurnManager.getNextPlayerIndex(2, 4, 'counter_clockwise', 1)).toBe(1);
      expect(TurnManager.getNextPlayerIndex(1, 4, 'counter_clockwise', 1)).toBe(0);
    });

    it('handles Skip effect: advances 2 positions, skipping the next player', () => {
      const res = TurnManager.resolveNextTurn(0, 4, 'clockwise', 'skip');
      expect(res.nextIndex).toBe(2);
      expect(res.newDirection).toBe('clockwise');

      const ccwRes = TurnManager.resolveNextTurn(0, 4, 'counter_clockwise', 'skip');
      expect(ccwRes.nextIndex).toBe(2); // 0 - 2 = -2 -> 2 in modulo 4
      expect(ccwRes.newDirection).toBe('counter_clockwise');
    });

    it('handles Reverse effect: reverses direction and steps 1 position in new direction', () => {
      const res = TurnManager.resolveNextTurn(1, 4, 'clockwise', 'reverse');
      expect(res.newDirection).toBe('counter_clockwise');
      expect(res.nextIndex).toBe(0); // from index 1, going counter_clockwise steps to 0

      const res2 = TurnManager.resolveNextTurn(0, 4, 'counter_clockwise', 'reverse');
      expect(res2.newDirection).toBe('clockwise');
      expect(res2.nextIndex).toBe(1); // from index 0, going clockwise steps to 1
    });

    it('handles Draw Two and Wild Draw Four: steps 2 positions past the penalized player', () => {
      const d2 = TurnManager.resolveNextTurn(0, 4, 'clockwise', 'draw_two');
      expect(d2.nextIndex).toBe(2);

      const d4 = TurnManager.resolveNextTurn(0, 4, 'clockwise', 'draw_four');
      expect(d4.nextIndex).toBe(2);
    });
  });

  describe('Official 2-Player UNO Special Rules', () => {
    it('Reverse acts as a Skip in 2-player UNO (current player gets another turn)', () => {
      const p0 = TurnManager.resolveNextTurn(0, 2, 'clockwise', 'reverse');
      expect(p0.nextIndex).toBe(0); // Player 0 plays again

      const p1 = TurnManager.resolveNextTurn(1, 2, 'clockwise', 'reverse');
      expect(p1.nextIndex).toBe(1); // Player 1 plays again
    });

    it('Skip grants current player another turn in 2-player UNO', () => {
      const p0 = TurnManager.resolveNextTurn(0, 2, 'clockwise', 'skip');
      expect(p0.nextIndex).toBe(0);

      const p1 = TurnManager.resolveNextTurn(1, 2, 'clockwise', 'skip');
      expect(p1.nextIndex).toBe(1);
    });

    it('Draw Two and Wild Draw Four grant current player another turn in 2-player UNO', () => {
      const d2 = TurnManager.resolveNextTurn(0, 2, 'clockwise', 'draw_two');
      expect(d2.nextIndex).toBe(0);

      const d4 = TurnManager.resolveNextTurn(1, 2, 'clockwise', 'draw_four');
      expect(d4.nextIndex).toBe(1);
    });

    it('Number card alternates turns in 2-player UNO: 0 -> 1 -> 0', () => {
      const normal0 = TurnManager.resolveNextTurn(0, 2, 'clockwise', 'normal');
      expect(normal0.nextIndex).toBe(1);

      const normal1 = TurnManager.resolveNextTurn(1, 2, 'clockwise', 'normal');
      expect(normal1.nextIndex).toBe(0);
    });
  });

  describe('reverseDirection utility', () => {
    it('flips direction accurately', () => {
      expect(reverseDirection('clockwise')).toBe('counter_clockwise');
      expect(reverseDirection('counter_clockwise')).toBe('clockwise');
    });
  });
});
