# UNO ULTIMATE — PHASE 8 IMPLEMENTATION REPORT
# UNO FLEX: OFFICIAL RULES, ENGINE ARCHITECTURE, POWER CARDS, DUAL-COLOR SIDES & MULTIPLAYER INTEGRATION

**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `45d9d8e873f7ca8ebbdcd673837956b5a43347f2`  
**Phase:** Phase 8 — UNO Flex Official Variant Implementation  
**Official Rule Authority:** Mattel UNO Flex Card Game (Product HNB00 / HMY99, `HNB00-Eng-2024.pdf`)  
**Product Line Authority:** Mattel Inc., 2022/2024  
**Phase 8 Implementation Commit:** `52e6f5a74ac63ec3e3dc26ebf6f94028017f7c14`  

---

## 1. Executive Summary & Rule Authority

Phase 8 implements the complete, server-authoritative, real-time multiplayer variant **UNO Flex** into UNO Ultimate. Built strictly upon the official Mattel rules (Product HNB00 / HMY99 `HNB00-Eng-2024.pdf`), this implementation delivers the dual-side tactical flexibility, Power Card management, and flip mechanics that characterize UNO Flex:

1. **Exact 112-Card Physical Inventory:**
   - **8 Double-Sided Power Cards:** Green Checkmark ($\checkmark$) on one side, Red ($\times$) on the reverse. Distributed 1 per player (supporting 2 to 8 players).
   - **104 Playing Cards:** 64 Number Cards, 24 Action Cards, and 16 Wild Cards. 100% card conservation and deterministic ID assignment strictly enforced across all game state transitions.
2. **Dual-Mode Gameplay (Regular vs. Flex):**
   - Every Flex card has a **Regular Side** (center oval color/value) and a **Flex Side** (secondary color/action).
   - A player may only play the Flex side if their Power Card is currently on **Green Checkmark** ($\checkmark$).
   - When a player plays the Flex side, their Power Card immediately flips to **Red** ($\times$).
   - *Power Card Scope Clarification:* A green Power Card is required *only* to play the **Flex side** of a card (`playMode === 'flex'`). Regular-side action cards (Draw Two, Skip, Reverse, regular side of Flex cards, Wild All Flip) can always be played when matching regardless of whether the player's Power Card is Green or Red.
3. **The Continuing Color Rule (Mattel Official Rule):**
   - Per page 2 of the official Mattel rules: *“When you play the Flex side of a card, the Regular side color (the color in the center oval) is what continues play, NOT the Flex color.”*
   - Only Wild cards allow the player to call the continuing color.
4. **Flip Icon Mechanics:**
   - Exactly 16 Classic Number cards feature the Flip icon ($\curvearrowright$). When played, the player's Power Card flips (turning Red back to Green or Green to Red).
5. **Simultaneous All-Red Reset:**
   - If every player's Power Card becomes Red ($\times$) at the same time, all Power Cards immediately reset to Green Checkmark ($\checkmark$).
6. **Action Card Innovations:**
   - **Flex Draw Two:** Regular forces next player to draw 2 and skip turn; Flex forces *all other players* to draw 1 card while the next player does *not* lose their turn.
   - **Flex Reverse:** Regular reverses play direction; Flex reverses direction *and* skips the first player in the new direction (or in 2-player games, skips opponent).
   - **Flex Skip:** Regular skips next player; Flex performs a *Skip All*, passing over all opponents and returning the turn immediately to the active player.
7. **Wild Card Innovations:**
   - **Wild All Flip:** Caller chooses the continuing color; all players must flip their Power Cards.
   - **Flex Wild Draw Four:** Regular mode triggers the official Challenge flow (draw 4 or draw 6); Flex mode acts as a targeted Draw 4 with *no challenge allowed*.
   - **Flex Wild Target Draw Two:** Regular functions as a regular Wild; Flex targets any selected player to draw 2 cards.
   - **Flex Wild All Draw:** Regular functions as a regular Wild; Flex forces *every other player* to draw 2 cards.
8. **Opening Discard Card Rule (Mattel Rule 7):**
   - The top card of the draw pile is flipped faceup to start the discard pile. If this card is an Action Card (Classic Action, Flex Action, or Wild Card), it is ignored and placed faceup on the discard pile, continuing to flip until a Number Card is reached. Power Cards are not flipped by opening cards.
9. **Final-Card Action Resolution & Penalty Scoring:**
   - When a player plays their final card, all penalty actions (Draw Two, Flex Draw Two, Flex Wild All Draw, Targeted Draw Two/Four, Wild Draw Four challenge/accept) resolve fully before round conclusion. Drawn penalty cards are added to opponents' hands and counted in the winner's round score.
10. **Pure Variant Isolation:**
    - Classic UNO, UNO Flip, UNO Show 'em No Mercy, and UNO All Wild remain 100% isolated and passing without regressions.

---

## 2. Quality Gates & Verification Summary

All verification suites pass cleanly across the monorepo:

| Quality Gate | Target Scope | Result | Details |
| :--- | :--- | :--- | :--- |
| **TypeScript Typecheck** | All workspace packages | **PASS (0 errors)** | `pnpm -r typecheck` |
| **ESLint Validation** | All workspace packages | **PASS (0 warnings, 0 errors)** | `pnpm -r lint` |
| **Package Bundling** | All workspace packages | **PASS** | `pnpm build` |
| **Game Engine Unit Tests** | `packages/game-engine` | **PASS (277 tests passed)** | 21 test files |
| **Server Integration Tests**| `apps/server` | **PASS (100 tests passed)** | 14 test files |
| **Web UI Component Tests** | `apps/web` | **PASS (80 tests passed)** | 18 test files |
| **Playwright E2E Tests** | `apps/web` | **PASS (7 tests passed)** | Classic, Flip, No Mercy, All Wild, and Flex |

---

## 3. Canonical 112-Card Inventory Breakdown

Mattel UNO Flex (Product HNB00 / HMY99) contains 112 total physical cards:

```
+----------------------------------------------------+-----------+--------------------------+---------------------+
| Card Classification                                | Quantity  | Color / Action           | Score Value (pts)   |
+----------------------------------------------------+-----------+--------------------------+---------------------+
| Power Cards (Double-sided Green ✓ / Red ✗)         |     8     | N/A (Player-held)        | N/A                 |
| Classic Number Cards (without flip icon)           |    16     | 4 colors (1-8 selected)  | Face Value (1-8)    |
| Classic Number Cards (with flip icon ↷)            |    16     | Even Red/Green, Odd Y/B  | Face Value (1-8)    |
| Flex Number Cards (with secondary flex colors)     |    32     | 4 colors × 8 numbers     | Face Value (1-8)    |
| Classic Action Cards (Draw 2, Reverse, Skip)       |    12     | 4 colors × 3 types       | 20                  |
| Flex Action Cards (Flex Draw 2, Reverse, Skip)     |    12     | 4 colors × 3 types       | 20                  |
| Wild All Flip                                      |     6     | Wild                     | 50                  |
| Flex Wild Draw Four                                |     2     | Wild                     | 50                  |
| Flex Wild Target Draw Two                          |     4     | Wild                     | 50                  |
| Flex Wild All Draw                                 |     4     | Wild                     | 50                  |
+----------------------------------------------------+-----------+--------------------------+---------------------+
| TOTAL INVENTORY                                    |   112     | (8 Power + 104 Playing)  |                     |
+----------------------------------------------------+-----------+--------------------------+---------------------+
```

### Deterministic Flip Icon Distribution (16 Cards)
The 16 Classic number cards bearing the Flip icon ($\curvearrowright$) are distributed strictly per Mattel specification:
- **Red:** Even numbers `2`, `4`, `6`, `8` (4 cards)
- **Green:** Even numbers `2`, `4`, `6`, `8` (4 cards)
- **Yellow:** Odd numbers `1`, `3`, `5`, `7` (4 cards)
- **Blue:** Odd numbers `1`, `3`, `5`, `7` (4 cards)

### Deterministic Flex Color Pairings (32 Number Cards + 12 Action Cards)
- **Red cards:**
  - 1–3 flex to **Blue**
  - 4–6 flex to **Green**
  - 7–8 flex to **Yellow**
  - Flex Draw Two flexes to **Blue**
  - Flex Reverse flexes to **Green**
  - Flex Skip flexes to **Yellow**
- **Yellow cards:**
  - 1–3 flex to **Green**
  - 4–6 flex to **Blue**
  - 7–8 flex to **Red**
  - Flex Draw Two flexes to **Green**
  - Flex Reverse flexes to **Blue**
  - Flex Skip flexes to **Red**
- **Green cards:**
  - 1–3 flex to **Yellow**
  - 4–6 flex to **Red**
  - 7–8 flex to **Blue**
  - Flex Draw Two flexes to **Yellow**
  - Flex Reverse flexes to **Red**
  - Flex Skip flexes to **Blue**
- **Blue cards:**
  - 1–3 flex to **Red**
  - 4–6 flex to **Yellow**
  - 7–8 flex to **Green**
  - Flex Draw Two flexes to **Red**
  - Flex Reverse flexes to **Yellow**
  - Flex Skip flexes to **Green**

---

## 4. Rule Fidelity & Gameplay Logic Implementation

### 1. The Continuing Color Rule
In UNO Flex, playing a card in Flex mode matches the discard pile using the card's **Flex Color**, but the color that continues play for the next player is the card's **Regular Color** (the center oval).
- **Engine Implementation:** `packages/game-engine/src/variants/flex/flex.actions.ts`
  ```typescript
  if (isWild) {
    nextActiveColor = chosenColor ?? null;
  } else {
    // Crucial Mattel Rule: Even if played in flex mode, regular color continues play!
    nextActiveColor = card.color;
  }
  ```

### 2. Power Card Flipping & All-Red Reset
- Every player starts with their Power Card on `green_check`.
- Playing a Flex side requires `powerCardStatus === 'green_check'`. Once resolved, the active player's Power Card becomes `red_x`.
- Playing a card with `hasFlipIcon === true` flips the active player's Power Card (from `red_x` to `green_check`, or `green_check` to `red_x`).
- Playing a `wild_all_flip` flips every player's Power Card simultaneously.
- If at any point all players hold `red_x`, the engine immediately resets all players to `green_check`.

### 3. Action Cards in Regular vs. Flex Mode
- **Flex Draw Two (`flex_draw_two`):**
  - *Regular mode:* Target is next player. Target draws 2 cards and skips their turn.
  - *Flex mode:* Every other player draws 1 card. The next player does *not* skip their turn.
- **Flex Reverse (`flex_reverse`):**
  - *Regular mode:* Inverts turn direction.
  - *Flex mode:* Inverts turn direction AND skips the first player in the new direction.
- **Flex Skip (`flex_skip`):**
  - *Regular mode:* Skips the next player.
  - *Flex mode:* Skip All — skips all other players and returns the turn immediately to the active player.

### 4. Wild Cards in Regular vs. Flex Mode
- **Wild All Flip (`wild_all_flip`):**
  - Caller chooses continuing color. Flips all players' Power Cards.
- **Flex Wild Draw Four (`flex_wild_draw_four`):**
  - *Regular mode:* Classic Wild Draw Four. Next player may challenge if active player held matching color.
  - *Flex mode:* Targeted Draw Four. Active player chooses any player to draw 4 cards. *No challenge allowed*.
- **Flex Wild Target Draw Two (`flex_wild_target_draw_two`):**
  - *Regular mode:* Acts as a standard Wild card.
  - *Flex mode:* Active player chooses any player to draw 2 cards. Next player in turn order plays.
- **Flex Wild All Draw (`flex_wild_all_draw`):**
  - *Regular mode:* Acts as a standard Wild card.
  - *Flex mode:* Every other player draws 2 cards. Next player in turn order plays.

---

## 5. Architectural Implementation Across Monorepo

### 1. Game Engine (`packages/game-engine`)
- `src/variants/flex/flex.constants.ts`: Complete rule definitions, scoring table (1-8 face value, 20 actions, 50 wilds), color pairing mappings, and flip icon tables.
- `src/variants/flex/flex.deck.ts`: Canonical 104-card playing deck factory with unique IDs.
- `src/variants/flex/flex.invariants.ts`: Strict 104-card physical conservation, 2-8 player validation, and Power Card status verification.
- `src/variants/flex/flex.dealer.ts`: Deterministic dealer selector.
- `src/variants/flex/flex.validator.ts`: Validates moves across regular and flex modes, power card availability, targeted draws, and challenge flows.
- `src/variants/flex/flex.actions.ts`: Comprehensive action processor handling power flips, all-red resets, targeted draws, all draws, and scoring.
- `src/variants/flex/flex.adapter.ts`: `UnoFlexAdapter` implementing `GameVariantAdapter`, registered under `uno_flex` in `VariantRegistry`.
- `src/variants/flex/flex.fixture.ts`: Deterministic fixture generator maintaining card conservation.

### 2. Shared & Protocol Packages (`packages/shared`, `packages/game-protocol`)
- `packages/shared/src/schemas/room.schema.ts`: Added `'uno_flex'` to room settings schema.
- `packages/shared/src/constants/index.ts`: Added `FLEX_RULES`.
- `packages/game-protocol/src/events.ts`: Extended `playCardInputSchema` with optional `playMode: 'regular' | 'flex'` and `targetPlayerId`, added `chooseTargetedDrawFourInputSchema` and `GAME_CHOOSE_TARGETED_DRAW_FOUR`.

### 3. Server (`apps/server`)
- `src/modules/room/room.service.ts`: Enabled `'uno_flex'` in room creation and update validation; capped player capacity to 8 for UNO Flex.
- `src/modules/game/game.service.ts`: Updated 2-8 player checks, passed `playMode` and `targetPlayerId` through `playCard`, added `chooseTargetedDrawFourTarget`.
- `src/modules/game/game.socket.handler.ts`: Wired `GAME_PLAY_CARD` with `playMode` and `targetPlayerId`, registered handler for `GAME_CHOOSE_TARGETED_DRAW_FOUR`.
- `src/routes/test.routes.ts`: Added test helper endpoints:
  - `POST /api/test/inject-flex-card`
  - `POST /api/test/set-flex-power-card`
  - `POST /api/test/set-flex-hand-size`
  - `GET /api/test/verify-flex-invariants/:roomCode`

### 4. Web Application (`apps/web`)
- `CreateRoomModal.tsx`: Added UNO Flex variant selector with 112C badge and 2-8 player capacity picker.
- `LobbyPage.tsx`: Added UNO Flex variant banner, countdown indicators, and host variant toggle.
- `PlayingCard.tsx`: Rendered flex color badges, flip icons ($\curvearrowright$), and flex action labels.
- `PlayerSeat.tsx`: Rendered Power Card status badges ($\checkmark$ or $\times$).
- `GameBoard.tsx`: Rendered top bar UNO Flex badge and active player Power Card indicator; wired regular vs. flex mode modal and targeted draw modals.
- `FlexCardChoiceModal.tsx`: Interactive modal allowing players to choose Regular or Flex mode.
- `TargetedDrawFourModal.tsx`: Selection modal for targeting players with Flex Wild Draw Four.
- `gameStore.ts`: Added support for `playMode`, `targetPlayerId`, and `chooseTargetedDrawFour`.

---

## 6. Verification Evidence

### 1. Unit & Integration Test Results
- **Game Engine Unit Tests:** 21 test files, 277 tests passed.
  - `flex.deck.test.ts`: 11 tests passed.
  - `flex.fixture.test.ts`: 4 tests passed.
  - `flex.rules.test.ts`: 18 tests passed.
- **Server Integration Tests:** 14 test files, 100 tests passed.
  - `game.flex.socket.test.ts`: 3 tests passed.
- **Web Component Tests:** 18 test files, 80 tests passed.
  - `PlayingCard.flex.test.tsx`: 6 tests passed.
  - `FlexModals.test.tsx`: 6 tests passed.

### 2. End-to-End Test Suite (Playwright)
```
$ playwright test
  ok 1 tests\e2e\multiplayer-game.spec.ts (9.1s)
  ok 2 tests\e2e\multiplayer-game.spec.ts (3.4s)
  ok 3 tests\e2e\uno-all-wild-game.spec.ts (8.2s)
  ok 4 tests\e2e\uno-flex-game.spec.ts (9.2s)
  ok 5 tests\e2e\uno-flip-game.spec.ts (9.8s)
  ok 6 tests\e2e\uno-flip-game.spec.ts (8.3s)
  ok 7 tests\e2e\uno-no-mercy-game.spec.ts (11.5s)

  7 passed (1.1m)
```

---

## 7. Conclusion

Phase 8 completes the implementation of **UNO Flex** as a fully playable, server-authoritative variant in UNO Ultimate. Every mechanic stipulated by the Mattel Product HNB00/HMY99 rules has been implemented, validated, and verified across all architectural layers while preserving all existing variants.
