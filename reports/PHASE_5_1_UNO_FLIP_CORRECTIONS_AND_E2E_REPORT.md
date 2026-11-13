# UNO ULTIMATE — PHASE 5.1 VERIFICATION & AUDIT REPORT
# UNO FLIP RULE CORRECTIONS, STARTING WILD & BROWSER E2E VALIDATION

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Verified Baseline Commit:** `84da02977544be7eccd358bc0d7c6c575f782e02`  
**Audit & Implementation Date:** November 14, 2026  
**Primary Source of Truth:** Official Mattel UNO Flip GDR44 English / Multi-language Instruction Sheet (`GDR44 UNO Flip [English_French_German_Spanish_Portuguese][5LG].pdf`)

---

## 1. Executive Summary & Verification Outcomes

Phase 5.1 was executed as a focused correctness, rule-alignment, and evidence-hardening audit following the completion of Phase 5 (Variant Architecture & UNO Flip Implementation).

All 6 primary defects and audit directives identified in Phase 5 have been fully investigated, corrected, and verified with deterministic tests and browser automation:

1. **Fix A — Official Mattel GDR44 Scoring Alignment**:
   - Corrected scoring constants and face values in the engine to adhere to the official Mattel GDR44 scoring table:
     - **Light Side Draw One**: Corrected from 20 to **10 points**.
     - **Light Side Wild**: Corrected from 50 to **40 points**.
     - **Dark Side Skip Everyone**: Corrected from 20 to **30 points**.
     - **Dark Side Wild**: Corrected from 50 to **40 points**.
   - Verified that physical dual-sided cards calculate differing scores based on which side is active when the round concludes.
   - Verified cumulative round scoring toward the 500-point win threshold across multiple rounds.

2. **Fix B — Starting Wild Card Color Selection Flow**:
   - Implemented the full Mattel GDR44 starting Wild card rule: when the opening card turned up is Wild on the Light Side, the player to the left of the dealer chooses the color that continues play and plays the first card.
   - While selection is pending, `activeColor` is initialized to `null`, and `pendingActionState` is set to `{ type: 'AWAITING_STARTING_WILD_COLOR_SELECTION', designatedPlayerId }`.
   - Card play and card drawing are strictly blocked until a valid Light color (`blue`, `green`, `red`, `yellow`) is chosen.
   - Unauthorized attempts by non-designated players and invalid colors are rejected with descriptive engine error codes (`UNAUTHORIZED_CHOOSER`, `INVALID_CHOSEN_COLOR`, `PENDING_ACTION_REQUIRED`).
   - Sockets and frontend store updated to broadcast the selection, render a dedicated modal for the designated chooser, and display an informative waiting banner for opponents.
   - Verified restart and session recovery: rehydrated snapshots maintain the pending selection without state loss.

3. **Fix C — Official GDR44 Card Inventory & Documentation Accuracy Audit**:
   - Corrected documentation in `docs/rules/UNO_FLIP_IMPLEMENTATION.md`, `README.md`, and added an addendum to `reports/PHASE_5_UNO_FLIP_IMPLEMENTATION_REPORT.md`.
   - Acknowledged that both the English section (*"8 Flip cards - 2 each in blue, green, red and yellow"*) and the Spanish section (*"8 cartas de Giro - 2 de cada color en azul, verde, rojo y amarillo"*) of the official Mattel GDR44 instruction sheet explicitly and accurately specify 8 Flip cards per side (112 cards total). The previous claim of an arithmetic discrepancy in the English sheet was inaccurate and has been formally corrected.

4. **Fix D — Deterministic Opening Card Fixtures & Reverse Rule Verification**:
   - Designed a deterministic Fisher-Yates PRNG fixture generator (`createSeededRngForStartingCard`) that mathematically guarantees specific opening cards without modifying engine code or bypassing shuffling.
   - Eliminated weak conditional tests (`if (topDiscardCard.value === 'reverse')`).
   - Explicitly validated opening Reverse across 2, 3, and 4 players: dealer plays first counter-clockwise, next player after dealer is counter-clockwise, and dealer rotation in subsequent rounds (`startNextRound`).
   - Validated opening Draw One (player to dealer's left draws 1 and is skipped), opening Skip (skipped), opening Flip (immediate flip to Dark Side), and opening Wild Draw Two (reshuffled per GDR44).

5. **Fix E — Multi-Browser Playwright End-to-End Validation**:
   - Implemented two complete multi-browser Playwright E2E tests in `apps/web/tests/e2e/uno-flip-game.spec.ts` executing in real Google Chrome browser contexts:
     - **Test 1**: Light-to-Dark Flip card play, Dark Side visual/card sync across 2 browser contexts, Dark Side action execution, flipping back to Light Side, and page reload recovery.
     - **Test 2**: Interactive Starting Wild color selection, designated chooser modal display, opponent waiting banner, color broadcast, and unblocking gameplay.
   - Both tests pass cleanly (25.2s execution time).

6. **Fix F — Final Card Effects & Scoring Regression Tests**:
   - Added rigorous unit tests in `packages/game-engine/tests/flip.rules.test.ts` verifying that going out with Draw One, Draw Five, Wild Draw Two, Wild Draw Color, or Flip cards executes their full effect before scoring the round.
   - Verified that victim-drawn cards are included in the winner's points, and that going out with a Flip card scores opponent hands on the newly active side.

---

## 2. Baseline & Environment Verification

- **Workspace Directory:** `D:\uno`
- **Starting Git Commit:** `84da02977544be7eccd358bc0d7c6c575f782e02`
- **Active Git Branch:** `main`
- **Target Remote Branch:** `origin/main` (`https://github.com/afrid995/uno.git`)
- **Operating System:** Windows 11 Pro
- **Node.js Version:** `v22.17.0`
- **pnpm Version:** `10.4.1`
- **Database Engine:** PostgreSQL 16.x (Docker container running on port 5432)
- **Browser Automation Channel:** Google Chrome (Playwright 1.51.0)

---

## 3. Scope Boundaries & Strict Invariants

Phase 5.1 strictly maintained established architecture boundaries:
1. **UNO Flip & Hardening Only**: No additional variants (such as Show 'em No Mercy or All Wild) or public matchmaking were introduced.
2. **Classic UNO Non-Regression**: Classic UNO (Mattel 42001) test suites, rules, 108-card deck, and socket behaviors remain 100% functional and unmodified.
3. **Card Conservation Invariant**: Across all actions, flips, draws, and shuffles, the 112 cards in UNO Flip are strictly conserved ($N_{\text{hands}} + N_{\text{drawPile}} + N_{\text{discardPile}} = 112$).
4. **Sequence Monotonicity**: Game events maintain strictly increasing monotonic sequence numbers matching database snapshots.
5. **Information Hiding**: Private hands and secret draw pile identities remain shielded in state projections.

---

## 4. Official Mattel GDR44 Scoring Rule Alignment (Fix A)

### 4.1 Comparative Scoring Audit Table

| Card Category | Side | Previous (Phase 5) | Official Mattel GDR44 | Discrepancy Resolved |
| :--- | :--- | :---: | :---: | :--- |
| **Number (1–9)** | Light | 1–9 | **1–9** | Preserved (face value) |
| **Draw One (+1)** | Light | 20 | **10** | **Corrected (-10 pts)** |
| **Reverse** | Light | 20 | **20** | Verified correct |
| **Skip** | Light | 20 | **20** | Verified correct |
| **Flip** | Light | 20 | **20** | Verified correct |
| **Wild** | Light | 50 | **40** | **Corrected (-10 pts)** |
| **Wild Draw Two** | Light | 50 | **50** | Verified correct |
| **Number (1–9)** | Dark | 1–9 | **1–9** | Preserved (face value) |
| **Draw Five (+5)** | Dark | 20 | **20** | Verified correct |
| **Reverse** | Dark | 20 | **20** | Verified correct |
| **Skip Everyone** | Dark | 20 | **30** | **Corrected (+10 pts)** |
| **Flip** | Dark | 20 | **20** | Verified correct |
| **Wild** | Dark | 50 | **40** | **Corrected (-10 pts)** |
| **Wild Draw Color** | Dark | 60 | **60** | Verified correct |

### 4.2 Implementation Details
- `packages/game-engine/src/variants/flip/flip.constants.ts`: Created dedicated constants for each face category per the table above.
- `packages/game-engine/src/variants/flip/flip.deck.ts`: `generateLightFaces()` and `generateDarkFaces()` assign exact GDR44 scores to all 112 card faces.
- `packages/game-engine/tests/flip.deck.test.ts`: Added numeric score assertions across all 112 faces.
- `packages/game-engine/tests/flip.rules.test.ts`: Added round-end and multi-round scoring tests confirming exact point totals and 500-point win threshold.

---

## 5. Starting Wild Card Color Selection Lifecycle (Fix B)

### 5.1 Rule Specification
Per Mattel GDR44 rules sheet:
> *"Wild — The person to the left of the dealer chooses the color that continues play and plays the first card."*

### 5.2 State Machine & Protocol Contracts
1. **Creation / Round Transition**:
   - In `UnoFlipAdapter.createGame()` and `startNextRound()`, if `topDiscard.value === 'wild'`, `activeColor` is set to `null`.
   - `pendingActionState` is initialized to:
     ```ts
     {
       type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
       designatedPlayerId: players[(dealerIndex + 1) % playerCount].id,
     }
     ```
   - `currentPlayerIndex` is set to `(dealerIndex + 1) % playerCount`.
2. **Move Legality Enforcement (`FlipMoveValidator`)**:
   - Any attempt to execute `PLAY_CARD` or `DRAW_CARD` while `pendingActionState.type === 'AWAITING_STARTING_WILD_COLOR_SELECTION'` returns `{ valid: false, code: 'PENDING_ACTION_REQUIRED' }`.
   - Action `CHOOSE_STARTING_WILD_COLOR` is validated:
     - Player must match `designatedPlayerId`, else `{ valid: false, code: 'UNAUTHORIZED_CHOOSER' }`.
     - Chosen color must be a valid Light Side color (`red`, `yellow`, `green`, `blue`), else `{ valid: false, code: 'INVALID_CHOSEN_COLOR' }`.
3. **State Transition (`FlipActionProcessor`)**:
   - `CHOOSE_STARTING_WILD_COLOR` sets `activeColor` to the chosen color.
   - Clears `pendingActionState` to `null`.
   - Emits game event `STARTING_WILD_COLOR_CHOSEN`.
   - Preserves `currentPlayerIndex` so the designated player immediately plays the first card.
4. **Projection Masks (`getPlayerGameState`)**:
   - Designated player view: `canChooseStartingColor: true`, `isAwaitingStartingColor: true`.
   - Other players view: `canChooseStartingColor: false`, `isAwaitingStartingColor: true`.
   - Discard pile displays `'Awaiting Color'` badge while `activeColor === null`.
5. **WebSocket & UI Integration**:
   - Registered `game:choose-starting-wild-color` socket event in `game.socket.handler.ts`.
   - `gameStore.chooseStartingWildColor()` sends socket event with optimistic state handling.
   - `GameBoard.tsx` renders `WildColorPicker` modal exclusively for the designated chooser, and `starting-wild-waiting-banner` for all other players.

---

## 6. Official GDR44 Card Inventory & Documentation Accuracy Audit (Fix C)

### 6.1 Audit Investigation
In Phase 5, the project report and documentation stated that the English instruction sheet contained a misprint claiming "4 Flip cards", requiring reconciliation with the Spanish sheet.

A rigorous audit of the official Mattel multi-language instruction sheet (`GDR44 UNO Flip [English_French_German_Spanish_Portuguese][5LG].pdf`) revealed:
- **English Section**: Explicitly specifies: *"8 Flip cards - 2 each in blue, green, red and yellow"*.
- **Spanish Section**: Explicitly specifies: *"8 cartas de Giro - 2 de cada color en azul, verde, rojo y amarillo"*.
- **French, German, Portuguese Sections**: All consistently specify 8 Flip cards (2 per color).

### 6.2 Documentation Corrections Made
1. `docs/rules/UNO_FLIP_IMPLEMENTATION.md`: Section 2.2 was updated to reflect that both English and Spanish sections explicitly and accurately specify 8 Flip cards per side.
2. `README.md`: Updated to acknowledge the official 112-card inventory across all languages.
3. `reports/PHASE_5_UNO_FLIP_IMPLEMENTATION_REPORT.md`: Appended a marked **PHASE 5.1 CORRECTION ADDENDUM** documenting the clarification and correcting the prior statement.

---

## 7. Deterministic Opening Card Fixtures & Reverse Verification (Fix D)

### 7.1 Mathematical PRNG Construction
In previous phases, opening Reverse tests relied on conditional checks (`if (state.topDiscardCard.value === 'reverse')`), which did not guarantee execution or test coverage.

The Fisher-Yates shuffle iterates $i$ from 111 down to 1. To guarantee any card matching `predicate` ends up as the opening discard card (at index $T = 111 - 7P$, where $P$ is player count):
- Let $S$ be the source index of the desired card in `FlipDeckFactory.createFlipDeck()`.
- On step $i = S$ (if $S > T$), swap $S$ to index 0 ($j = 0$).
- On step $i = T$, swap index 0 (or $S$, if $S \le T$) to index $T$.
- On all other steps, return $0.999999999$ ($j = i$, no-op swap).

When cards are dealt from the back of the deck (popping $7P$ cards), the very next card popped is at index $T$ and becomes `topDiscardCard` with 100% mathematical certainty.

### 7.2 Reverse Rule Test Results Across 2, 3, and 4 Players
- **2 Players**: Dealer is player 0. Reverse causes dealer to play first counter-clockwise; player 1 plays next. (PASSED)
- **3 Players**: Dealer is player 0. Reverse causes dealer to play first counter-clockwise; player 2 ((0 - 1 + 3) % 3) plays next. (PASSED)
- **4 Players**: Dealer is player 1. Reverse causes dealer to play first counter-clockwise; player 0 ((1 - 1 + 4) % 4) plays next. (PASSED)
- **Subsequent Rounds**: Verified `UnoFlipAdapter.startNextRound()` preserves counter-clockwise play and dealer-first order when Reverse is turned up. (PASSED)
- **Other Opening Cards**: Verified Draw One (player to left draws 1 and is skipped), Skip (player to left skipped), Flip (flips to Dark Side), and Wild Draw Two (reshuffled back into draw pile per GDR44). (ALL PASSED)

---

## 8. Multi-Browser Context Playwright E2E Test Suite (Fix E)

### 8.1 Test Implementation Architecture
Tests are implemented in `apps/web/tests/e2e/uno-flip-game.spec.ts` using two isolated Playwright `BrowserContext` instances (`contextAlice` and `contextBob`), simulating real human players in separate browser windows.

To enable deterministic interaction in browser E2E tests without mocking client stores, test endpoints were mounted under `process.env.NODE_ENV !== 'production'`:
- `POST /api/test/inject-flip-card`: Injects a playable Flip card into the active player's hand and syncs discard.
- `POST /api/test/inject-starting-wild`: Injects a starting Wild state with pending color choice.

### 8.2 Execution & Verification Results

```
$ playwright test tests/e2e/uno-flip-game.spec.ts
Running 2 tests using 1 worker

  ok 1 tests\e2e\uno-flip-game.spec.ts:22:3 › UNO Ultimate — UNO Flip Multiplayer E2E › E2E: Host selects UNO Flip variant, plays Flip card to transition to Dark Side, verifies Dark Side UI on both screens, plays Flip card back to Light Side, and verifies page refresh (10.7s)
  ok 2 tests\e2e\uno-flip-game.spec.ts:170:3 › UNO Ultimate — UNO Flip Multiplayer E2E › E2E: Starting Wild card prompts designated player for color, displays waiting banner to opponent, broadcasts color upon selection, and unblocks gameplay (8.7s)

  2 passed (25.2s)
```

Both tests passed completely in Google Chrome.

---

## 9. Final Card Effects & Scoring Regression Tests (Fix F)

Added comprehensive tests in `packages/game-engine/tests/flip.rules.test.ts` verifying GDR44 endgame resolutions:
1. **Going out with Draw One**: Victim draws 1 card from the draw pile before the round ends; the drawn card's points are included in the winner's score.
2. **Going out with Draw Five**: Victim draws 5 cards on Dark Side before the round ends; all 5 cards are counted in the winner's score.
3. **Going out with Wild Draw Two**: Round does not end immediately; victim accepts or challenges first. Once accepted, victim draws 2 cards which are scored.
4. **Going out with Wild Draw Color**: Round remains in progress until resolved; victim draws until matching color; all drawn cards are scored.
5. **Going out with Flip Card**: Game flips to the opposite side; round concludes on the new side; opponent hands are scored using the **new** side's values (demonstrated: a card with 10 pts on Light scored 20 pts on Dark).

---

## 10. Automated Unit Test Verification Summary

All unit test suites across the monorepo executed and passed with zero failures:

| Package | Test Files | Tests | Result | Duration |
| :--- | :---: | :---: | :---: | :---: |
| `@uno-ultimate/game-engine` | 10 | 120 | **120 passed** | 1.17s |
| `@uno-ultimate/server` | 10 | 59 | **59 passed** | 18.34s |
| `@uno-ultimate/web` | 12 | 48 | **48 passed** | 11.73s |
| **Total Monorepo Vitest** | **32** | **227** | **227 passed (0 failed)** | — |

---

## 11. Playwright Browser E2E Test Verification Summary

Both Playwright E2E test suites executed in Google Chrome:

| Test Suite | Spec File | Tests | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **UNO Flip Multiplayer E2E** | `tests/e2e/uno-flip-game.spec.ts` | 2 | **2 passed** | 25.2s |
| **Classic UNO Multiplayer E2E** | `tests/e2e/multiplayer-game.spec.ts` | 2 | **2 passed** | 18.7s |
| **Total Browser E2E** | | **4** | **4 passed (0 failed)** | 43.9s |

---

## 12. Static Analysis, Linting & Typecheck Verification

- **TypeScript Typecheck (`pnpm -r typecheck`)**: Checked across all 6 workspaces (`shared`, `game-protocol`, `game-engine`, `database`, `server`, `web`) — **0 errors**.
- **ESLint (`pnpm -r lint`)**: Checked across all packages — **0 errors, 0 warnings**.
- **Build Verification (`pnpm build`)**: All packages compiled clean ESM, CJS, and DTS bundles (`shared`, `game-engine`, `game-protocol`, `database`, `server`, and Vite production bundle for `web`).

---

## 13. Git Commit & Verified Remote Delivery

- **Staged & Committed Changes:**
  - `packages/game-engine`: GDR44 scoring constants, deck face definitions, starting Wild move validation, action processor, deterministic PRNG fixtures, and Fix F final card unit tests.
  - `packages/game-protocol`: Starting Wild socket event and payload schemas.
  - `apps/server`: Starting Wild socket handler, test endpoints, and integration tests.
  - `apps/web`: Starting Wild color picker modal, waiting banner, discard pile null active color handling, and Playwright E2E tests.
  - `docs/rules/UNO_FLIP_IMPLEMENTATION.md`: Card inventory and scoring corrections.
  - `README.md`: Corrected component list and scoring summary.
  - `reports/PHASE_5_UNO_FLIP_IMPLEMENTATION_REPORT.md`: Marked correction addendum.
  - `reports/PHASE_5_1_UNO_FLIP_CORRECTIONS_AND_E2E_REPORT.md`: Complete audit report.

---

## 14. Conclusion

Phase 5.1 has successfully hardened the UNO Ultimate project. The UNO Flip implementation is now strictly aligned with the official Mattel GDR44 rules, scoring tables, and opening card behaviors. The multiplayer experience has been validated through automated multi-browser Playwright tests, and all quality gates have passed. The codebase is clean, robust, and verified.
