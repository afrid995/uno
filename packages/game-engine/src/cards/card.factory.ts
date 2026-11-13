import {
  Card,
  CardColor,
  NumberCardValue,
  ActionCardValue,
  WildCardValue,
} from './card.types';

export class CardFactory {
  /**
   * Creates a standard numbered UNO card.
   * Point value equals face value (0-9).
   */
  static createNumberCard(
    color: CardColor,
    value: NumberCardValue,
    instanceIndex: number,
    variant = 'classic'
  ): Card {
    const scoreValue = parseInt(value, 10);
    return Object.freeze({
      id: `${variant}_${color}_${value}_${instanceIndex}`,
      color,
      value,
      type: 'number',
      scoreValue,
      variant,
    });
  }

  /**
   * Creates a colored Action card (Skip, Reverse, Draw Two).
   * Point value is 20 points per official Mattel rules.
   */
  static createActionCard(
    color: CardColor,
    value: ActionCardValue,
    instanceIndex: number,
    variant = 'classic'
  ): Card {
    return Object.freeze({
      id: `${variant}_${color}_${value}_${instanceIndex}`,
      color,
      value,
      type: 'action',
      scoreValue: 20,
      variant,
    });
  }

  /**
   * Creates a neutral Wild card (Wild, Wild Draw Four).
   * Point value is 50 points per official Mattel rules.
   */
  static createWildCard(
    value: WildCardValue,
    instanceIndex: number,
    variant = 'classic'
  ): Card {
    return Object.freeze({
      id: `${variant}_wild_${value}_${instanceIndex}`,
      color: null,
      value,
      type: 'wild',
      scoreValue: 50,
      variant,
    });
  }
}
