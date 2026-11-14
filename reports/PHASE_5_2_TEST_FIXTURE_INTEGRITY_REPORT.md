# UNO Ultimate — Phase 5.2 Test Fixture Integrity & Server-State Hardening Report

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Working Directory:** `D:\uno`  
**Baseline Commit:** `2c4be06e54d6bc073d81ff441be374e1e9d76828`  
**Phase:** 5.2 (Deterministic Test Fixture Integrity & Server-State Hardening)  
**Date:** 2026-11-14  

---

## 1. Executive Summary

Phase 5.2 conducted a targeted correctness, security, and state-integrity overhaul of the test fixture infrastructure supporting UNO Flip end-to-end browser testing.

In Phase 5.1, the test helper routes in `apps/server/src/routes/test.routes.ts` were designed to accelerate browser tests by injecting Flip and Starting Wild cards. However, an architectural review revealed two major defects:
1. **Physical Card Conservation Invariant Violation:** Cards were instantiated from a freshly generated canonical deck and injected into player hands or discard piles without removing the corresponding physical card from its original location (such as the draw pile or an opponent's hand). This produced duplicate physical card IDs and inflated the total deck size beyond 112 cards.
2. **Discard Pile Resetting / State Destruction:** Injected cards wiped the discard pile array down to a single element, destroying previous discard history.
3. **Missing Gating & Concurrency Controls:** Test endpoints lacked explicit environment flag gating and did not synchronize against ongoing player actions using the match mutex lock.

In Phase 5.2, we achieved 100% resolution of these issues:
- Developed **`packages/game-engine/src/variants/flip/flip.invariants.ts`**, establishing strict validation of the 112-card conservation invariant, ID uniqueness, dual-face integrity, and active-side face consistency.
- Developed **`packages/game-engine/src/variants/flip/flip.fixture.ts`**, implementing pure atomic swapping (`FlipFixtureBuilder.injectPlayableFlipCard` and `FlipFixtureBuilder.injectStartingWild`) with zero card creation and zero card destruction.
- Rewrote **`apps/server/src/routes/test.routes.ts`** with two-tier environment gating (`NODE_ENV !== 'production'` and `ENABLE_TEST_HELPERS === 'true'`), Zod validation, match mutex locking (`gameSessionManager.runWithLock`), and database-first persistence with automatic rollback on failure.
- Implemented real-time server-side invariant verification (`GET /api/test/verify-invariants/:roomCode`) and integrated it into Playwright multi-browser E2E tests.
- Re-verified full test suites: 132 game-engine tests passed, 71 server tests passed (including 12 new integration tests), both UNO Flip and Classic UNO Playwright browser E2E tests passed in Google Chrome, with 100% typecheck and lint passes.

---

## 2. Audit Findings (Root Cause Analysis)

### 2.1 The Card Duplication & State Corruption Mechanism
In Phase 5.1, `test.routes.ts` executed the following logic:
```typescript
// Legacy Phase 5.1 flaw:
const deck = FlipDeckFactory.createFlipDeck();
const flipCard = deck.find((c) => c.lightFace.value === 'flip' && c.lightFace.color === 'blue')!;
const blueDiscard = deck.find((c) => c.lightFace.value === '5' && c.lightFace.color === 'blue')!;

session.state = {
  ...session.state,
  topDiscardCard: blueDiscard,
  discardPile: [blueDiscard], // Discard history destroyed!
  players: session.state.players.map((p, idx) =>
    idx === currentIdx
      ? { ...p, hand: [flipCard, ...p.hand.slice(1)] } // flipCard added, but original card still in drawPile!
      : p
  ),
};
```

### 2.2 Invariants Violated
1. **Total Card Count:** The game had $112 + 2 = 114$ cards in circulation because `flipCard` and `blueDiscard` were synthesized from a separate deck instance while existing copies remained in the draw pile.
2. **Physical ID Collision:** Two cards shared identical IDs (e.g., `flip_c_025` occurred both in player hand and draw pile).
3. **History Loss:** Any previous cards discarded in turns 1..N were lost because `discardPile: [blueDiscard]` replaced the array.
4. **Active Color Desynchronization:** If an opening card was a Flip card, `activeColor` remained set to the Light side color while the card flipped to the Dark side color.

---

## 3. Architectural Specification of Fixed Invariant Engine

The UNO Flip variant engine enforces mathematical invariants governing the physical universe of the match:

### 3.1 Card Conservation Law
For any valid UNO Flip game state $S$:
$$\sum_{p \in S.\text{players}} |p.\text{hand}| + |S.\text{drawPile}| + |S.\text{discardPile}| = 112$$
$$\left| \bigcup_{c \in \text{AllCards}(S)} \{c.\text{id}\} \right| = 112$$
Every physical card ID $\in \{\text{"flip\_c\_001"}, \dots, \text{"flip\_c\_112"}\}$ exists in exactly one zone at any given millisecond.

### 3.2 Dual-Face Canonical Agreement
Every card $c$ possesses canonical dual faces matching `FlipDeckFactory.createFlipDeck()`:
$$c.\text{lightFace} = \text{CanonicalDeck}[c.\text{id}].\text{lightFace}$$
$$c.\text{darkFace} = \text{CanonicalDeck}[c.\text{id}].\text{darkFace}$$
When $S.\text{activeSide} = \text{'LIGHT'}$, $c$ reflects its `lightFace`. When $S.\text{activeSide} = \text{'DARK'}$, $c$ reflects its `darkFace`.

### 3.3 Discard Top Alignment
The visible `topDiscardCard` must strictly match the terminal element of `discardPile`:
$$S.\text{topDiscardCard}.\text{id} = S.\text{discardPile}[|S.\text{discardPile}| - 1].\text{id}$$

---

## 4. Implementation Details: `FlipFixtureBuilder` & `FlipInvariantValidator`

### 4.1 Invariant Validator (`packages/game-engine/src/variants/flip/flip.invariants.ts`)
- `validateFlipGameStateInvariants(state: GameState): FlipInvariantValidationResult`
  - Validates `state.variant === 'uno_flip'`.
  - Validates `state.activeSide` is `'LIGHT'` or `'DARK'`.
  - Aggregates all cards across player hands, draw pile, and discard pile.
  - Verifies total card count is exactly 112.
  - Verifies all 112 card IDs are unique.
  - Compares every card against canonical dual faces.
  - Validates active representation agrees with `activeSide`.
  - Verifies `activeColor` rules (must be null during `AWAITING_STARTING_WILD_COLOR_SELECTION`, must match non-wild top discard otherwise).
- `assertValidFlipGameState(state: GameState): void`
  - Throws a descriptive `Error` listing all specific invariant violations if `!valid`.

### 4.2 Fixture Builder (`packages/game-engine/src/variants/flip/flip.fixture.ts`)
- **`createInitialGameFixture(options)`**:
  Constructs a canonical starting game state with 112 cards, dealing 7 cards per player, establishing top discard, and stabilizing active side.
- **`injectPlayableFlipCard(state, targetPlayerId)`**:
  1. Inspects target player's hand. If a playable Flip card is already present, moves it to hand index 0.
  2. If not present, locates an existing Flip card matching `targetColor` by searching `drawPile` $\to$ opponent hands $\to$ deep discard pile ($[0 \dots n-2]$).
  3. If no matching color Flip card exists, swaps the top discard with a number card from the draw pile whose color matches an available Flip card.
  4. Swaps the target Flip card with a non-Flip card in the player's hand.
  5. Asserts `assertValidFlipGameState(nextState)` before returning.
- **`injectStartingWild(state)`**:
  1. Validates `state.activeSide === 'LIGHT'`.
  2. Locates an authentic Wild card in `drawPile`.
  3. Atomically swaps the Wild card with `topDiscardCard`, placing the previous top discard back into the draw pile.
  4. Configures `activeColor = null`, `pendingActionState = { type: 'AWAITING_STARTING_WILD_COLOR_SELECTION', designatedPlayerId }`, where `designatedPlayerId` is the player to the left of the dealer.
  5. Asserts `assertValidFlipGameState(nextState)`.

---

## 5. Server Endpoint Hardening (`test.routes.ts`)

The test router in `apps/server/src/routes/test.routes.ts` was rewritten from scratch to enforce complete safety:

```typescript
// Strict Tier 1 Middleware:
router.use((_req: Request, res: Response, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_HELPERS !== 'true') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Test helper endpoints are strictly disabled.' },
    });
    return;
  }
  next();
});
```

### Endpoints Implemented:
1. **`POST /api/test/inject-flip-card`**:
   - Validates body `{ roomCode, targetPlayerId? }` via Zod.
   - Enforces `session.state.variant === 'uno_flip'` and `status === 'IN_PROGRESS'`.
   - Executes inside `gameSessionManager.runWithLock(session.matchId, ...)`.
   - Computes state via `FlipFixtureBuilder.injectPlayableFlipCard`.
   - Enforces `assertValidFlipGameState(nextState)`.
   - **Database Commit First:** `await gamePersistenceService.persistActionBatch(...)`.
   - Updates `activeSession.state = nextState` **only after** DB commit succeeds.
   - Broadcasts state via `gameStatePublisher.publishToAllParticipants(...)`.
2. **`POST /api/test/inject-starting-wild`**:
   - Atomically configures starting Wild state using `FlipFixtureBuilder.injectStartingWild`.
   - Commits to PostgreSQL before updating memory; broadcasts update.
3. **`GET /api/test/verify-invariants/:roomCode`**:
   - Runs `validateFlipGameStateInvariants(session.state)`.
   - Returns `{ success: true, valid: true, totalCards: 112, activeSide, errors: [] }`.

---

## 6. Concurrency, Mutex & Database-First Persistence Verification

To protect against state corruption and race conditions:
1. **Mutex Serialization:** All fixture operations run through `gameSessionManager.runWithLock(matchId, async (session) => ...)`. Concurrent calls queue cleanly behind the active lock promise and execute sequentially.
2. **Database-First Rollback Guarantee:**
   If `gamePersistenceService.persistActionBatch` encounters a database deadlock, connection drops, or constraint error:
   - The transaction rolls back in PostgreSQL.
   - The in-memory `activeSession.state` is **never updated** because the assignment `activeSession.state = nextState` occurs strictly on the line after `await persistActionBatch(...)`.
   - Tested explicitly in Vitest with simulated DB failure (`persistSpy.mockRejectedValueOnce(...)`).

---

## 7. Security & Environment Gating Architecture

A two-tier defense-in-depth model prevents accidental or unauthorized test helper exposure:

| Tier | Component | Condition | Behavior |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Route Mounting)** | `apps/server/src/routes/index.ts` | `NODE_ENV === 'production'` | `/test` is not mounted on `apiRouter` at all $\to$ returns HTTP 404 Not Found. |
| **Tier 1b (Runtime Guard)** | `apps/server/src/routes/index.ts` | `ENABLE_TEST_HELPERS !== 'true'` | Intercepting middleware returns HTTP 403 Forbidden. |
| **Tier 2 (Router Guard)** | `apps/server/src/routes/test.routes.ts` | Direct execution guard | Middleware checks `NODE_ENV === 'production' \|\| ENABLE_TEST_HELPERS !== 'true'` $\to$ returns HTTP 403 Forbidden. |

---

## 8. Unit & Integration Test Evidence

### 8.1 Game Engine Tests (`packages/game-engine`)
Ran `pnpm --filter @uno-ultimate/game-engine test`:
- `tests/flip.fixture.test.ts` (12 tests):
  - Invariant validator accepts canonical game states.
  - Rejects corrupted card counts (<112 or >112).
  - Rejects duplicate physical card IDs.
  - Rejects non-canonical dual face modifications.
  - Safely injects playable Flip card when player has none.
  - Reorders hand when player already has a Flip card.
  - Conserves 112 physical cards and unique IDs after injection.
  - Swaps deep discard or opponent card safely.
  - Injects starting Wild from draw pile and verifies designated chooser.
  - Throws when attempting starting Wild on Dark side.
  - Throws when player is not in game.
- Full package test summary: **11 passed test files, 132 passed tests (0 failed).**

### 8.2 Server Integration Tests (`apps/server`)
Ran `pnpm --filter @uno-ultimate/server test`:
- `tests/integration/test.routes.test.ts` (12 tests):
  - Returns 403 Forbidden when `ENABLE_TEST_HELPERS !== 'true'`.
  - Rejects test router directly when `NODE_ENV === 'production'`.
  - Rejects invalid payload when `roomCode` is empty (400).
  - Rejects when active session does not exist for `roomCode` (404).
  - Rejects when match variant is not `uno_flip` (400).
  - Rejects when match status is not `IN_PROGRESS` (400).
  - Safely injects a playable Flip card while preserving 112 cards and unique IDs (200).
  - Safely configures starting Wild state while preserving 112 cards and designating chooser (200).
  - `GET /api/test/verify-invariants/:roomCode` returns `valid: true` and `totalCards: 112` (200).
  - Returns 404 for nonexistent room code.
  - Rolls back and leaves in-memory state unmodified if database persistence fails (500).
  - Serializes concurrent requests via match mutex without state corruption.
- Full package test summary: **11 passed test files, 71 passed tests (0 failed).**

---

## 9. End-to-End Browser Test Evidence (`apps/web` with Playwright)

Ran `pnpm --filter @uno-ultimate/web test:e2e tests/e2e/uno-flip-game.spec.ts`:
- **Browser:** Google Chrome (Channel `chrome`).
- **Test 1:** *E2E: Host selects UNO Flip variant, plays Flip card to transition to Dark Side, verifies Dark Side UI on both screens, plays Flip card back to Light Side, and verifies page refresh* (Duration: 16.3s).
  - Verified `GET /api/test/verify-invariants/${roomCode}` after Light Flip card injection $\to$ `valid: true, totalCards: 112`.
  - Verified `GET /api/test/verify-invariants/${roomCode}` after Dark Flip card injection $\to$ `valid: true, totalCards: 112`.
  - Both screens transitioned between Light Side and Dark Side; card hands and discard piles remained authentic.
- **Test 2:** *E2E: Starting Wild card prompts designated player for color, displays waiting banner to opponent, broadcasts color upon selection, and unblocks gameplay* (Duration: 12.1s).
  - Verified `GET /api/test/verify-invariants/${roomCode}` after Starting Wild injection $\to$ `valid: true, totalCards: 112`.
  - Verified designated chooser modal, waiting banner for non-chooser, color choice broadcast, and discard pile update.
- **Total E2E Result:** **2 passed (35.7s, 0 failed).**

---

## 10. Zero-Regression Verification for Classic UNO

Ran `pnpm --filter @uno-ultimate/web test:e2e tests/e2e/multiplayer-game.spec.ts`:
- **Test 1:** *Full 2-player match lifecycle — Lobby, Countdown, 7-Card Deal, Real-time Turn & Disconnect Recovery* (12.6s).
- **Test 2:** *Direct invitation link join flow* (2.7s).
- **Result:** **2 passed (24.7s, 0 failed).**
- Confirmed that Classic UNO engine, room lifecycle, Mattel 42001 rules, and Socket.IO networking operate with zero regressions.

---

## 11. Known Limitations & Deferred Work

- **Multi-Round Match Points to 500:** Currently, rounds conclude when a player empties their hand and scores points. Multi-round loop carrying cumulative scores to 500 remains slated for subsequent match-lifecycle phases.
- **AI Opponents / Matchmaking:** Public matchmaking and computer bots are deferred outside private rooms per core architectural roadmap.

---

## 12. Complete Git Commit & Remote Publication Details

- **Local Branch:** `main`
- **Remote:** `origin/main` (`https://github.com/afrid995/uno.git`)
- **Staged Files:**
  - `packages/game-engine/src/variants/flip/flip.invariants.ts` (New Invariant Validator)
  - `packages/game-engine/src/variants/flip/flip.fixture.ts` (New Pure Fixture Builder)
  - `packages/game-engine/src/variants/flip/flip.adapter.ts` (Fixed starting Flip card activeColor sync)
  - `packages/game-engine/src/index.ts` (Re-exported fixture and invariant tools)
  - `packages/game-engine/tests/flip.fixture.test.ts` (12 unit tests for fixture integrity)
  - `apps/server/src/config/env.ts` (Added `ENABLE_TEST_HELPERS`)
  - `apps/server/src/routes/index.ts` (Hardened `/test` mounting with runtime check)
  - `apps/server/src/routes/test.routes.ts` (Rewrote test routes with mutex, Zod, and DB-first persistence)
  - `apps/server/tests/integration/test.routes.test.ts` (12 server integration tests)
  - `apps/web/playwright.config.ts` (Injected `ENABLE_TEST_HELPERS: 'true'` into test server environment)
  - `apps/web/tests/e2e/uno-flip-game.spec.ts` (Added server invariant verification assertions)
  - `docs/rules/UNO_FLIP_IMPLEMENTATION.md` (Documented test fixture architecture and invariants)
  - `reports/PHASE_5_1_UNO_FLIP_CORRECTIONS_AND_E2E_REPORT.md` (Added Phase 5.2 addendum)
  - `reports/PHASE_5_2_TEST_FIXTURE_INTEGRITY_REPORT.md` (This comprehensive report)

---

## 13. Checkpoint Verification Matrix

| Requirement / Invariant | Status | Verification Evidence |
| :--- | :---: | :--- |
| **Physical Card Conservation (112 Cards)** | **PASSED** | Unit tests in `flip.fixture.test.ts`, server route tests in `test.routes.test.ts`, and Playwright E2E verification assertions. |
| **Physical Card ID Uniqueness** | **PASSED** | Evaluated via `Set<string>` in `validateFlipGameStateInvariants` across all 112 cards. |
| **Zero Card Creation / Destruction** | **PASSED** | Swapping helper exclusively swaps between player hands, draw pile, and deep discard. |
| **Dual-Face Canonical Integrity** | **PASSED** | Evaluated against `FlipDeckFactory.createFlipDeck()` canonical deck map. |
| **Starting Card ActiveColor Bug Fix** | **PASSED** | Corrected `flip.adapter.ts` so `activeColor` mirrors flipped card on Dark side. |
| **Two-Tier Security Gating** | **PASSED** | Rejects 404 in production, 403 when `ENABLE_TEST_HELPERS !== 'true'`. Tested in `test.routes.test.ts`. |
| **Match Mutex Locking** | **PASSED** | `gameSessionManager.runWithLock(matchId, ...)` ensures atomic mutation; tested under concurrent calls. |
| **Database-First Persistence Rollback** | **PASSED** | In-memory state remains untouched when `persistActionBatch` fails; verified via spy test. |
| **Real-time Server Invariant Endpoint** | **PASSED** | `GET /api/test/verify-invariants/:roomCode` returns HTTP 200 with `valid: true`. |
| **Playwright Multi-Browser E2E (UNO Flip)** | **PASSED** | `uno-flip-game.spec.ts` (2 tests, 35.7s) in Google Chrome. |
| **Playwright Multi-Browser E2E (Classic UNO)**| **PASSED** | `multiplayer-game.spec.ts` (2 tests, 24.7s) in Google Chrome. |
| **Full Monorepo Unit/Integration Tests** | **PASSED** | `pnpm -r test`: 132 engine tests, 71 server tests, all web tests passed. |
| **TypeScript Typecheck** | **PASSED** | `pnpm -r typecheck`: 0 errors across all 6 workspace packages. |
| **ESLint Quality Check** | **PASSED** | `pnpm -r lint`: 0 errors, 0 warnings across monorepo. |
| **Production Build** | **PASSED** | `pnpm build`: all packages and web app built cleanly. |

---

## 14. Sign-off & Next Phase Readiness

Phase 5.2 is complete, fully verified, and hardened.
The test infrastructure of UNO Ultimate now guarantees mathematical physical-card conservation, eliminates synthetic card generation, protects production environments against test-helper exposure, and enforces strict persistence-first transactional integrity.

The repository is in a pristine state and ready for Phase 6.
