import { Card, ClassicCardColor } from '../../cards/card.types';

export type AttackColor = ClassicCardColor;

export interface AttackLauncherResult {
  readonly playerId: string;
  readonly totalPresses: number;
  readonly cardsLaunched: number;
  readonly cards: readonly Card[];
  readonly newTension: number;
  readonly previousTension: number;
  readonly timestamp: number;
}
