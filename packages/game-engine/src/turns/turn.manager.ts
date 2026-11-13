import { TurnDirection, reverseDirection } from './turn.direction';

export class TurnManager {
  /**
   * Calculates the next player index in sequence.
   * Handles clockwise and counter-clockwise rotation with proper modulo arithmetic.
   */
  static getNextPlayerIndex(
    currentIndex: number,
    playerCount: number,
    direction: TurnDirection,
    step = 1
  ): number {
    if (playerCount <= 1) return 0;
    const delta = direction === 'clockwise' ? step : -step;
    return (((currentIndex + delta) % playerCount) + playerCount) % playerCount;
  }

  /**
   * Resolves the turn progression after playing a card effect.
   * Special case per official Mattel rules:
   * In a 2-player game, playing a Reverse acts as a Skip (current player takes another turn).
   */
  static resolveNextTurn(
    currentIndex: number,
    playerCount: number,
    currentDirection: TurnDirection,
    effect: 'normal' | 'skip' | 'reverse' | 'draw_two' | 'draw_four'
  ): { nextIndex: number; newDirection: TurnDirection } {
    if (playerCount === 2) {
      if (effect === 'skip' || effect === 'reverse' || effect === 'draw_two' || effect === 'draw_four') {
        // In 2-player UNO, Skip, Reverse, Draw Two, and Wild Draw Four all grant the player another turn
        return { nextIndex: currentIndex, newDirection: currentDirection };
      }
      return {
        nextIndex: this.getNextPlayerIndex(currentIndex, playerCount, currentDirection, 1),
        newDirection: currentDirection,
      };
    }

    // Standard 3+ player rules
    let newDirection = currentDirection;
    let step = 1;

    switch (effect) {
      case 'reverse':
        newDirection = reverseDirection(currentDirection);
        step = 1;
        break;
      case 'skip':
      case 'draw_two':
      case 'draw_four':
        step = 2; // Next player is skipped, so jump 2 positions
        break;
      case 'normal':
      default:
        step = 1;
        break;
    }

    const nextIndex = this.getNextPlayerIndex(currentIndex, playerCount, newDirection, step);
    return { nextIndex, newDirection };
  }
}
