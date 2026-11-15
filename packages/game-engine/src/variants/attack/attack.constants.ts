/**
 * Official Mattel UNO Attack® Product GTX66 (©2020 Mattel, Inc.) Game Constants.
 * Authority: Mattel Customer Service Instruction Sheet GTX66-Eng.pdf.
 */

export const UNO_ATTACK_EDITION = {
  PRODUCT_NAME: 'UNO Attack®',
  PRODUCT_ID: 'GTX66',
  PRODUCT_CODE: 'GTX66-0970',
  COPYRIGHT: '©2020 Mattel. Mattel, Inc.',
  AUTHORITY_URL: 'https://service.mattel.com/instruction_sheets/GTX66-Eng.pdf',
} as const;

export const UNO_ATTACK_RULES = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  INITIAL_HAND_SIZE: 7,
  TARGET_WIN_SCORE: 500,
  TOTAL_DECK_SIZE: 112,
  MISSED_UNO_PENALTY_PRESSES: 2,
} as const;

export const ATTACK_SCORING = {
  NUMBER_CARD_FACE_VALUE: (val: string): number => {
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  },
  REVERSE: 20,
  SKIP: 20,
  HIT_2: 20,
  DISCARD_ALL: 30,
  WILD_HIT_4: 40,
  WILD: 50,
  WILD_ATTACK_ATTACK: 50,
  WILD_CUSTOMIZABLE: 50,
} as const;

export const ATTACK_LAUNCHER_CONFIG = {
  /** Maximum number of cards that can be dispensed in a single mechanical burst */
  MAX_BURST_CAPACITY: 12,
  /** Maximum tension/pulse stage before mandatory release */
  MAX_TENSION_LEVEL: 4,
  /** Base launch probability per tension level (0 to 4) */
  TENSION_PROBABILITIES: [0.30, 0.45, 0.60, 0.75, 0.95] as const,
  /** Number of launcher presses for each action card or rule penalty */
  PRESSES: {
    HIT_2: 2,
    WILD_HIT_4: 4,
    WILD_ATTACK_ATTACK: 2,
    MISSED_UNO_PENALTY: 2,
    VOLUNTARY_OR_UNPLAYABLE_TURN: 1,
  },
} as const;
