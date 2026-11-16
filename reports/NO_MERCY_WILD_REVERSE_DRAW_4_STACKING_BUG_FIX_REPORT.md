# UNO ULTIMATE — UNO SHOW 'EM NO MERCY
## Wild Reverse Draw 4 Stacking on Draw 4 Bug Fix Report

**Project:** UNO Ultimate — Server-Authoritative Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Bug ID:** `BUG-NO-MERCY-WILD-REVERSE-DRAW-4-STACKING`  
**Variant:** UNO Show ’em No Mercy (Mattel HWV18)  

---

## 1. Executive Summary & Defect Description

### 1.1 The Reported Defect
In **UNO Show ’em No Mercy**, when a player played a **Wild Draw 4** (or colored Draw 4), an opponent targeted by the draw penalty was prevented from playing a **Wild Reverse Draw 4** card to stack the penalty.

Specifically:
1. **Frontend Discrepancy:** The **Wild Reverse Draw 4** card was dimmed/disabled in the targeted player's hand because `playableCardIds` in the player game state projection omitted the card.
2. **Backend Rejection:** If the client attempted to play the card anyway over Socket.IO, the server rejected the action with:
   ```text
   INVALID_CARD_MATCH: Card wild_reverse_draw_four is not an eligible Draw Card (+2, +4, +6, +10) and cannot be stacked onto an active Draw penalty.
   ```
3. **Missing Direction Reversal on Stack:** Even if the card had been accepted, the stack resolution processor did not reverse `turnDirection` or update the target player according to the reversed flow of play.

### 1.2 Core Constraints Respected
- **Strict Adherence to Mattel HWV18 Rules:** Official instruction sheet explicitly lists Wild Reverse Draw 4 as a +4 Draw Card eligible for stacking.
- **Variant Isolation:** No modifications affected Classic UNO, UNO Flip, UNO All Wild, UNO Flex, UNO Teams, or UNO Attack.
- **Production Safety:** All monorepo builds, typechecks, linter rules, and test suites across all packages passed with zero errors.
- **₹0/Month Hosting Budget:** No new external dependencies or database schema modifications were required.

---

## 2. Official Mattel HWV18 Rules Authority

According to the official **Mattel UNO Show ’em No Mercy (HWV18)** instructions:

### 2.1 Stacking Rule
> *"If someone plays a Draw Card against you (+2, +4, Wild Reverse Draw 4, +6, +10), you can 'Stack' the penalty by playing another Draw Card from your hand of equal or higher value. For example, if someone plays a +2 on you, you can play a +2, +4, Wild Reverse Draw 4, +6, or +10. If someone plays a +4 on you, you can play a +4, Wild Reverse Draw 4, +6, or +10, but not a +2."*

### 2.2 Draw Card Numerical Value Hierarchy
| Card Type | Value | Stacking Eligibility |
| :--- | :--- | :--- |
| **Draw 2** (`draw_two`) | **+2** | Can be stacked onto +2. Cannot be stacked onto +4, +6, +10. |
| **Draw 4** (`draw_four`, `wild_draw_four`) | **+4** | Can be stacked onto +2 or +4. |
| **Wild Reverse Draw 4** (`wild_reverse_draw_four`) | **+4** | Can be stacked onto +2 or +4. Reverses direction & passes penalty. |
| **Wild Draw 6** (`wild_draw_six`) | **+6** | Can be stacked onto +2, +4, or +6. |
| **Wild Draw 10** (`wild_draw_ten`) | **+10** | Can be stacked onto +2, +4, +6, or +10. |

### 2.3 Wild Reverse Draw 4 Card Behavior When Stacked
1. **Draw Penalty Accumulation:** Adds +4 to the pending accumulated penalty (e.g. 4 + 4 = 8).
2. **Direction Reversal:** The play direction immediately reverses (e.g., `clockwise` $\rightarrow$ `counter_clockwise`).
3. **Penalty Redirection:** The accumulated penalty passes to the next eligible active player in the newly reversed direction.
4. **Rebound Rule in 2-Player Games:** In a 2-player game, Reverse acts as a Skip. The penalty rebounds back to the player who played the Wild Reverse Draw 4, who must then stack an eligible Draw card (+4, +6, +10) or accept the penalty.

---

## 3. Root Cause Analysis Across the Stack

A trace through the game engine and backend server revealed five interrelated points of failure:

### 3.1 Constant Definition Defect (`packages/game-engine/src/variants/no-mercy/no-mercy.constants.ts`)
In Phase 6.1, an erroneous assumption was recorded claiming:
```typescript
// Old erroneous code:
// "Wild Reverse Draw 4 is an Action card with its own reverse + draw 4 instruction
// (and 2-player rebound rule); it is NOT a generally eligible Stacking Draw Card"
export function getNoMercyStackCardValue(cardValue: string): number | null {
  switch (cardValue) {
    case 'draw_two': return 2;
    case 'draw_four': return 4;
    // Missing 'wild_draw_four' and 'wild_reverse_draw_four'!
    ...
    default: return null;
  }
}
```
Because `getNoMercyStackCardValue('wild_reverse_draw_four')` returned `null`, the card was treated as a non-stack card across all rules logic. Furthermore, `wild_draw_four` was also missing from this switch.

### 3.2 Frontend State Projection Suppression (`packages/game-engine/src/projections/player-state.ts`)
The projection function `getPlayerGameState` calculates `playableCardIds` by testing each card in the player's hand. When an active stack penalty exists (`pendingActionState.type === 'AWAITING_STACK_RESOLUTION'`), it checks `getNoMercyDrawValue(card)`. Since `getNoMercyStackCardValue` returned `null`, `getNoMercyDrawValue` returned `null`. As a result, the card was deemed unplayable (`isPlayable = false`), dimming it on the frontend client.

### 3.3 Move Validator Rejection (`packages/game-engine/src/variants/no-mercy/no-mercy.validator.ts`)
When receiving a move during an active stack, `NoMercyMoveValidator.validatePendingAction` called `getNoMercyStackCardValue(card.value)`. Receiving `null`, it threw:
```typescript
return {
  valid: false,
  code: 'INVALID_CARD_MATCH',
  message: `Card ${card.value} is not an eligible Draw Card (+2, +4, +6, +10) and cannot be stacked onto an active Draw penalty.`,
};
```

### 3.4 Missing Direction Reversal on Stack (`packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`)
In `NoMercyActionProcessor.processStackPlay`:
```typescript
// Old code:
const turnDirection = state.turnDirection;
const nextTargetIndex = this.getNextActivePlayerIndex(playerIndex, state.players, turnDirection, 1);
```
Even if a Wild Reverse Draw 4 had been validated, the action processor did not reverse `state.turnDirection`. It passed the penalty in the existing direction rather than the reversed direction.

---

## 4. Implementation Details

### 4.1 Updated Stacking & Penalty Evaluation (`packages/game-engine/src/variants/no-mercy/no-mercy.constants.ts`)
```typescript
export function getNoMercyDrawPenalty(cardValue: string): number | null {
  switch (cardValue) {
    case 'draw_two':
      return 2;
    case 'draw_four':
    case 'wild_draw_four':
    case 'wild_reverse_draw_four':
      return 4;
    case 'wild_draw_six':
      return 6;
    case 'wild_draw_ten':
      return 10;
    default:
      return null;
  }
}

export function getNoMercyStackCardValue(cardValue: string): number | null {
  switch (cardValue) {
    case 'draw_two':
      return 2;
    case 'draw_four':
    case 'wild_draw_four':
    case 'wild_reverse_draw_four':
      return 4;
    case 'wild_draw_six':
      return 6;
    case 'wild_draw_ten':
      return 10;
    default:
      return null;
  }
}
```

### 4.2 Reversal & Dynamic Targeting in Stack Play (`packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`)
In `processStackPlay`:
```typescript
let turnDirection = state.turnDirection;
if (card.value === 'wild_reverse_draw_four') {
  turnDirection = reverseDirection(turnDirection);
  ctx.addEvent('DIRECTION_REVERSED', player.id, { turnDirection });
}

const nextTargetIndex = this.getNextActivePlayerIndex(playerIndex, state.players, turnDirection, 1);
const nextTargetPlayer = state.players[nextTargetIndex];

const nextPendingState: PendingActionState = {
  type: 'AWAITING_STACK_RESOLUTION',
  targetPlayerId: nextTargetPlayer.id,
  accumulatedPenalty: (pending.accumulatedPenalty ?? 0) + stackValue,
  lastStackedValue: stackValue,
  penaltyCardType: card.value,
  eligibleCardTypes: this.getEligibleStackCardTypes(stackValue),
};

return {
  ...nextState,
  turnDirection,
  currentPlayerIndex: nextTargetIndex,
  pendingActionState: nextPendingState,
};
```

### 4.3 Validation Error Message Update (`packages/game-engine/src/variants/no-mercy/no-mercy.validator.ts`)
Updated the error message to explicitly include Wild Reverse Draw 4:
```typescript
message: `Card ${card.value} is not an eligible Draw Card (+2, +4, +6, +10, Wild Reverse Draw 4) and cannot be stacked onto an active Draw penalty.`
```

---

## 5. Comprehensive Test Verification

### 5.1 Engine Unit & Rules Tests (`packages/game-engine/tests/no-mercy.rules.test.ts`)
Added comprehensive test coverage:
- **Stack on Draw 2 (+6):** Player B stacks Wild Reverse Draw 4 on a +2 penalty; penalty accumulates to 6, direction reverses, and penalty passes to next player in reversed direction.
- **Stack on Draw 4 (+8):** Player B stacks Wild Reverse Draw 4 on Draw 4; penalty accumulates to 8, direction reverses, and penalty targets Player A in counter-clockwise direction.
- **Counter-Reversal Stacking (+12):** Player A stacks another Wild Reverse Draw 4; direction reverses back to clockwise, penalty accumulates to 12, targeting Player B.
- **Higher Card Stacking (+18):** Player B stacks Wild Draw 6 (+6 $\ge$ 4); penalty accumulates to 18, targeting Player C.
- **Rejection of Lower Cards:** Verified that Player C cannot stack +4 (Draw 4 or Wild Reverse Draw 4) onto +6, verifying projection (`playableCardIds` excludes the card) and validator rejection.
- **Rejection of Non-Draw Cards:** Skips and regular numbers rejected during active stack.
- **Mercy Elimination on Acceptance:** When Player C accepts 18 cards, hand exceeds 25 cards resulting in Mercy Rule elimination.
- **Result:** `36/36 tests passed`.

### 5.2 Multiplayer Socket.IO Integration Tests (`apps/server/tests/integration/`)
1. **Dedicated Wild Reverse Draw 4 Test Suite (`game.no-mercy.wild-reverse-draw4.test.ts`):**
   - Full 3-player online match over WebSocket simulating real client connections.
   - P1 plays Draw 4 $\rightarrow$ P2 stacks Wild Reverse Draw 4 (+8, reversed to P1) $\rightarrow$ P1 stacks second Wild Reverse Draw 4 (+12, reversed back to P2) $\rightarrow$ P2 stacks Wild Draw 6 (+18 to P3) $\rightarrow$ P3 attempts invalid stack (rejected) $\rightarrow$ P3 accepts 18 cards and is eliminated via Mercy Rule.
   - 2-player rebound match over WebSocket verifying rebound penalty escalation and resolution.
   - `2/2 passed`.
2. **Updated No Mercy Socket Suite (`game.no-mercy.socket.test.ts`):**
   - Verified 2-player rebound stacking where P1 stacks second Wild Reverse Draw 4 on +4 rebound penalty: asserts success, accumulated penalty 8, reversal to P2, rejection of non-draw cards, stacking Draw 4 to 12, and penalty acceptance.
   - `7/7 passed`.
3. **Cross-Variant Socket Isolation Hardening:**
   - Fixed room cleanup and ID filtering in `game.flex.socket.test.ts` and `game.attack.socket.test.ts`.

---

## 6. Monorepo Quality Gate Results

| Package / Verification Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Game Engine Tests** | `pnpm --filter @uno-ultimate/game-engine test` | **PASS (Code 0)** | 28 test files, 363 tests passed |
| **Server Socket Tests** | `pnpm --filter @uno-ultimate/server test` | **PASS (Code 0)** | 19 test files, 117 tests passed |
| **Web Frontend Tests** | `pnpm --filter @uno-ultimate/web test` | **PASS (Code 0)** | 23 test files, 103 tests passed |
| **TypeScript Typecheck** | `pnpm -r typecheck` | **PASS (Code 0)** | 6 packages passed with 0 errors |
| **ESLint** | `pnpm -r lint` | **PASS (Code 0)** | 0 warnings, 0 errors |
| **Production Build** | `pnpm build` | **PASS (Code 0)** | All packages bundled cleanly |

---

## 7. Modified & Created Files Summary

| File Path | Action | Description |
| :--- | :--- | :--- |
| `packages/game-engine/src/variants/no-mercy/no-mercy.constants.ts` | Modified | Added `wild_draw_four` and `wild_reverse_draw_four` to `getNoMercyStackCardValue` and `getNoMercyDrawPenalty`. |
| `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts` | Modified | Handled direction reversal when stacking `wild_reverse_draw_four` in `processStackPlay`. |
| `packages/game-engine/src/variants/no-mercy/no-mercy.validator.ts` | Modified | Updated error message to include Wild Reverse Draw 4 as an eligible stacking card. |
| `packages/game-engine/tests/no-mercy.rules.test.ts` | Modified | Replaced outdated rejection test with comprehensive multi-tier stacking & reversal rules suite. |
| `apps/server/tests/integration/game.no-mercy.socket.test.ts` | Modified | Updated 2-player rebound stacking test to verify valid Wild Reverse Draw 4 stacking over Socket.IO. |
| `apps/server/tests/integration/game.no-mercy.wild-reverse-draw4.test.ts` | Created | Comprehensive multiplayer Socket.IO integration suite for 3-player and 2-player Wild Reverse Draw 4 stacking. |
| `apps/server/tests/integration/game.attack.socket.test.ts` | Modified | Fixed turn guest ID extraction for robust suite isolation. |
| `apps/server/tests/integration/game.flex.socket.test.ts` | Modified | Added room leave cleanups and room ID filtering for robust suite isolation. |
| `reports/NO_MERCY_WILD_REVERSE_DRAW_4_STACKING_BUG_FIX_REPORT.md` | Created | Full technical audit and verification documentation report. |
