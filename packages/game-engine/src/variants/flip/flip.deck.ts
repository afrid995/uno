import {
  Card,
  CardFace,
  FlipSide,
  NumberCardValue,
  PhysicalFlipCard,
} from '../../cards/card.types';
import { FLIP_LIGHT_COLORS, FLIP_DARK_COLORS, UNO_FLIP_RULES } from './flip.constants';

export class FlipDeckFactory {
  /**
   * Generates the 112 Light Side face definitions per Mattel GDR44.
   * Total = 72 numbers (1-9 across 4 colors, 2 each)
   *       + 8 Draw One (2 each in 4 colors)
   *       + 8 Reverse (2 each in 4 colors)
   *       + 8 Skip (2 each in 4 colors)
   *       + 8 Flip (2 each in 4 colors - resolving English inventory discrepancy)
   *       + 4 Wild
   *       + 4 Wild Draw Two
   *       = 112 faces
   */
  static generateLightFaces(): CardFace[] {
    const faces: CardFace[] = [];

    // 1. Number cards (1 to 9, two of each per color - NO 0s in UNO Flip)
    for (const color of FLIP_LIGHT_COLORS) {
      for (let n = 1; n <= 9; n++) {
        const val = String(n) as NumberCardValue;
        faces.push({ color, value: val, type: 'number', scoreValue: n });
        faces.push({ color, value: val, type: 'number', scoreValue: n });
      }
    }

    // 2. Action cards (Draw One, Reverse, Skip, Flip - two of each per color)
    for (const color of FLIP_LIGHT_COLORS) {
      // Draw One (2 cards per color - 10 points per official GDR44)
      faces.push({ color, value: 'draw_one', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_DRAW_ONE_POINTS });
      faces.push({ color, value: 'draw_one', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_DRAW_ONE_POINTS });

      // Reverse (2 cards per color - 20 points per official GDR44)
      faces.push({ color, value: 'reverse', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_REVERSE_POINTS });
      faces.push({ color, value: 'reverse', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_REVERSE_POINTS });

      // Skip (2 cards per color - 20 points per official GDR44)
      faces.push({ color, value: 'skip', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_SKIP_POINTS });
      faces.push({ color, value: 'skip', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_SKIP_POINTS });

      // Flip (2 cards per color = 8 total - 20 points per official GDR44)
      faces.push({ color, value: 'flip', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_FLIP_POINTS });
      faces.push({ color, value: 'flip', type: 'action', scoreValue: UNO_FLIP_RULES.LIGHT_FLIP_POINTS });
    }

    // 3. Wild cards
    for (let i = 0; i < 4; i++) {
      faces.push({ color: null, value: 'wild', type: 'wild', scoreValue: UNO_FLIP_RULES.LIGHT_WILD_POINTS });
    }

    // 4. Wild Draw Two cards
    for (let i = 0; i < 4; i++) {
      faces.push({
        color: null,
        value: 'wild_draw_two',
        type: 'wild',
        scoreValue: UNO_FLIP_RULES.LIGHT_WILD_DRAW_TWO_POINTS,
      });
    }

    return faces;
  }

  /**
   * Generates the 112 Dark Side face definitions per Mattel GDR44.
   * Total = 72 numbers (1-9 across 4 dark colors, 2 each)
   *       + 8 Draw Five (2 each in 4 colors)
   *       + 8 Reverse (2 each in 4 colors)
   *       + 8 Skip Everyone (2 each in 4 colors)
   *       + 8 Flip (2 each in 4 colors)
   *       + 4 Wild
   *       + 4 Wild Draw Color
   *       = 112 faces
   */
  static generateDarkFaces(): CardFace[] {
    const faces: CardFace[] = [];

    // 1. Number cards (1 to 9, two of each per dark color - NO 0s in UNO Flip)
    for (const color of FLIP_DARK_COLORS) {
      for (let n = 1; n <= 9; n++) {
        const val = String(n) as NumberCardValue;
        faces.push({ color, value: val, type: 'number', scoreValue: n });
        faces.push({ color, value: val, type: 'number', scoreValue: n });
      }
    }

    // 2. Action cards (Draw Five, Reverse, Skip Everyone, Flip - two of each per color)
    for (const color of FLIP_DARK_COLORS) {
      // Draw Five (2 cards per color - 20 points per official GDR44)
      faces.push({ color, value: 'draw_five', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_DRAW_FIVE_POINTS });
      faces.push({ color, value: 'draw_five', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_DRAW_FIVE_POINTS });

      // Reverse (2 cards per color - 20 points per official GDR44)
      faces.push({ color, value: 'reverse', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_REVERSE_POINTS });
      faces.push({ color, value: 'reverse', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_REVERSE_POINTS });

      // Skip Everyone (2 cards per color - 30 points per official GDR44)
      faces.push({
        color,
        value: 'skip_everyone',
        type: 'action',
        scoreValue: UNO_FLIP_RULES.DARK_SKIP_EVERYONE_POINTS,
      });
      faces.push({
        color,
        value: 'skip_everyone',
        type: 'action',
        scoreValue: UNO_FLIP_RULES.DARK_SKIP_EVERYONE_POINTS,
      });

      // Flip (2 cards per color = 8 total - 20 points per official GDR44)
      faces.push({ color, value: 'flip', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_FLIP_POINTS });
      faces.push({ color, value: 'flip', type: 'action', scoreValue: UNO_FLIP_RULES.DARK_FLIP_POINTS });
    }

    // 3. Wild cards
    for (let i = 0; i < 4; i++) {
      faces.push({ color: null, value: 'wild', type: 'wild', scoreValue: UNO_FLIP_RULES.DARK_WILD_POINTS });
    }

    // 4. Wild Draw Color cards
    for (let i = 0; i < 4; i++) {
      faces.push({
        color: null,
        value: 'wild_draw_color',
        type: 'wild',
        scoreValue: UNO_FLIP_RULES.DARK_WILD_DRAW_COLOR_POINTS,
      });
    }

    return faces;
  }

  /**
   * Creates the authoritative 112 double-sided physical cards for UNO Flip.
   * Every physical card represents one physical entity with a stable card ID,
   * a Light Side face, and a Dark Side face.
   */
  static createFlipDeck(): PhysicalFlipCard[] {
    const lightFaces = this.generateLightFaces();
    const darkFaces = this.generateDarkFaces();

    if (lightFaces.length !== 112 || darkFaces.length !== 112) {
      throw new Error(
        `Invalid face count for UNO Flip deck: Light=${lightFaces.length}, Dark=${darkFaces.length}. Expected 112 each.`
      );
    }

    const cards: PhysicalFlipCard[] = [];

    for (let i = 0; i < 112; i++) {
      const id = `flip_c_${String(i + 1).padStart(3, '0')}`;
      const light = lightFaces[i];
      const dark = darkFaces[i];

      cards.push({
        id,
        variant: 'uno_flip',
        color: light.color,
        value: light.value,
        type: light.type,
        scoreValue: light.scoreValue,
        lightFace: light,
        darkFace: dark,
        currentSide: 'LIGHT',
      });
    }

    return cards;
  }

  /**
   * Flips a physical card to reveal the specified side ('LIGHT' | 'DARK').
   * Retains the stable card ID while updating active color, value, type, and scoreValue.
   */
  static flipCard(card: Card, newSide: FlipSide): Card {
    if (!card.lightFace || !card.darkFace) {
      return card;
    }

    const activeFace = newSide === 'LIGHT' ? card.lightFace : card.darkFace;

    return {
      ...card,
      color: activeFace.color,
      value: activeFace.value,
      type: activeFace.type,
      scoreValue: activeFace.scoreValue,
      currentSide: newSide,
    };
  }
}
