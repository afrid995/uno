# UNO ULTIMATE — PHASE 10.1.1 AUDIT & CORRECTION REPORT
## UNO Attack Official Rules Correction & Audit Integrity

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `b27df4c33c284ddb6388eaaaa751df4b3f7efdf9`  
**Audit Phase:** 10.1.1 — UNO Attack Official Rules Correction & Audit Integrity  
**Author:** Google Antigravity  
**Rules Authority:** Mattel UNO Attack® Product Sheet Model **GTX66** / **GTX66-0970** (1102437022-2LC, ©2020 Mattel, Inc.)  
**Official Document URL:** `https://service.mattel.com/instruction_sheets/GTX66-Eng.pdf`  

---

## 1. Executive Summary & Verification Objective

This targeted phase was executed to address two core requirements:
1. **Critical Rules Correction — Wild Customizable Card Count:** Enforce the exact official Mattel GTX66 rule regarding Wild Customizable card inclusion across the entire system. Official Mattel rules strictly allow **only 1 or 3** customizable cards (resulting in 110 or 112 total cards in the deck). The ungrounded 2-card option mistakenly permitted in Phase 10.1 was thoroughly purged and strictly rejected across schemas, engine adapters, deck factories, server services, and client interfaces.
2. **Audit Integrity & Test-Count Discrepancy Investigation:** Investigate the apparent test-count reduction between Phase 10 (reported as 66 files, 551 tests) and Phase 10.1 (reported as 52 files, 501 tests). Thorough forensic analysis confirms that zero tests were deleted; `apps/web` consistently ran 22 test files with 98 tests. The Phase 10.1 figure was an erroneous clerical transcription error. Current verified test counts stand at **66 test files, 566 tests passed**, plus all **9 Playwright E2E tests passed**.

---

## 2. Primary Rules Evidence & Official Correction (Audit A)

### 2.1 Mattel GTX66 Official Rules Text
From the official Mattel UNO Attack® instruction sheet (`GTX66-Eng.pdf`), Page 3, "Wild Customizable Card":
> *"Wild Customizable Card — ... Before the game begins, decide how many of these cards to include. You may use only 1 or all 3, it’s up to you."*

### 2.2 Finding & Policy Decision
- Mattel's physical card box contains 112 cards total: 109 standard Attack cards + 3 Wild Customizable cards.
- Players are given a binary choice before play:
  - **Option 1 (1 card):** Use only 1 Wild Customizable card $\implies$ Total deck size is **110 cards**.
  - **Option 2 (3 cards):** Use all 3 Wild Customizable cards $\implies$ Total deck size is **112 cards**.
- The physical manual does **not** permit 0 cards or 2 cards. A 2-card configuration was an improper interpolation in Phase 10.1.
- In Phase 10.1.1, the permitted values are strictly enforced as `1 | 3`. Value `2` is rejected at every layer of the application architecture.

### 2.3 Comprehensive Multi-Tier Implementation & Rejection

1. **Engine Constants (`packages/game-engine/src/variants/attack/attack.constants.ts`):**
   - Added `PERMITTED_CUSTOMIZABLE_CARDS_COUNTS: [1, 3] as const`.
   - Added `OFFICIAL_DECK_SIZES: { ONE_CUSTOMIZABLE: 110, THREE_CUSTOMIZABLE: 112 } as const`.
   - Exported runtime type-guard `isValidAttackCustomizableCount(count: number): count is 1 | 3`.

2. **Deck Factory (`packages/game-engine/src/variants/attack/attack.deck.ts`):**
   - Strictly enforces `isValidAttackCustomizableCount(customizableCount)`.
   - Throws `Error: 'Uno Attack customizable card count must be either 1 or 3 (Mattel product GTX66). Received: ${customizableCount}'` if count is not 1 or 3.
   - Accurately generates 110 cards when `customizableCount === 1` and 112 cards when `customizableCount === 3`.

3. **Dynamic Invariant Checker (`packages/game-engine/src/variants/attack/attack.invariants.ts`):**
   - Validates that `state.attackCustomizableCount` is strictly 1 or 3.
   - Asserts that the total number of customizable cards in play across draw pile, discard pile, and player hands exactly matches `state.attackCustomizableCount`.
   - Asserts total deck size equals 110 (for count 1) or 112 (for count 3).

4. **Engine Adapter (`packages/game-engine/src/variants/attack/attack.adapter.ts`):**
   - Validates `config.attackCustomizableCount` using `isValidAttackCustomizableCount()`.
   - Throws error if non-permitted values are passed.

5. **Shared Schemas (`packages/shared/src/schemas/room.schema.ts`):**
   - `roomSettingsSchema`: `attackCustomizableCount: z.union([z.literal(1), z.literal(3)]).default(3).optional()`.
   - `updateRoomSettingsSchema`: Validates `settings` and refines that `attackCustomizableCount` must be 1 or 3 if provided.

6. **Server Room & Game Services (`apps/server/src/modules`):**
   - `roomService.updateSettings()`: Rejects `attackCustomizableCount !== 1 && attackCustomizableCount !== 3` with `AppError(BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR)`.
   - `gameService.startGame()`: Rejects invalid customizable counts with `AppError(BAD_REQUEST)`.

7. **Client User Interface (`apps/web/src`):**
   - `CreateRoomModal.tsx`: Room creation selector explicitly provides two options:
     - `"1 Card (110 Cards)"`
     - `"3 Cards (112 Cards)"`
     - Value `2` is completely absent from the UI.
   - `LobbyPage.tsx`: Dynamically updates lobby badges and headers based on host setting:
     - `"110-card attack"` / `"110 CARDS • LAUNCHER"`
     - `"112-card attack"` / `"112 CARDS • LAUNCHER"`

---

## 3. Investigation of Test-Count Discrepancy (Audit B)

### 3.1 Background & Discrepancy
- **Phase 10 Report stated:** 66 test files, 551 tests passed:
  - `@uno-ultimate/game-engine`: 28 files, 349 tests
  - `@uno-ultimate/server`: 16 files, 104 tests
  - `@uno-ultimate/web`: 22 files, 98 tests
- **Phase 10.1 Report stated:** 52 test suites, 501 tests passed:
  - `@uno-ultimate/game-engine`: 28 files, 359 tests (+10 tests)
  - `@uno-ultimate/server`: 16 files, 104 tests
  - `@uno-ultimate/web`: Erroneously written as "8 test suites, 38 tests" (-60 tests)

### 3.2 Forensic Investigation Findings
1. **Source Code Inspection:** An exhaustive Git history audit revealed that no test files, suites, or assertions were deleted, skipped (`test.skip`), or modified to reduce coverage between Phase 10 and Phase 10.1.
2. **Execution Inspection:** Running `pnpm --filter @uno-ultimate/web test` directly confirms that all **22 test files and 98 tests** in `apps/web` were present and passing all along.
3. **Root Cause Analysis:** During Phase 10.1 report compilation, the agent read a truncated intermediate console buffer from an interactive Vitest execution that displayed `8 test suites passed` before Vitest had finished indexing the remaining 14 test suites in `apps/web`. The agent transcribed this incomplete snapshot into the report table without cross-checking the final terminal summary.
4. **Correction:** The actual test count in Phase 10.1 was **66 test files, 561 tests passed** (an increase of 10 tests from Phase 10). In Phase 10.1.1, test counts further increased to **66 test files, 566 tests passed** (+5 new tests).

---

## 4. Test Suite Metrics & Verification Evidence

### 4.1 Unit & Integration Test Counts

| Package | Test Files / Suites | Total Tests Passed | Delta from Phase 10 | Delta from Phase 10.1 | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `@uno-ultimate/game-engine` | 28 | 361 | +12 | +2 | PASS |
| `@uno-ultimate/server` | 16 | 107 | +3 | +3 | PASS |
| `@uno-ultimate/web` | 22 | 98 | 0 | 0 *(corrected)* | PASS |
| **Workspace Total** | **66** | **566** | **+15** | **+5** | **PASS** |

### 4.2 Quality Gate Summary

1. **`pnpm -r typecheck`:**
   - Command: `pnpm -r typecheck`
   - Output: `Done` across all 6 packages. 0 errors.
2. **`pnpm -r lint`:**
   - Command: `pnpm -r lint`
   - Output: `Done` across all packages. 0 errors.
3. **`pnpm build`:**
   - Command: `pnpm build`
   - Output: Clean compilation of all packages via `tsup`, `tsc`, and `vite`. Exit code 0.
4. **Unit & Integration Tests (`pnpm -r test`):**
   - All 566 tests passed cleanly in Vitest.
5. **Playwright E2E Tests (`pnpm --filter @uno-ultimate/web test:e2e`):**
   - Command: `pnpm --filter @uno-ultimate/web test:e2e`
   - Duration: 1.5m
   - Results: **9 passed (100%)**
     - `multiplayer-game.spec.ts`: Classic UNO full match lifecycle & reload recovery (PASS)
     - `multiplayer-game.spec.ts`: Direct invitation link join flow (PASS)
     - `uno-all-wild-game.spec.ts`: UNO All Wild 112 cards & Targeted Draw Two (PASS)
     - `uno-attack-game.spec.ts`: UNO Attack 112 cards, Launcher & Invariants (PASS)
     - `uno-flex-game.spec.ts`: UNO Flex 112 cards, Power Cards & Flex actions (PASS)
     - `uno-flip-game.spec.ts`: UNO Flip Dark/Light sides & transitions (PASS)
     - `uno-flip-game.spec.ts`: UNO Flip starting Wild color picker flow (PASS)
     - `uno-no-mercy-game.spec.ts`: UNO Show 'em No Mercy 168 cards, Stacking & Mercy rule (PASS)
     - `uno-teams-game.spec.ts`: UNO Teams 4-player team play, 112 cards & Team victory (PASS)

---

## 5. Summary of Modified Files

- `packages/game-engine/src/variants/attack/attack.constants.ts` (Constants, allowed customizable counts `[1, 3]`, deck sizes `110 | 112`, and typeguard)
- `packages/game-engine/src/variants/attack/attack.deck.ts` (Deck generation strictly validating 1 or 3 customizable cards)
- `packages/game-engine/src/variants/attack/attack.invariants.ts` (State and conservation invariants enforcing 1 or 3 customizable cards)
- `packages/game-engine/src/variants/attack/attack.adapter.ts` (Variant adapter validating customizable card count configuration)
- `packages/game-engine/src/game/game.types.ts` (Refined `attackCustomizableCount?: 1 | 3;` in `GameConfig` and `GameState`)
- `packages/game-engine/tests/attack.deck.test.ts` (Tests verifying 1-card $\implies$ 110, 3-card $\implies$ 112, 2-card rejected)
- `packages/game-engine/tests/attack.rules.test.ts` (Tests verifying 1-card game initialization succeeds and 2-card is rejected)
- `packages/shared/src/schemas/room.schema.ts` (Zod schemas enforcing `1 | 3` on room creation and settings updates)
- `apps/server/src/modules/game/game.service.ts` (Server game service enforcing 1 or 3 customizable cards)
- `apps/server/src/modules/room/room.service.ts` (Server room service rejecting non-1/3 customizable counts)
- `apps/server/tests/unit/room.service.test.ts` (Unit tests verifying 1 and 3 succeed, 2 is rejected)
- `apps/server/tests/integration/game.attack.socket.test.ts` (Multiplayer integration tests for 110-card game and rejection of count 2)
- `apps/web/src/features/room/components/CreateRoomModal.tsx` (UI selector exposing only 1 card or 3 cards)
- `apps/web/src/pages/LobbyPage.tsx` (Lobby UI displaying dynamic card counts)

---

## 6. Conclusion & Verification

All UNO Attack rules discrepancies identified from the official Mattel GTX66 instructions sheet have been resolved. The customizable card count is strictly locked to 1 or 3 cards, dynamic invariants protect against card leaks, the test count discrepancy has been forensically explained, and all 7 UNO variants in UNO Ultimate continue to pass 100% of unit, integration, and Playwright E2E tests.
