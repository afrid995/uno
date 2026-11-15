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
  /** Total default deck size with all 3 Wild Customizable cards included */
  TOTAL_DECK_SIZE: 112,
  /** Base non-customizable cards in GTX66 (72 numbers + 28 action + 4 wild + 4 attack-attack + 1 hit 4) */
  BASE_CARDS_COUNT: 109,
  DEFAULT_CUSTOMIZABLE_CARDS_COUNT: 3,
  /**
   * Official Mattel Product GTX66 rule (Page 3):
   * "Before the game begins, decide how many of these cards to include. You may use only 1 or all 3, it’s up to you."
   * Permitted counts are strictly 1 or 3 (decks of 110 or 112 cards). A 2-card setup is not an official rule.
   */
  PERMITTED_CUSTOMIZABLE_CARDS_COUNTS: [1, 3] as const,
  OFFICIAL_DECK_SIZES: {
    ONE_CUSTOMIZABLE: 110,
    THREE_CUSTOMIZABLE: 112,
  } as const,
  MISSED_UNO_PENALTY_PRESSES: 2,
} as const;

export function isValidAttackCustomizableCount(count: number): count is 1 | 3 {
  return count === 1 || count === 3;
}

export const ATTACK_SCORING = {
  NUMBER_CARD_FACE_VALUE: (val: string): number => {
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  },
  REVERSE: 20,
  SKIP: 20,
  HIT_2: 20,
  DISCARD_ALL: 30,
  /** Official Mattel GTX66 rule: Wild Hit 4 is worth 40 points (not 50) */
  WILD_HIT_4: 40,
  WILD: 50,
  WILD_ATTACK_ATTACK: 50,
  WILD_CUSTOMIZABLE: 50,
} as const;

/**
 * UNO Ultimate Virtual Launcher Simulation Policies.
 *
 * NOTE: The official Mattel GTX66 instruction sheet describes qualitative mechanical behavior:
 * "If no cards fly out, the lights and sounds will PULSE FASTER AND FASTER each time it's pressed...until BAM!
 * When cards finally launch, the player who pressed the button must add them to their hand."
 *
 * The numerical parameters below (discrete tension levels 0-4, probability thresholds, and burst limits)
 * are UNO Ultimate application-level simulation policies chosen for stability and game balance.
 * They do not claim to reproduce Mattel's proprietary internal hardware firmware.
 */
export const ATTACK_LAUNCHER_CONFIG = {
  /** Maximum number of cards that can be dispensed in a single mechanical burst (app policy) */
  MAX_BURST_CAPACITY: 12,
  /** Maximum tension/pulse stage before mandatory release (app policy) */
  MAX_TENSION_LEVEL: 4,
  /** Base launch probability per tension level (0 to 4) (app policy) */
  TENSION_PROBABILITIES: [0.30, 0.45, 0.60, 0.75, 0.95] as const,
  /** Number of launcher presses for each action card or rule penalty (official GTX66 rules) */
  PRESSES: {
    HIT_2: 2,
    WILD_HIT_4: 4,
    WILD_ATTACK_ATTACK: 2,
    MISSED_UNO_PENALTY: 2,
    VOLUNTARY_OR_UNPLAYABLE_TURN: 1,
  },
} as const;
