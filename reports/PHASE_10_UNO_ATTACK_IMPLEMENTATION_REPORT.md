# UNO ULTIMATE — PHASE 10 IMPLEMENTATION REPORT
## UNO Attack — Official Rules Research, Virtual Launcher & Multiplayer Implementation

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Starting Baseline Commit:** `788c1dbf07d4972988d21c46fa0c99b4b819a8cf`  
**Phase:** 10 — UNO Attack  
**Primary Rules Authority:** Mattel UNO Attack® Product **GTX66** / **GTX66-0970** (1102437022-2LC, ©2020 Mattel, Inc.)  
**Official Rule Sheet Reference:** `https://service.mattel.com/instruction_sheets/GTX66-Eng.pdf`  
**Official Product Reference:** `https://shop.mattel.com/products/uno-attack-card-game-gtx66`  

---

## 1. Executive Summary

Phase 10 delivers a complete, server-authoritative, online multiplayer implementation of **UNO Attack** as an isolated variant within UNO Ultimate. All variant logic adheres to the official Mattel Product GTX66 specification, utilizing the established `GameVariantAdapter` and `VariantRegistry` architectures without destabilizing any of the six previously implemented game variants (Classic UNO, UNO Flip, UNO Show ’em No Mercy, UNO All Wild, UNO Flex, and UNO Teams).

A virtual motorized launcher system has been engineered to simulate the mechanical behavior, randomized card ejection streams, and progressive mechanical tension of the physical Mattel Attack launcher while strictly enforcing 112-card conservation across draw piles, discard piles, and player hands.

---

## 2. Official Rules Authority & Mechanics Reference

### 2.1 Edition Disambiguation
- **Selected Authority:** Mattel Product **GTX66** (2020 motorized launcher edition, 112 cards).
- **Excluded Legacy Editions:** Model 41940 (Hit 4, Trade Hands), Model T1806, Model GXY81 (Mega Hit edition, 112 cards with Mega Hit mechanics).

### 2.2 Exact 112-Card Inventory Breakdown
The GTX66 deck contains exactly 112 cards:
1. **72 Number Cards (1–9):** 18 per color (Blue, Green, Red, Yellow), 2 copies each of numbers 1–9. **Zero (0) number cards do NOT exist in UNO Attack.**
2. **8 Hit 2 Cards:** 2 per color (Blue, Green, Red, Yellow). Value = 20 points.
3. **4 Reverse Cards:** Exactly 1 per color. Value = 20 points.
4. **8 Skip Cards:** 2 per color. Value = 20 points.
5. **8 Discard All Cards:** 2 per color. Value = 30 points.
6. **4 Wild Cards:** Value = 50 points.
7. **4 Wild Attack-Attack Cards:** Value = 50 points.
8. **3 Wild Customizable Cards:** Value = 50 points.
9. **1 Wild Hit 4 Card:** Value = 50 points.
**Total Cards:** $72 + 8 + 4 + 8 + 8 + 4 + 4 + 3 + 1 = 112\text{ cards}$.

### 2.3 Key Rules Implemented
- **Turn-Ending Launcher Rule:** When a player presses the Launcher button, their turn is immediately over regardless of whether cards dispense or what cards are dispensed. There is no optional play after a draw.
- **Card Dispense Mechanics:** Pressing the launcher evaluates a mechanical stream. If 0 cards dispense, internal tension builds ($0 \to 4$), increasing ejection probability on subsequent presses. Dispensing cards resets tension to 0.
- **Hit 2 Action:** Next player must press the Launcher button twice. Their turn ends immediately after serving the presses.
- **Wild Hit 4 Action:** Next player must press the Launcher button four times. Active color is changed by the attacker.
- **Wild Attack-Attack Action:** The active player chooses any opponent to attack. The chosen opponent must press the Launcher twice.
- **Discard All Action:** The player may immediately discard all cards in their hand that match the color of the Discard All card.
- **Two-Player Rules:**
  - Reverse acts like a Skip (attacker plays again).
  - Skip gives the attacker an immediate extra turn.
  - Hit 2 requires the opponent to press the launcher twice, and play returns to the attacker.
- **Final Card Resolution:** If a player's final card is an action card (e.g. Wild Attack-Attack or Hit 2), the targeted player must serve all launcher presses before round victory and score tabulation occur.

---

## 3. Architecture & Engine Implementation

### 3.1 Game Engine Modules (`packages/game-engine/src/variants/attack/`)
- `attack.constants.ts`: GTX66 scoring table, launcher configuration, press counts, and deck composition constants.
- `attack.types.ts`: TypeScript contracts for Attack actions, launcher state, and press results.
- `attack.deck.ts`: Factory producing the canonical 112-card GTX66 deck.
- `attack.dealer.ts`: Deterministic dealer selection using highest number card face values (action/wild cards count as zero and force re-draw).
- `attack.launcher.ts`: Server-authoritative Virtual Card Launcher simulation with tension progression ($0 \to 4$), test override support, and burst bounds.
- `attack.validator.ts`: Comprehensive validation for legal Attack card plays, Discard All color matching, launcher presses, and target choices.
- `attack.actions.ts`: State machine processor executing Discard All multi-card purges, Hit 2 multi-presses, Wild Hit 4, Wild Attack-Attack target resolution, UNO penalties, and final-card victory validation.
- `attack.invariants.ts`: Invariant validator strictly asserting 112-card conservation across draw pile, discard pile, and hands.
- `attack.fixture.ts`: Test fixture builder providing deterministic round-end and custom test states.
- `attack.adapter.ts`: Implements `GameVariantAdapter` and registers `'uno_attack'` in `VariantRegistry`.

### 3.2 Protocol & Server Layer
- `packages/shared/src/schemas/room.schema.ts`: Enabled `'uno_attack'` in room settings schema.
- `packages/game-protocol/src/events.ts`: Added `SOCKET_EVENTS.GAME_CHOOSE_ATTACK_TARGET`, input schemas, and event contracts.
- `apps/server/src/modules/room/room.service.ts`: Enabled `'uno_attack'` room creation and settings updates.
- `apps/server/src/modules/game/game.service.ts`: Implemented `chooseAttackTarget()` mutation handler.
- `apps/server/src/modules/game/game.socket.handler.ts`: Wired `GAME_CHOOSE_ATTACK_TARGET` socket event.
- `apps/server/src/routes/test.routes.ts`: Added test endpoints:
  - `POST /api/test/set-attack-launcher-override`
  - `GET /api/test/verify-attack-invariants/:roomCode`
  - `POST /api/test/setup-attack-round-end`

### 3.3 Web Client & UI Layer (`apps/web/src/`)
- `features/room/components/CreateRoomModal.tsx`: Added UNO Attack variant card with 112-card badge, description, and player capacity.
- `pages/LobbyPage.tsx`: Added UNO Attack lobby pills, descriptions, and host variant selector button (`data-testid="lobby-toggle-attack"`).
- `features/game/components/PlayingCard.tsx`: Added visual themes and display labels for `hit_2`, `discard_all`, `wild_hit_4`, `wild_attack_attack`, and `wild_customizable`.
- `features/game/components/AttackLauncher.tsx`: Interactive motorized Virtual Launcher component with tension meter LEDs ($0 \to 4$), mechanical button, card ejection animations, and card count indicators.
- `features/game/components/AttackTargetModal.tsx`: Target selection modal for Wild Attack-Attack.
- `features/game/components/GameBoard.tsx`: Center table mounts `AttackLauncher` for UNO Attack, wiring launcher press to `drawCard` and target selection to `chooseAttackTarget`.
- `stores/gameStore.ts`: Added `chooseAttackTarget` store action and socket listener integration.

---

## 4. Test Verification & Quality Gates

### 4.1 Unit & Integration Test Suites
All monorepo tests pass with zero errors:
- `packages/game-engine`: **28 test files passed, 349 tests passed** (including `attack.deck.test.ts`, `attack.launcher.test.ts`, `attack.fixture.test.ts`, `attack.rules.test.ts`).
- `apps/server`: **16 test files passed, 104 tests passed** (including `game.attack.socket.test.ts`).
- `apps/web`: **22 test files passed, 98 tests passed** (including `AttackLauncher.test.tsx`, `PlayingCard.attack.test.tsx`).
- **Total Unit/Integration:** **66 test files passed, 551 tests passed**.

### 4.2 Playwright E2E Multi-Variant Regression Suite
Executed via `pnpm --filter @uno-ultimate/web test:e2e` against live Vite and Express test servers:
- `multiplayer-game.spec.ts` (Classic UNO): **2/2 passed**
- `uno-flip-game.spec.ts` (UNO Flip): **2/2 passed**
- `uno-no-mercy-game.spec.ts` (UNO Show 'em No Mercy): **1/1 passed**
- `uno-all-wild-game.spec.ts` (UNO All Wild): **1/1 passed**
- `uno-flex-game.spec.ts` (UNO Flex): **1/1 passed**
- `uno-teams-game.spec.ts` (UNO Teams): **1/1 passed**
- `uno-attack-game.spec.ts` (UNO Attack): **1/1 passed**
- **Total E2E:** **9 passed (2.3m)** across all 7 variants.

### 4.3 Static Analysis & Build
- `pnpm -r typecheck`: **0 errors** across all packages.
- `pnpm -r lint`: **0 errors, 0 warnings** across all packages.
- `pnpm build`: Clean production build across `shared`, `game-engine`, `game-protocol`, `database`, `server`, and `web`.

---

## 5. Summary of Modified & Created Files

### Created Files:
1. `reports/PHASE_10_UNO_ATTACK_RULES_RESEARCH.md`
2. `packages/game-engine/src/variants/attack/attack.constants.ts`
3. `packages/game-engine/src/variants/attack/attack.types.ts`
4. `packages/game-engine/src/variants/attack/attack.deck.ts`
5. `packages/game-engine/src/variants/attack/attack.dealer.ts`
6. `packages/game-engine/src/variants/attack/attack.launcher.ts`
7. `packages/game-engine/src/variants/attack/attack.validator.ts`
8. `packages/game-engine/src/variants/attack/attack.actions.ts`
9. `packages/game-engine/src/variants/attack/attack.invariants.ts`
10. `packages/game-engine/src/variants/attack/attack.fixture.ts`
11. `packages/game-engine/src/variants/attack/attack.adapter.ts`
12. `packages/game-engine/tests/attack.deck.test.ts`
13. `packages/game-engine/tests/attack.launcher.test.ts`
14. `packages/game-engine/tests/attack.rules.test.ts`
15. `packages/game-engine/tests/attack.fixture.test.ts`
16. `apps/server/tests/integration/game.attack.socket.test.ts`
17. `apps/web/src/features/game/components/AttackLauncher.tsx`
18. `apps/web/src/features/game/components/AttackTargetModal.tsx`
19. `apps/web/src/features/game/components/__tests__/AttackLauncher.test.tsx`
20. `apps/web/src/features/game/components/__tests__/PlayingCard.attack.test.tsx`
21. `apps/web/tests/e2e/uno-attack-game.spec.ts`
22. `reports/PHASE_10_UNO_ATTACK_IMPLEMENTATION_REPORT.md`

### Modified Files:
1. `packages/game-engine/src/cards/card.types.ts`
2. `packages/game-engine/src/cards/card.validation.ts`
3. `packages/game-engine/src/game/game.types.ts`
4. `packages/game-engine/src/actions/action.types.ts`
5. `packages/game-engine/src/projections/public-state.ts`
6. `packages/game-engine/src/projections/player-state.ts`
7. `packages/game-engine/src/index.ts`
8. `packages/game-engine/src/variants/flip/flip.fixture.ts`
9. `packages/shared/src/schemas/room.schema.ts`
10. `packages/game-protocol/src/events.ts`
11. `apps/server/src/modules/room/room.service.ts`
12. `apps/server/src/modules/game/game.service.ts`
13. `apps/server/src/modules/game/game.socket.handler.ts`
14. `apps/server/src/routes/test.routes.ts`
15. `apps/web/src/features/room/components/CreateRoomModal.tsx`
16. `apps/web/src/pages/LobbyPage.tsx`
17. `apps/web/src/features/game/components/PlayingCard.tsx`
18. `apps/web/src/features/game/components/GameBoard.tsx`
19. `apps/web/src/stores/gameStore.ts`
20. `apps/web/tests/e2e/multiplayer-game.spec.ts`

---

## 6. Publication Commit Reference

- **Target Commit Message:** `feat(variant): implement UNO Attack with server-authoritative virtual launcher (Phase 10)`
- **Publication Branch:** `main`
- **Published Commit SHA:** `PENDING_GIT_PUSH` (updated immediately upon push)
