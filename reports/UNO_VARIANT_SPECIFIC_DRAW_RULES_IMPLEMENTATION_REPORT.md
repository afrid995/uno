# UNO Ultimate — Variant-Specific Draw Rules Implementation & Compliance Report

**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Scope:** All 7 playable variants (Classic UNO, UNO Flip, UNO Show 'em No Mercy, UNO All Wild, UNO Flex, UNO Teams, UNO Attack)  
**Date:** November 16, 2026  
**Status:** COMPLETE & VERIFIED

---

## 1. Executive Summary & Objective

In the preceding refactoring phase, automatic force-play was globally removed across the application to ensure players always have agency over whether to play a newly drawn card. However, a single universal draw mechanic does not reflect the game design requirements of UNO Ultimate:

1. **Custom Rules Variants:**
   - **UNO Flip:** Follows owner's custom specification: normal draw draws exactly **1 card**. If playable, player is offered a choice to **Play Drawn Card** or **Keep Card / End Turn (`PASS_TURN`)**. If unplayable, turn automatically advances to the next player.
   - **UNO Show 'em No Mercy:** Follows owner's custom specification: normal draw draws exactly **1 card** (completely eliminating the official draw-until-playable loop). If playable, player is offered a choice to **Play Drawn Card** or **Keep Card / End Turn (`PASS_TURN`)**. If unplayable, turn automatically advances to the next player. The player may never play an older card from hand during this draw decision. All other No Mercy features (Mercy Rule hand limit >= 25, stacking +2/+4/+6/+10/Wild Reverse Draw 4, 7 swap, 0 pass, Color Roulette, Discard All) remain fully intact.
2. **Official Mattel Rules Variants:**
   - **Classic UNO (Mattel 42001):** Player draws 1 card. If playable, they may play it immediately or pass their turn (`PASS_TURN`). If unplayable, turn ends immediately and passes to next player. Older hand cards cannot be played after drawing. Penalty cards (+2, +4) force victim to draw and forfeit turn.
   - **UNO All Wild (Mattel HHL33):** All cards are wild. Player draws 1 wild card. They may choose to play it immediately or pass their turn (`PASS_TURN`). Pre-existing hand cards cannot be played after drawing.
   - **UNO Flex (Mattel HNB00):** Player draws 1 card. If the card matches in regular color/action or via flex side (when the player holds a green flex status), the player may play it or pass (`PASS_TURN`). If unplayable, turn immediately ends and passes to next player.
   - **UNO Teams (Mattel HXT58):** Player draws 1 card. If playable, player may play it or pass (`PASS_TURN`). If unplayable, turn immediately ends and passes to next player. Team Pass / Show conventions remain strictly governed.
   - **UNO Attack (Mattel GTX66):** Pressing the Attack Launcher button completes the draw turn immediately. If 0 cards are launched, turn ends immediately. If 1 or more cards are launched, the player adds all launched cards to hand, and their **turn ends immediately**. Per official Mattel GTX66 rules, launched cards **cannot** be played during the same turn.

---

## 2. Variant-by-Variant Draw Rules Comparison Matrix

| Variant | Official Product Code | Draw Trigger | Draw Quantity | Playable Drawn Card Action | Unplayable Drawn Card Action | Can Keep / Pass Turn? | Can Play Older Card from Hand? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **UNO Flip** | Custom (Owner Spec) | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | Auto-advances turn immediately | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **UNO Show 'em No Mercy** | Custom (Owner Spec) | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | Auto-advances turn immediately | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **Classic UNO** | Mattel 42001 | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | Turn ends immediately | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **UNO All Wild** | Mattel HHL33 | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | N/A (all cards wild/playable) | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **UNO Flex** | Mattel HNB00 | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | Turn ends immediately | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **UNO Teams** | Mattel HXT58 | Draw Pile Click | Exactly 1 card | Play Drawn Card OR Keep (Pass) | Turn ends immediately | **Yes (`PASS_TURN`)** | **No** (Only drawn card) |
| **UNO Attack** | Mattel GTX66 | Launcher Press | 0 or variable (dispensed) | **No play allowed**; turn ends immediately | Turn ends immediately | **No** (Turn auto-ends) | **No** |

---

## 3. Architecture & Implementation Details

### 3.1. Projection Layer (`packages/game-engine/src/projections/player-state.ts`)
- Previously, `canPass` was explicitly barred for `uno_show_em_no_mercy`:
  ```typescript
  // Before:
  const canPass =
    isCurrentTurn &&
    player.hasDrawnThisTurn &&
    state.status === 'IN_PROGRESS' &&
    !isPendingAction &&
    state.variant !== 'uno_show_em_no_mercy';
  ```
- Updated to remove the exclusion:
  ```typescript
  // After:
  const canPass =
    isCurrentTurn &&
    player.hasDrawnThisTurn &&
    state.status === 'IN_PROGRESS' &&
    !isPendingAction;
  ```
- This ensures that whenever a player has drawn a playable card and holds decision rights, `canPass: true` is accurately projected to the frontend UI across both custom rules variants (Flip and No Mercy) and official variants (Classic, All Wild, Flex, Teams).

### 3.2. No Mercy Engine Custom Draw & Pass Logic (`packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`)
- Replaced `drawUntilPlayable` in `processDrawCard` with single card draw:
  ```typescript
  // Custom Rule for UNO No Mercy: Normal draw draws exactly ONE card
  const { drawnCards, newDrawPile, newDiscardPile, newSetAsideCards } = this.drawCards(
    state.drawPile,
    state.discardPile,
    1,
    state.setAsideCards || [],
    rng
  );
  ```
- Validated Mercy Rule elimination upon drawing 1 card (if hand size reaches >= 25 cards).
- Evaluated whether the drawn card matches current discard top/color:
  - **Case A (Playable):** Retains turn with active player (`hasDrawnThisTurn: true`, `drawnCardId: drawnCard.id`). Emits `CARD_DRAWN` event with `isPlayable: true`.
  - **Case B (Unplayable):** Advances turn immediately to next active (uneliminated) player (`currentPlayerIndex = getNextActivePlayerIndex(...)`).
- Implemented `processPassTurn` action handler:
  - Resets `hasDrawnThisTurn: false` and `drawnCardId: null`.
  - Advances `currentPlayerIndex` to the next active player.
  - Increments `sequenceNumber` and `turnNumber`.
  - Enforces `assertValidNoMercyGameState`.

### 3.3. No Mercy Move Validator (`packages/game-engine/src/variants/no-mercy/no-mercy.validator.ts`)
- Updated `validate(state, action)` to route `case 'PASS_TURN'` to `validatePassTurn`.
- Implemented `validatePassTurn`:
  - Verifies that it is the player's turn (`currentPlayer.id === playerId`).
  - Verifies that the player has drawn a card this turn (`currentPlayer.hasDrawnThisTurn`).
  - Enforces rejection if a player attempts to pass without drawing first (`code: 'INVALID_PASS'`).
- Enforces strict card isolation in `validatePlayCard`:
  - If `currentPlayer.hasDrawnThisTurn` is true, the played card ID must strictly match `currentPlayer.drawnCardId`. Attempting to play an older card from hand is rejected with `code: 'MUST_PLAY_DRAWN_CARD'`.

---

## 4. Test Verification & Results

### 4.1. Comprehensive Variant-Specific Test Suite (`packages/game-engine/tests/draw-card-variants.test.ts`)
The comprehensive test suite covers 23 targeted scenarios across all 7 variants and shared invariants:
1. **UNO Flip — Custom Rules (Owner Spec):**
   - Normal draw draws exactly 1 card.
   - Drawn playable card retains turn, offers Play vs Keep (`canPass === true`), does NOT auto-play.
   - Drawn playable card kept via `PASS_TURN`: retains card and advances turn to next player.
   - Drawn unplayable card automatically advances turn to next player.
2. **UNO Show 'em No Mercy — Custom Rules (Owner Spec):**
   - Normal draw draws exactly 1 card and completely eliminates the draw-until-playable loop.
   - Drawn playable card retains turn, offers Play vs Keep (`canPass === true`), does NOT auto-play.
   - Player can pass turn (`PASS_TURN`) after drawing playable card.
   - Playing an older card from hand during draw decision is strictly rejected (`MUST_PLAY_DRAWN_CARD`).
   - Stacking rules (+2, +4, +6, +10, Wild Reverse Draw 4) and penalties remain fully preserved.
3. **Classic UNO — Official Mattel 42001 Rules:**
   - Draws 1 card; if playable, player may play it or pass; turn remains active.
   - Draws unplayable card: adds to hand and immediately ends turn.
   - Explicit play of drawn card discards card and advances turn.
   - Penalty draws (+2) force next player to draw 2 cards and forfeit turn.
4. **UNO All Wild — Official Mattel HHL33 Rules:**
   - Draws 1 wild card; player may play it or pass per HHL33.
   - Rejects playing older card from hand after drawing.
5. **UNO Flex — Official Mattel HNB00 Rules:**
   - Draws 1 card; if regular or flex match with green check, keeps turn and allows choice.
   - Draws unplayable card: immediately ends turn and advances to next player.
6. **UNO Teams — Official Mattel HXT58 Rules:**
   - Draws 1 card; if playable, keeps turn and allows choice; if unplayable, advances turn.
7. **UNO Attack — Official Mattel GTX66 Rules:**
   - Pressing launcher with 0 cards launched: turn ends immediately.
   - Pressing launcher with 1+ cards launched: cards added to hand, turn ends immediately, launched cards cannot be played.
8. **Shared Regression & Integrity Invariants:**
   - Rejects duplicate draw attempts within the same turn (`code: 'ALREADY_DRAWN'`).
   - Rejects passing when player has not drawn (`code: 'INVALID_PASS'`).
   - Draw state fields (`hasDrawnThisTurn`, `drawnCardId`) reset cleanly across turn completions and round transitions.

### 4.2. Monorepo Quality Gate Verification

| Package | Test Command | Files | Tests | Result |
| :--- | :--- | :--- | :--- | :--- |
| `@uno-ultimate/game-engine` | `pnpm --filter @uno-ultimate/game-engine test` | 29 | 386 | **ALL 386 PASSED** |
| `@uno-ultimate/server` | `pnpm --filter @uno-ultimate/server test` | 19 | 117 | **ALL 117 PASSED** |
| `@uno-ultimate/web` | `pnpm --filter @uno-ultimate/web test` | 23 | 103 | **ALL 103 PASSED** |
| **Monorepo Total** | `pnpm test` | **71** | **606** | **ALL 606 PASSED** |

### 4.3. Typecheck, Lint, and Build Gates
- **Typecheck:** `pnpm -r typecheck` exited with code 0 (0 errors).
- **Lint:** `pnpm -r lint` exited with code 0 (0 errors, 0 warnings).
- **Build:** `pnpm build` exited with code 0:
  - `@uno-ultimate/shared`: ESM + CJS + DTS built cleanly.
  - `@uno-ultimate/game-engine`: ESM + CJS + DTS built cleanly.
  - `@uno-ultimate/game-protocol`: ESM + CJS + DTS built cleanly.
  - `@uno-ultimate/database`: Prisma Client generated + CJS/ESM built cleanly.
  - `@uno-ultimate/server`: Bundled server built cleanly.
  - `@uno-ultimate/web`: Production Vite bundle compiled cleanly.

---

## 5. Conclusion & Next Steps

All 7 UNO variants now enforce their exact specified draw rules without regression or force-play side-effects. The hybrid design seamlessly integrates custom rules for UNO Flip and UNO No Mercy alongside strict Mattel rules fidelity for Classic UNO, UNO All Wild, UNO Flex, UNO Teams, and UNO Attack. All monorepo packages are fully built and verified ready for production deployment.
