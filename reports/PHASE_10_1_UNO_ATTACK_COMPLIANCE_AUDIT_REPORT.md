# UNO ULTIMATE — PHASE 10.1 COMPLIANCE AUDIT REPORT
## UNO Attack Rules Compliance, Launcher Simulation & Final-Card Audit

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `c05e155ec38df0d6677ee09b25ebc9e3d7e35f76`  
**Audit Phase:** 10.1 — UNO Attack Compliance Audit  
**Author:** Google Antigravity  
**Rules Authority:** Mattel UNO Attack® Product Sheet Model **GTX66** / **GTX66-0970** (1102437022-2LC, ©2020 Mattel, Inc.)  
**Official Document URL:** `https://service.mattel.com/instruction_sheets/GTX66-Eng.pdf`

---

## 1. Executive Summary

This targeted compliance audit of the Phase 10 **UNO Attack** implementation was conducted to ensure absolute fidelity to the primary authority: the official Mattel Product **GTX66** instruction sheet.

### Key Audit Findings & Resolutions:
1. **Wild Hit 4 Scoring Corrected (Audit A):**
   - Official Mattel GTX66 rules explicitly list **Wild Hit 4 as 40 points** (not 50 points).
   - Corrected Phase 10 documentation and UI test fixtures to reflect 40 points.
   - Added unit test coverage proving that an opponent holding Wild Hit 4 at round end awards exactly 40 points to the winner.

2. **Final-Card Action Resolution Policy Verified (Audit B):**
   - Verified official Mattel GTX66 "GOING OUT" and command card notes.
   - GTX66 Page 3 explicitly states: *"NOTE: If a player goes out using a Wild Attack-Attack card, they may use this command card as normal before the game ends."*
   - *Hit 2* and *Wild Hit 4* contain no such exception note. Under official GOING OUT rules, the hand immediately ends when the last card is played.
   - Implemented exact resolution: When going out on Hit 2 or Wild Hit 4, launcher presses are bypassed and round victory is awarded immediately. Wild Attack-Attack requires target selection and executes launcher presses before victory is declared.

3. **Virtual Launcher Simulation Policies Clarified (Audit C):**
   - Documented that the internal 0–4 tension level, probability progression ($15\% \to 70\%$), and 12-burst capacity are UNO Ultimate server simulation policies modeling physical motorized card launcher mechanics, rather than proprietary Mattel firmware specs.
   - Ensured deterministic test overrides are strictly authenticated via timing-safe `TEST_HELPER_SECRET` and draw-pile exhaustion recycles discard pile while conserving total cards.

4. **Wild Customizable Card Configuration Implemented (Audit D):**
   - GTX66 Page 3: *"Before the game begins, decide how many of these cards to include. You may use only 1 or all 3, it’s up to you."*
   - Supported configurable customizable card count (1, 2, or 3 cards; default 3) in room schema, room creation UI, engine deck factory (110, 111, or 112 total cards), and dynamic invariant validators.

5. **Zero Regressions Across All 7 Variants (Audit E):**
   - Verified 100% test pass rate across Classic, UNO Flip, UNO Show 'em No Mercy, UNO All Wild, UNO Flex, UNO Teams, and UNO Attack.
   - All 9 Playwright E2E tests passing.

---

## 2. Audit A — Wild Hit 4 Scoring Verification

### 2.1 Primary Rule Verification
From official Mattel GTX66 instruction sheet (`GTX66-Eng.pdf`), Page 3, "SCORING":
> Points are totaled and you start a new round. Scoring is as follows:
> - All number cards (1-9) ... Face Value
> - Reverse ... 20 Points
> - Skip ... 20 Points
> - Hit 2 ... 20 Points
> - Discard All ... 30 Points
> - **Wild Hit 4 ... 40 Points**
> - Wild ... 50 Points
> - Wild Attack-Attack ... 50 Points
> - Wild Customizable ... 50 Points

### 2.2 Corrections Made
1. **Engine Constants:** Verified `ATTACK_SCORING.WILD_HIT_4: 40` in `packages/game-engine/src/variants/attack/attack.constants.ts`.
2. **UI Test Mock:** Corrected `apps/web/src/features/game/components/__tests__/PlayingCard.attack.test.tsx` line 42 from `scoreValue: 50` to `scoreValue: 40`.
3. **Documentation:** Corrected `reports/PHASE_10_UNO_ATTACK_IMPLEMENTATION_REPORT.md` line 40 to state 40 points per official GTX66 scoring table.
4. **Regression Tests Added:**
   - In `packages/game-engine/tests/attack.deck.test.ts`: Added assertion verifying `ATTACK_SCORING.WILD_HIT_4 === 40` and `hitFourWilds[0].scoreValue === 40`.
   - In `packages/game-engine/tests/attack.rules.test.ts`: Added test `'awards exactly 40 points when an opponent is left holding Wild Hit 4 at round end'` verifying that opponent holding Wild Hit 4 awards 40 points to the round winner.

---

## 3. Audit B — Final-Card Action Resolution Policy

### 3.1 Official Mattel GTX66 Rules Text
- **Going Out (Page 2):**  
  *"Once a player is out of cards, the hand is over. Points are totaled and you start a new round."*
- **Wild Attack-Attack (Page 3):**  
  *"NOTE: If a player goes out using a Wild Attack-Attack card, they may use this command card as normal before the game ends."*
- **Hit 2 (Page 2) & Wild Hit 4 (Page 3):**  
  Neither action card contains an exception note. Therefore, when played as the final card in a hand, the game immediately ends under the standard Going Out rule.

### 3.2 Implementation Details
In `packages/game-engine/src/variants/attack/attack.actions.ts`:
```typescript
const isGoingOut = remainingHand.length === 0;

if (card.value === 'hit_2') {
  if (!isGoingOut) {
    // Execute Hit 2 launcher presses for next player
    ...
  }
} else if (card.value === 'wild_hit_4') {
  if (!isGoingOut) {
    // Execute Wild Hit 4 launcher presses for next player
    ...
  }
} else if (card.value === 'wild_attack_attack') {
  // GTX66 Page 3 explicit exception:
  // "If a player goes out using a Wild Attack-Attack card, they may use this command card as normal before the game ends."
  // Target is attacked, presses launcher twice, collects cards, then handleRoundVictory is called!
  ...
}
```

### 3.3 Unit Test Coverage
Added dedicated test cases in `packages/game-engine/tests/attack.rules.test.ts`:
- `'resolves Wild Attack-Attack action before declaring round victory when played as final card'`: Verified that target opponent receives 2 launcher presses, cards dispense into target's hand, and round victory is subsequently declared with target's new cards counting toward winner's score.
- `'ends hand immediately when Hit 2 is played as final card without triggering launcher presses'`: Verified that next player draws 0 cards and round ends immediately.
- `'ends hand immediately when Wild Hit 4 is played as final card without triggering launcher presses'`: Verified that next player draws 0 cards and round ends immediately.
- `'ends hand immediately when Skip or Discard All is played as final card'`: Verified immediate round conclusion.

---

## 4. Audit C — Virtual Launcher Simulation Policy

### 4.1 Digital Simulation Classification
The motorized physical UNO Attack launcher operates via internal flywheel mechanics. In UNO Ultimate:
- The **0–4 tension level**, **probability thresholds** ($[0.15, 0.25, 0.40, 0.55, 0.70]$), and **maximum 12-card burst capacity** are classified as **UNO Ultimate simulation policies**.
- Card dispersion is evaluated on the server using cryptographically secure randomness (`defaultCryptoRng`).
- Discard pile recycling was corrected in `attack.actions.ts` and `attack.adapter.ts` to compute `availableCardCount = drawPile.length + Math.max(0, discardPile.length - 1)`. When the draw pile runs low, the discard pile is reshuffled to fulfill launcher bursts without starvation.

### 4.2 Security & Deterministic Testing Gating
- Test override endpoint `POST /api/test/set-attack-launcher-override` is strictly mounted on the test router behind the `router.use()` authentication gate.
- Requests without a valid `X-Test-Helper-Secret` header or failing constant-time comparison against server-side `TEST_HELPER_SECRET` receive HTTP 401/403.
- In production (`NODE_ENV === 'production'`) or when `ENABLE_TEST_HELPERS !== 'true'`, all test routes fail closed with HTTP 403 Forbidden.

---

## 5. Audit D — Wild Customizable Card Configuration

### 5.1 Rules Basis
Official Mattel GTX66 rules state on Page 3:
> *"Before the game begins, decide how many of these cards to include. You may use only 1 or all 3, it’s up to you."*

### 5.2 Implementation
1. **Deck Factory:** `AttackDeckFactory.createDeck(customizableCount: number = 3)` clamps input to $[1, 3]$ and produces decks of size 110, 111, or 112 cards ($109\text{ base} + \text{customizableCount}$).
2. **Game Invariants:** `assertValidAttackGameState` in `attack.invariants.ts` verifies:
   - Total customizable cards count is in $[1, 3]$.
   - Total card conservation strictly equals $109 + \text{customizableCount}$.
   - If `state.attackCustomizableCount` is defined, verified to match the deck's customizable cards count.
3. **Room Schema:** `roomSettingsSchema` in `packages/shared/src/schemas/room.schema.ts` includes `attackCustomizableCount: z.number().int().min(1).max(3).default(3).optional()`.
4. **Server Integration:** `GameService.startMatch` forwards `attackCustomizableCount` from room settings into `GameConfig` and persists it on `GameState`.
5. **Frontend UI:**
   - `CreateRoomModal.tsx` exposes a 1, 2, or 3 card selector when UNO Attack is selected, defaulting to 3 cards.
   - `LobbyPage.tsx` dynamically displays the total deck card count (110–112 cards) based on room settings.

---

## 6. Audit E — Test & Verification Matrix

### 6.1 TypeScript Typecheck
Executed across entire monorepo (`pnpm -r typecheck`):
```
packages/shared typecheck: Done (0 errors)
database typecheck: Done (0 errors)
packages/game-engine typecheck: Done (0 errors)
packages/game-protocol typecheck: Done (0 errors)
apps/server typecheck: Done (0 errors)
apps/web typecheck: Done (0 errors)
```

### 6.2 Linter
Executed across entire monorepo (`pnpm -r lint`):
```
packages/shared lint: Done (0 errors)
packages/game-engine lint: Done (0 errors)
apps/server lint: Done (0 errors)
apps/web lint: Done (0 errors)
```

### 6.3 Unit & Integration Tests
Executed across all packages (`pnpm -r test`):
- `@uno-ultimate/game-engine`: 28 test suites, 359 tests passed.
- `@uno-ultimate/server`: 16 test suites, 104 tests passed.
- `@uno-ultimate/web`: 8 test suites, 38 tests passed.
- Total: **52 test suites, 501 tests passed with 0 failures**.

### 6.4 Playwright End-to-End Test Suite
Executed all 9 E2E tests across all 7 game variants (`pnpm --filter @uno-ultimate/web test:e2e`):
```
Running 9 tests using 1 worker

  ✓ 1 Classic: Full 2-player match lifecycle (9.6s)
  ✓ 2 Classic: Direct invitation link join flow (4.0s)
  ✓ 3 UNO All Wild: 112 cards, no color picker, Targeted Draw 2 (9.1s)
  ✓ 4 UNO Attack: Virtual Launcher, 112-card conservation, round victory (20.2s)
  ✓ 5 UNO Flex: 112 cards, 8 Power cards, flex rules (10.1s)
  ✓ 6 UNO Flip: Light to Dark side transitions (11.0s)
  ✓ 7 UNO Flip: Starting Wild designated player color selection (19.2s)
  ✓ 8 UNO Show 'em No Mercy: 168 cards, stacking, 7-0 swaps, Mercy elimination (13.7s)
  ✓ 9 UNO Teams: 4-player 2v2 teams, passing symbol, team victory (19.4s)

  9 passed (2.0m)
```

---

## 7. Modified Files Summary

| File | Modification Description |
| :--- | :--- |
| `packages/game-engine/src/variants/attack/attack.constants.ts` | Documented 40-pt Wild Hit 4 scoring, simulation policy classification, and customizable card bounds. |
| `packages/game-engine/src/variants/attack/attack.deck.ts` | Added configurable `customizableCount` in `createDeck` ($1 \le n \le 3$, producing 110–112 cards). |
| `packages/game-engine/src/variants/attack/attack.invariants.ts` | Dynamic customizable card conservation check ($109 + n$). |
| `packages/game-engine/src/variants/attack/attack.actions.ts` | Final-card resolution for Hit 2 and Wild Hit 4; discard-pile recycling for launcher presses. |
| `packages/game-engine/src/variants/attack/attack.adapter.ts` | Customizable card forwarding; draw-pile recycling evaluation on opening actions. |
| `packages/game-engine/src/variants/attack/attack.fixture.ts` | Standardized `turnDirection` handling in custom state builder. |
| `packages/game-engine/src/game/game.types.ts` | Added `attackCustomizableCount` to `GameConfig` and `GameState`. |
| `packages/game-engine/tests/attack.deck.test.ts` | Added tests for 110/111/112 card decks and Wild Hit 4 40-point value. |
| `packages/game-engine/tests/attack.rules.test.ts` | Added tests for final Hit 2, final Wild Hit 4, final Wild Attack-Attack, and Wild Hit 4 scoring. |
| `packages/shared/src/schemas/room.schema.ts` | Added `attackCustomizableCount` field to room schema. |
| `apps/server/src/modules/game/game.service.ts` | Passed `attackCustomizableCount` into engine initialization. |
| `apps/server/src/sockets/roomSocketHandler.ts` | Forwarded room settings into `startMatch`. |
| `apps/web/src/features/room/components/CreateRoomModal.tsx` | Added 1–3 card customizable selector for UNO Attack; fixed modal scrollability. |
| `apps/web/src/pages/LobbyPage.tsx` | Dynamically displayed card count for UNO Attack based on room settings. |
| `apps/web/src/features/game/components/__tests__/PlayingCard.attack.test.tsx` | Corrected Wild Hit 4 score mock to 40 points. |
| `apps/web/tests/e2e/uno-attack-game.spec.ts` | Resilient starting action handling for opening card. |
| `apps/web/tests/e2e/uno-flip-game.spec.ts` | Corrected starting wild color picker locator. |
| `reports/PHASE_10_UNO_ATTACK_IMPLEMENTATION_REPORT.md` | Corrected Wild Hit 4 point value to 40 points. |
| `reports/PHASE_10_UNO_ATTACK_RULES_RESEARCH.md` | Clarified final-card action rules between Wild Attack-Attack vs Hit 2 / Wild Hit 4. |

---

## 8. Git Publication

- **Baseline SHA:** `c05e155ec38df0d6677ee09b25ebc9e3d7e35f76`
- **Branch:** `main`
- **Quality Gates:** 100% Passing (Typecheck, Lint, Unit Tests, Monorepo Build, Playwright E2E).
