/**
 * Official Mattel Classic UNO Rules Reference
 *
 * Source: Mattel UNO Official Rules Sheet (Standard 108-card Edition).
 *
 * Rules Summary:
 * 1. Deck Composition:
 *    - 108 cards total:
 *      - 76 Number cards (0-9 across 4 colors: Red, Yellow, Green, Blue. One 0 and two of 1-9 per color).
 *      - 24 Action cards (Skip, Reverse, Draw Two: two of each per color).
 *      - 8 Wild cards (4 Wild, 4 Wild Draw Four).
 * 2. Setup:
 *    - 2 to 10 players.
 *    - 7 cards dealt to each player.
 *    - 1 card turned over to start discard pile.
 * 3. Starting Card Effects:
 *    - Wild Draw Four: returned to deck, reshuffled, next card flipped.
 *    - Wild: first player chooses starting color.
 *    - Draw Two: first player draws 2 cards and skips turn.
 *    - Reverse: direction begins counter-clockwise.
 *    - Skip: first player skipped.
 * 4. 2-Player Special Rules:
 *    - Reverse acts as a Skip (current player takes another immediate turn).
 *    - Skip gives current player another turn.
 *    - Draw Two gives opponent 2 cards and gives current player another turn.
 * 5. Card Matching:
 *    - Play on color, number, or symbol.
 *    - Wild can be played on any card.
 *    - Wild Draw Four: legally playable only if player holds NO cards of the active color.
 * 6. Drawing:
 *    - If no card is playable, player draws 1 card.
 *    - Player may play the drawn card immediately if it matches, or pass.
 * 7. Calling "UNO":
 *    - When player has only 1 card remaining in hand, they must announce "UNO".
 *    - Failure to call UNO before next player begins turn incurs 2 penalty cards if caught.
 * 8. Scoring:
 *    - Number cards (0-9): Face value (0-9 points).
 *    - Draw Two, Skip, Reverse: 20 points each.
 *    - Wild, Wild Draw Four: 50 points each.
 */

export const CLASSIC_UNO_RULES = {
  EDITION: 'Mattel Classic UNO (108-card canonical edition)',
  DECK_SIZE: 108,
  INITIAL_HAND_SIZE: 7,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  TARGET_WIN_SCORE: 500,
  ACTION_CARD_POINTS: 20,
  WILD_CARD_POINTS: 50,
} as const;
