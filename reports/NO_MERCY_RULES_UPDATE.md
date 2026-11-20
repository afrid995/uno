# UNO Show ’em No Mercy — Rules Update & Critical Stacking Bug Fix Report

## 1. Executive Summary

This engineering report documents the comprehensive implementation, verification, and regression auditing for three rule modifications and bug fixes applied exclusively to **UNO Show ’em No Mercy** in UNO Ultimate:

1. **Player Elimination Threshold Update:**
   - Modified the Mercy Rule elimination condition across the entire engine and game lifecycle from `>= 25` cards to strictly greater than 25 cards (`> 25`).
   - A player holding exactly 25 cards remains **active**; holding 26 or more cards results in immediate, server-authoritative **elimination**.
2. **Replacement of Wild Color Roulette with Standard Wild Color Change:**
   - Completely excised the Wild Color Roulette card, mechanics, action handlers, event definitions, schemas, client modals, and render elements.
   - Replaced all 8 roulette cards in the No Mercy deck with 8 standard Wild Color Change cards (`type: 'wild'`, `value: 'wild'`) adhering to Classic UNO behavior: player selects a chosen color (`red`, `blue`, `green`, `yellow`), active color is updated, and turn advances to the next player without card penalties or turn skips.
   - Preserved the exact 168-card No Mercy deck composition and left the other six UNO variants completely unaffected.
3. **Wild Draw 4 + Wild Reverse Draw 4 Stacking Bug Fix:**
   - Corrected the pending penalty targeting when a player counters a Draw Four / Wild Draw Four (+4) by stacking a Wild Reverse Draw Four (+4).
   - Under the required custom rules, the accumulated 8-card penalty targets the player who stacked the Wild Reverse Draw Four (Player B), reverses the play direction, and advances turns cleanly without stale states, phantom penalties, or double-draws.

All changes were strictly confined to the No Mercy variant within the server-authoritative engine (`@uno-ultimate/game-engine`), backend server handlers (`@uno-ultimate/server`), shared protocol schemas (`@uno-ultimate/game-protocol`), and web frontend client components (`@uno-ultimate/web`).

---

## 2. Root-Cause Analysis & Architectural Diagnostics

### 2.1 Elimination Threshold Analysis
- **Previous Implementation:**
  In `packages/game-engine/src/variants/no-mercy/no-mercy.invariants.ts`, `no-mercy.actions.ts`, and `no-mercy.fixture.ts`, the Mercy Rule limit check was evaluated as `player.hand.length >= UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT` where `MERCY_HAND_LIMIT = 25`. This prematurely eliminated players who drew or held exactly 25 cards.
- **Root Cause:**
  The check used greater-than-or-equal (`>=`) comparison instead of strictly greater-than (`>`).
- **Correction:**
  Updated all elimination gates (`processDrawCard`, `processStackAccept`, `processChallengeUno`, `setHandSize`, and `assertValidNoMercyGameState`) to `player.hand.length > UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT`.

### 2.2 Wild Color Roulette Card Removal
- **Previous Implementation:**
  The 168-card No Mercy deck included 8 `wild_color_roulette` cards. When played, the engine set `state.pendingActionState = { type: 'AWAITING_COLOR_ROULETTE_SELECTION', ... }`, requiring the player to invoke `chooseColorRouletteColor`, which drew cards for the next player until matching the designated color.
- **Root Cause & Rationale:**
  The custom rules specify standard Wild Color Change for No Mercy instead of roulette mechanics.
- **Correction:**
  Substituted the 8 `wild_color_roulette` cards in `no-mercy.deck.ts` with 8 standard `'wild'` cards. Removed the `AWAITING_COLOR_ROULETTE_SELECTION` pending action, `drawUntilColor` generator, protocol event `GAME_CHOOSE_ROULETTE_COLOR`, server handler, client store action `chooseRouletteColor`, and `ColorRouletteModal.tsx`.

### 2.3 Wild Draw 4 + Wild Reverse Draw 4 Stacking Bug
- **Previous Implementation:**
  When Player A played Draw Four and Player B responded by stacking Wild Reverse Draw Four, the reverse logic inverted direction (`clockwise` -> `counter_clockwise`) and calculated the next target using `getNextActivePlayerIndex(playerIndex, updatedPlayers, nextDirection, 1)`. In a 3-player match (Alice [0], Bob [1], Charlie [2]), reversing from Bob counter-clockwise targeted Alice [0], rather than holding Bob accountable for the rebound.
- **Root Cause:**
  The engine uniformly routed all reverse cards to the adjacent player in the newly reversed direction without accommodating the custom rule where stacking a Wild Reverse Draw Four onto an incoming Draw Four / Wild Draw Four rebounds the entire accumulated 8-card penalty onto Player B (the stacker).
- **Correction:**
  In `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts` within `processStackPlay`:
  ```typescript
  if (
    card.value === 'wild_reverse_draw_four' &&
    (pending.lastCardValue === 'draw_four' || pending.lastCardValue === 'wild_draw_four')
  ) {
    nextTargetIndex = playerIndex;
  }
  ```
  Player B is now targeted with `accumulatedPenalty: 8`, `currentPlayerIndex: playerIndex`, and `lastCardValue: 'wild_reverse_draw_four'`. When Player B accepts the penalty, they receive 8 cards, and play continues in the newly reversed direction.

---

## 3. Implementation Details by Phase

### Phase 1: Elimination Threshold Update
- **Engine Rules (`no-mercy.invariants.ts`, `no-mercy.actions.ts`):**
  - Updated `assertValidNoMercyGameState`:
    ```typescript
    if (player.hand.length > UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT) {
      throw new Error(`Player ${player.id} has ${player.hand.length} cards, exceeding mercy limit of 25.`);
    }
    ```
  - Updated `processDrawCard`, `processStackAccept`, and `processChallengeUno`:
    Checked `newHand.length > UNO_NO_MERCY_RULES.MERCY_HAND_LIMIT` before invoking `applyMercyElimination`.
  - Updated `NoMercyFixtureBuilder.setHandSize` validation to allow active players with `1` to `25` cards (`targetCount > 25` throws error for active players).

### Phase 2: Elimination of Roulette & Replacement with Classic Wild
- **Deck Configuration (`no-mercy.deck.ts`):**
  - Replaced:
    ```typescript
    cards.push({ id: `nm_wcr_${i + 1}`, color: 'wild', type: 'wild', value: 'wild_color_roulette', variant: 'uno_show_em_no_mercy' });
    ```
    with:
    ```typescript
    cards.push({ id: `nm_wild_${i + 1}`, color: 'wild', type: 'wild', value: 'wild', variant: 'uno_show_em_no_mercy' });
    ```
  - Total deck size remains exactly **168 cards**.
- **Action Processing (`no-mercy.actions.ts`):**
  - Removed `AWAITING_COLOR_ROULETTE_SELECTION` and `processColorRouletteSelection`.
  - Standard Wild cards in No Mercy now execute standard flow: require `chosenColor`, set `state.activeColor = action.chosenColor`, zero card penalty, and advance turn to the next player.
- **Protocol & Server (`events.ts`, `game.service.ts`, `game.socket.handler.ts`):**
  - Removed `GAME_CHOOSE_ROULETTE_COLOR` socket event, `chooseRouletteColorInputSchema`, and server dispatch handler.
- **Web Frontend (`GameBoard.tsx`, `PlayingCard.tsx`, `gameStore.ts`):**
  - Deleted `ColorRouletteModal.tsx`.
  - Removed roulette modal references in `GameBoard.tsx`.
  - Updated `PlayingCard.tsx` to remove roulette badge rendering and ensure standard wild card artwork renders smoothly.
  - Removed `chooseRouletteColor` from `gameStore.ts`.

### Phase 3: Stacking Fix for Wild Draw 4 + Wild Reverse Draw 4
- **Engine Stacking Logic (`no-mercy.actions.ts`):**
  - Stacking check verifies: incoming penalty was `draw_four` or `wild_draw_four` (+4), stacked card is `wild_reverse_draw_four` (+4).
  - Accumulated penalty becomes 8.
  - Turn direction flips (`clockwise` <-> `counter_clockwise`).
  - Target index is assigned to `playerIndex` (Player B).
  - Invariants confirm `targetPlayerId === playerB.id`, `currentPlayerIndex === playerIndex`, and `pendingActionState.accumulatedPenalty === 8`.
  - Acceptance flows cleanly: Player B accepts penalty via `GAME_ACCEPT_STACK_PENALTY`, receives 8 cards, and turn passes to the next player in the reversed direction.

---

## 4. Cross-Variant Regression Safety Matrix

The implementation was checked against all 7 variants in UNO Ultimate to guarantee absolute variant isolation:

| Variant | Deck Count | Draw Mechanics | Stacking Allowed | Mercy Rule | Special Wild Cards |
|---|---|---|---|---|---|
| **Classic UNO** | 108 cards | Draw 1, can play drawn card | No stacking | No elimination | Wild, Wild Draw 4 |
| **UNO Flip** | 112 cards | Light/Dark side mechanics | No stacking | No elimination | Flip, Wild, Wild Draw 2, Wild Draw Color |
| **UNO All Wild** | 112 cards | All wild cards | Action stacking | No elimination | Wild Reverse, Wild Skip, Forced Swap, Targeted Draw 2 |
| **UNO Flex** | 112 cards | Regular & Flex powers | Flex stacking | No elimination | Flex Wild Draw 4, Flex All Draw, Target Draw 2 |
| **UNO Teams** | 112 cards | Team pass / team play | Team stacking | No elimination | Wild Team Play, Wild Team Draw 4 |
| **UNO Attack** | 112 cards | Electronic Launcher (0-N cards)| No stacking | No elimination | Wild Attack-Attack, Wild Hit 4, Discard All |
| **UNO Show ’em No Mercy** | 168 cards | Draw until match / stack | Stacking up to +10 | **> 25 cards eliminated** | Wild (+0), Wild Draw 4, Wild Reverse Draw 4, Wild Draw 6, Wild Draw 10 |

---

## 5. Deck Composition & Distribution Verification

No Mercy deck composition was verified through automated tests (`tests/no-mercy.deck.test.ts`):

- **Total Deck Size:** Exactly 168 cards.
- **Card Distribution:**
  - Number Cards (0–9 across 4 colors): 76 cards (including extra 0s and 7s for pass/swap mechanics)
  - Color Action Cards:
    - Skip: 8 cards (2 per color)
    - Reverse: 8 cards (2 per color)
    - Draw Two: 8 cards (2 per color)
    - Draw Four: 8 cards (2 per color)
    - Discard All: 8 cards (2 per color)
    - Skip Everyone: 8 cards (2 per color)
  - Wild Cards:
    - Standard Wild: 8 cards (replaced 8 Wild Color Roulette cards)
    - Wild Reverse Draw Four: 8 cards
    - Wild Draw Six: 8 cards
    - Wild Draw Ten: 8 cards
  - Wild Color Roulette cards: **0 cards** (completely removed).

---

## 6. Automated Test Suite Results

All tests across all workspace packages ran with 100% pass rates:

### 6.1 Game Engine (`@uno-ultimate/game-engine`)
```
Test Files  30 passed (30)
Tests       414 passed (414)
Duration    3.14s
```
- `no-mercy.rules.test.ts`: 41 tests passing (including elimination boundary tests at 24, 25, 26, 27 cards, standard wild card flows, and Wild Draw 4 + Wild Reverse Draw 4 stacking penalty targeting).
- `no-mercy.deck.test.ts`: 6 tests passing (verifying 168 cards, 8 standard wild cards, 0 roulette cards).
- All other 28 test suites for Classic, Flip, Flex, Teams, All Wild, and Attack passing without errors.

### 6.2 Backend Server (`@uno-ultimate/server`)
```
Test Files  25 passed (25)
Tests       175 passed (175)
Duration    53.10s
```
- `game.no-mercy.wild-reverse-draw4.test.ts`: 2 integration tests passing (testing 3-player and 2-player socket flows with real database transactions, turn reversal, penalty accumulation to +8, Player B targeting, penalty acceptance, and Mercy Rule elimination).
- `interaction-reliability.socket.test.ts`: 23 socket tests passing.
- `game.start-performance.socket.test.ts`: 8 socket tests passing.

### 6.3 Web Client (`@uno-ultimate/web`)
```
Test Files  28 passed (28)
Tests       156 passed (156)
Duration    42.32s
```
- `NoMercyModals.test.tsx`: 4 tests passing (verifying SevenSwapModal and MercyEliminationBanner).
- `PlayingCard.no-mercy.test.tsx`: 5 tests passing (verifying standard Wild, Wild Draw 6, Wild Draw 10, Wild Reverse Draw 4, and Discard All).
- All component, modal, chat, and animation suites passing.

---

## 7. Build, Typecheck, and Lint Quality Gates

| Quality Gate | Command | Result | Details |
|---|---|---|---|
| **Typecheck** | `pnpm -r typecheck` | **PASS** | 0 type errors across shared, game-engine, game-protocol, database, server, web |
| **Lint** | `pnpm -r lint` | **PASS** | 0 errors, 0 warnings across all workspaces |
| **Build** | `pnpm build` | **PASS** | Full clean build of shared, game-engine, game-protocol, database, server, web |

---

## 8. Modified & Deleted Files Summary

| File | Change Type | Description |
|---|---|---|
| `packages/game-engine/src/variants/no-mercy/no-mercy.deck.ts` | Modified | Replaced 8 `wild_color_roulette` with 8 standard `wild` cards |
| `packages/game-engine/src/variants/no-mercy/no-mercy.constants.ts` | Modified | Updated constants and documentation |
| `packages/game-engine/src/variants/no-mercy/no-mercy.invariants.ts` | Modified | Updated Mercy Rule check to `> 25` cards; removed roulette invariant |
| `packages/game-engine/src/variants/no-mercy/no-mercy.fixture.ts` | Modified | Allowed up to 25 cards in `setHandSize` for active players |
| `packages/game-engine/src/variants/no-mercy/no-mercy.validator.ts` | Modified | Removed roulette action validation; standard wild requires `chosenColor` |
| `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts` | Modified | Implemented `> 25` threshold, standard wild handling, and WRD4 stacking target fix |
| `packages/game-engine/src/projections/player-state.ts` | Modified | Removed `canChooseRouletteColor` projection |
| `packages/game-engine/src/cards/card.types.ts` | Modified | Removed `wild_color_roulette` from `ALL_WILD_VALUES` |
| `packages/game-engine/tests/no-mercy.deck.test.ts` | Modified | Tested 8 standard wild cards and 0 roulette cards |
| `packages/game-engine/tests/no-mercy.rules.test.ts` | Modified | Added tests for `> 25` elimination, standard wild, and WRD4 stacking |
| `packages/game-protocol/src/events.ts` | Modified | Removed `GAME_CHOOSE_ROULETTE_COLOR` socket event and payload schema |
| `apps/server/src/modules/game/game.service.ts` | Modified | Removed roulette action dispatcher and handlers |
| `apps/server/src/modules/game/game.socket.handler.ts` | Modified | Removed socket listener for roulette event |
| `apps/server/tests/integration/game.no-mercy.wild-reverse-draw4.test.ts` | Modified | Updated integration tests to verify custom WRD4 stacking rule and `> 25` elimination |
| `apps/server/tests/integration/game.start-performance.socket.test.ts` | Modified | Updated opening hand assertions for initial draw effects |
| `apps/server/tests/integration/interaction-reliability.socket.test.ts` | Modified | Replaced roulette socket test with No Mercy stacking idempotency test |
| `apps/web/src/features/game/components/ColorRouletteModal.tsx` | **Deleted** | Removed dead roulette UI component |
| `apps/web/src/features/game/components/GameBoard.tsx` | Modified | Removed roulette modal import and JSX rendering |
| `apps/web/src/features/game/components/PlayingCard.tsx` | Modified | Removed roulette label/rendering |
| `apps/web/src/features/game/components/__tests__/NoMercyModals.test.tsx` | Modified | Removed roulette modal tests |
| `apps/web/src/features/game/components/__tests__/PlayingCard.no-mercy.test.tsx` | Modified | Tested standard Wild card rendering |
| `apps/web/src/stores/gameStore.ts` | Modified | Removed `chooseRouletteColor` action |

---

## 9. Git Verification & Push Details

- **Branch:** `main`
- **Commit Message:** `feat(no-mercy): update elimination threshold to >25, replace roulette with classic wild, and fix reverse draw 4 stacking penalty target`
- **Clean Push:** Pushed to `origin/main` without force-pushing.
