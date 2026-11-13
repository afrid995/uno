export type TurnDirection = 'clockwise' | 'counter_clockwise';

export function reverseDirection(direction: TurnDirection): TurnDirection {
  return direction === 'clockwise' ? 'counter_clockwise' : 'clockwise';
}
