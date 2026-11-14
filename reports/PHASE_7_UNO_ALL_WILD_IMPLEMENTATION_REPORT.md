# UNO ULTIMATE — PHASE 7 IMPLEMENTATION REPORT
# UNO ALL WILD: OFFICIAL RULES, ENGINE ARCHITECTURE, MULTIPLAYER INTEGRATION & TEST HARDENING

**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `2b9521b65ded90c3b58adf12a4c68d34e5454907`  
**Phase:** Phase 7 — UNO All Wild Official Variant Implementation  
**Official Rule Authority:** Mattel UNO All Wild Card Game (Product HHL33, `HHL33-UNO Wild-Eng.pdf`)  
**Official Reference:** `https://service.mattel.com/instruction_sheets/HHL33-UNO%20Wild-Eng.pdf`  
**Phase 7 Implementation Commit:** `bdb653d7faf672160827e2bb9827ecb665e3fce9`  

---

## 1. Executive Summary & Rule Authority

Phase 7 implements the complete, server-authoritative, real-time multiplayer variant **UNO All Wild** into UNO Ultimate. Built strictly upon the official Mattel rules (Product HHL33 `HHL33-UNO Wild-Eng.pdf`), this implementation delivers the fast-paced, color-free wild card gameplay that characterizes UNO All Wild:

1. **Exact 112-Card Inventory:** Authoritatively created and preserved with 100% physical card conservation and ID uniqueness across all game states.
2. **Every Card is Wild:** No color matching or number matching restrictions. Every card in hand can be legally played at any turn.
3. **8 Distinct Card Types:** Standard Wild (54), Wild Reverse (14), Wild Skip (14), Wild Draw Two (10), Wild Skip Two (6), Wild Draw Four (6), Wild Targeted Draw Two (4), and Wild Forced Swap (4).
4. **Opening Card Setup:** The first card turned face up starts the discard pile, but its action is completely ignored. Player to the left of the dealer takes a normal opening turn.
5. **Draw Decision Rule:** A player may choose to draw even if holding playable cards. Upon drawing, the player may either play the newly drawn card immediately or pass. They strictly cannot play any other pre-existing card in hand.
6. **Targeted Draw Two & Forced Swap Engine:** Dedicated server-authoritative pending action resolution states (`AWAITING_TARGETED_DRAW_TWO_SELECTION` and `AWAITING_FORCED_SWAP_SELECTION`) with interactive frontend selection modals.
7. **Official 2-Player & 3-Player Action Card Rules:** Reverse and Skip both act as skips in 2-player games (returning the turn to the active player). Skip Two skips next 2 players, returning the turn to the active player in 2-player and 3-player configurations.
8. **UNO Call & Catch Enforcement:** Players must declare UNO when holding 2 cards and playing one. Failing to declare UNO makes the player vulnerable to challenge before the next player takes a turn, inflicting a 2-card penalty.
9. **Full Variant Preservation:** Classic UNO, UNO Flip, and UNO Show 'em No Mercy remain completely unaffected and 100% passing across all unit and E2E test suites.

All quality gates pass:
- `pnpm -r typecheck`: **0 errors** across all 6 workspace packages.
- `pnpm -r lint`: **0 errors, 0 warnings** across all workspace projects.
- `@uno-ultimate/game-engine`: **231 unit tests passed** (17 test files).
- `@uno-ultimate/server`: **96 integration and unit tests passed** (13 test files).
- `@uno-ultimate/web`: **68 component and store tests passed** (16 test files).
- Playwright E2E: **6 end-to-end browser tests passed** across all 4 variants (Classic, Flip, No Mercy, All Wild).

---

## 2. Mattel HHL33 Official Rules & Mechanics Fidelity

The implementation strictly mirrors every rule stipulated in the official Mattel instruction sheet (`HHL33-UNO Wild-Eng.pdf`):

| Rule Dimension | Official Mattel HHL33 Specification | UNO Ultimate Implementation | Fidelity Status |
| :--- | :--- | :--- | :--- |
| **Player Count** | 2 to 10 players | Validated in adapter, room schema, room service (2–10) | Verified |
| **Starting Hand** | 7 cards dealt to each player | HandManager deals exactly 7 cards to each player | Verified |
| **Opening Discard** | Action of first card turned up is ignored | Action effect suppressed on opening card | Verified |
| **Play Matching** | No color or number matching required; every card is playable | Any hand card is valid to play on any discard card | Verified |
| **Color Selection** | No colors are chosen when playing Wild cards | `chosenColor` omitted; color picker bypassed | Verified |
| **Draw Decision** | Player may draw instead of playing | Validated: player can draw with cards in hand | Verified |
| **Post-Draw Restriction** | May only play the drawn card or pass | Rejects playing any pre-existing hand card after draw | Verified |
| **UNO Obligation** | Must announce UNO when down to 1 card | `CALL_UNO` sets `hasDeclaredUno: true` | Verified |
| **UNO Catch Penalty** | Caught before next player takes turn draws 2 cards | `CHALLENGE_UNO_FAILURE` inflicts 2 penalty cards | Verified |
| **Scoring** | Standard Wild: 20 pts; All Action Wilds: 50 pts | `ALL_WILD_SCORES` configured: 20 pts standard, 50 pts actions | Verified |
| **Target Score** | Optional scoring goal: 500 cumulative points | Default match target score is 500 points | Verified |

---

## 3. Canonical 112-Card Inventory Breakdown

The deck composition strictly adheres to Mattel Product HHL33 inventory:

```
+----------------------------+-----------+--------------+------------------+
| Card Type                  | Quantity  | Color        | Score Value (pts)|
+----------------------------+-----------+--------------+------------------+
| Standard Wild              |    54     | null (Wild)  |        20        |
| Wild Reverse               |    14     | null (Wild)  |        50        |
| Wild Skip                  |    14     | null (Wild)  |        50        |
| Wild Draw Two              |    10     | null (Wild)  |        50        |
| Wild Skip Two              |     6     | null (Wild)  |        50        |
| Wild Draw Four             |     6     | null (Wild)  |        50        |
| Wild Targeted Draw Two     |     4     | null (Wild)  |        50        |
| Wild Forced Swap           |     4     | null (Wild)  |        50        |
+----------------------------+-----------+--------------+------------------+
| TOTAL                      |   112     |              |                  |
+----------------------------+-----------+--------------+------------------+
```

Each physical card has a permanent, deterministic identifier: `all_wild_${cardValue}_copy_${copyNumber}` (e.g. `all_wild_wild_copy_1` through `all_wild_wild_copy_54`, `all_wild_wild_forced_swap_copy_1` through `all_wild_wild_forced_swap_copy_4`).

---

## 4. Action Card Mechanics Specification

### 1. Standard Wild (54 cards)
- **Effect:** Plays on any card. Has no special action effect.
- **Turn Progression:** Advances play by 1 step in the current direction.

### 2. Wild Reverse (14 cards)
- **Effect in 3+ Players:** Inverts the turn direction from clockwise to counter-clockwise or vice-versa.
- **Effect in 2 Players:** Acts as a Skip. Play returns immediately to the active player.

### 3. Wild Skip (14 cards)
- **Effect in 3+ Players:** Skips the next player in turn order. Play advances 2 steps.
- **Effect in 2 Players:** Skips the opponent. Play returns immediately to the active player.

### 4. Wild Skip Two (6 cards)
- **Effect in 4+ Players:** Skips the next two consecutive players. Play advances 3 steps.
- **Effect in 3 Players:** Skips the next two players, looping back to the active player.
- **Effect in 2 Players:** Skips the opponent, returning the turn to the active player.

### 5. Wild Draw Two (10 cards)
- **Effect:** Next player must draw 2 cards from the draw pile and loses their turn.
- **Turn Progression:** In 3+ players, advances 2 steps. In 2 players, active player takes another turn.

### 6. Wild Draw Four (6 cards)
- **Effect:** Next player must draw 4 cards from the draw pile and loses their turn.
- **Turn Progression:** In 3+ players, advances 2 steps. In 2 players, active player takes another turn.

### 7. Wild Targeted Draw Two (4 cards)
- **Effect:** Active player chooses ANY other player (regardless of turn order). The targeted player immediately draws 2 cards from the draw pile.
- **Target Restriction:** Active player cannot target themselves. Eliminated players cannot be targeted.
- **Turn Progression:** The targeted player does NOT lose their turn unless they happen to be the next player in turn order. Play advances naturally by 1 step from the active player.

### 8. Wild Forced Swap (4 cards)
- **Effect:** Active player chooses ANY other player to exchange their entire hands with.
- **Execution Order:** The played Wild Forced Swap card is discarded first. The active player's remaining hand is then swapped with the chosen opponent's entire hand.
- **UNO Obligation After Swap:** If either player ends up with exactly 1 card as a result of the swap, they must declare UNO or become vulnerable to being caught.
- **Turn Progression:** Play advances naturally by 1 step from the active player.

---

## 5. Edge Cases & Special Rules

1. **Two-Player Games:**
   - In 2-player UNO All Wild, Reverse and Skip both skip the opponent, granting the active player another turn immediately.
   - Skip Two skips the opponent and returns the turn to the active player.
   - Draw Two and Draw Four penalize the opponent with cards and return the turn to the active player.
2. **Opening Discard Action Suppression:**
   - In official Mattel HHL33 rules: "If the first card turned up is a Wild Action Card, ignore its action."
   - The starting card establishes the top discard, but its action (Skip, Reverse, Draw, Swap, etc.) does not trigger.
3. **Targeted Draw Two Target Independence:**
   - The player targeted by Targeted Draw Two does not lose their turn (unlike standard Draw Two / Draw Four). Turn rotation proceeds clockwise (or counter-clockwise) from the player who played the Targeted Draw Two.
4. **Forced Swap Hand Timing:**
   - When Player A plays Wild Forced Swap, that card is placed onto the discard pile before the hands are swapped. If Player A had 2 cards in hand, after playing the card they have 1 card left. They swap that 1 card with Player B's entire hand.

---

## 6. Draw Decision Rules & Turn Progression

Under official Mattel HHL33 rules:
- **Optional Draw:** A player may choose to draw a card on their turn even if they hold playable cards in their hand.
- **Post-Draw Action Restriction:**
  - If the player draws a card, `player.hasDrawnThisTurn` is set to `true`, and `player.drawnCardId` records the drawn card ID.
  - The player may immediately play that newly drawn card (`PLAY_CARD` with `cardId === drawnCardId`).
  - Or the player may choose to pass (`PASS_TURN`), advancing the turn to the next player.
  - The player **strictly cannot** play any other card from their hand after drawing. Submitting a card play for any card other than the newly drawn card is rejected with `INVALID_CARD_MATCH`.

---

## 7. UNO Obligation & Challenge Rules

1. **Declaration:** When a player plays their second-to-last card (leaving them with exactly 1 card), they must declare UNO (`CALL_UNO`).
2. **Vulnerability Window:** If a player has 1 card remaining and has not declared UNO, `state.unoVulnerablePlayerId` is set to that player's ID.
3. **Catching Missed UNO:** Any opponent can submit `CHALLENGE_UNO_FAILURE` before the next player takes a turn.
4. **Penalty:** If caught, the vulnerable player immediately draws 2 penalty cards from the draw pile, and vulnerability is cleared.
5. **Window Expiration:** As soon as the next player plays a card or draws, the challenge window expires (`unoVulnerablePlayerId` is cleared).

---

## 8. Scoring & Winning Conditions

- **Round Winner:** The first player to get rid of all their cards wins the round (`status: 'ROUND_OVER'`).
- **Optional Cumulative Scoring (Mattel HHL33):**
  - Standard Wild cards: **20 points each**
  - All Wild Action cards (Reverse, Skip, Skip Two, Draw Two, Draw Four, Targeted Draw Two, Forced Swap): **50 points each**
- **Match Victory:** The first player to reach **500 cumulative points** wins the match (`status: 'COMPLETED'`).
- **Default Round Victory:** Standard single-round and round-by-round victory semantics are preserved for casual play.

---

## 9. Physical Card Conservation Invariant Enforcement

Every state transition enforces the strict conservation invariant via `assertValidAllWildGameState(state)`:

$$\sum_{p \in \text{players}} |\text{hand}_p| + |\text{drawPile}| + |\text{discardPile}| = 112$$

Key invariant assertions:
1. Total card count across all zones is **exactly 112 cards**.
2. Every card ID is **globally unique** in state (no card cloning or duplication).
3. Every card has `variant: 'uno_all_wild'` and `type: 'wild'`.
4. Discard pile is never empty while match is in progress.
5. Active player index is within valid bounds `[0, playerCount - 1]`.

---

## 10. Engine Architecture & Integration

UNO All Wild is cleanly integrated into the existing variant architecture in `@uno-ultimate/game-engine`:

- `packages/game-engine/src/variants/all-wild/all-wild.constants.ts`: Rules, constants, card distributions, scores.
- `packages/game-engine/src/variants/all-wild/all-wild.deck.ts`: `AllWildDeckFactory` generating the canonical 112 cards.
- `packages/game-engine/src/variants/all-wild/all-wild.dealer.ts`: `AllWildDealerSelector` with high-card dealer determination.
- `packages/game-engine/src/variants/all-wild/all-wild.invariants.ts`: `assertValidAllWildGameState` and `validateAllWildGameStateInvariants`.
- `packages/game-engine/src/variants/all-wild/all-wild.validator.ts`: `AllWildMoveValidator` enforcing move legality, draw restrictions, and target validation.
- `packages/game-engine/src/variants/all-wild/all-wild.actions.ts`: `AllWildActionProcessor` handling pure state transitions, events, and discard recycling.
- `packages/game-engine/src/variants/all-wild/all-wild.adapter.ts`: `UnoAllWildAdapter` registered in `VariantRegistry` under key `'uno_all_wild'`.
- `packages/game-engine/src/variants/all-wild/all-wild.fixture.ts`: `AllWildFixtureBuilder` for test setups and deterministic card injection.

---

## 11. Multiplayer Protocol & Server Authority

### Socket Events & Validation
- Added `GAME_CHOOSE_TARGETED_DRAW_TWO: 'game:choose-targeted-draw-two'`
- Added `GAME_CHOOSE_FORCED_SWAP: 'game:choose-forced-swap'`
- Added `chooseTargetedDrawTwoInputSchema` (`targetPlayerId: z.string().min(1)`)
- Added `chooseForcedSwapInputSchema` (`targetPlayerId: z.string().min(1)`)
- Updated `roomSettingsSchema` in `@uno-ultimate/shared` to include `'uno_all_wild'` in variant enum.

### Server Handlers & Concurrency
- `GameService.chooseTargetedDrawTwoTarget` and `GameService.chooseForcedSwapTarget` execute inside `gameSessionManager.runWithLock(session.matchId, ...)`.
- Card play in UNO All Wild bypasses `chosenColor` validation since no color declaration is required.
- Single database transaction durably commits actions, snapshots, and event logs before in-memory state updates.

---

## 12. Frontend User Experience & Components

1. **Card Rendering (`PlayingCard.tsx`):**
   - Distinct center labels: `WILD`, `REVERSE`, `SKIP`, `SKIP 2`, `+2`, `+4`, `TARGET +2`, `SWAP`.
   - Distinct corner symbols: `WILD`, `⇄`, `⊘`, `⊘2`, `+2`, `+4`, `+2🎯`, `⇅`.
   - Dedicated gradient backgrounds and vibrant borders for all 8 card types.
2. **Direct Card Play (`GameBoard.tsx`):**
   - In UNO All Wild, clicking any card directly plays it without opening the color picker modal.
   - Added `all-wild-badge` (`🌈 ALL WILD`) in the game header.
3. **Interactive Modals:**
   - `TargetedDrawTwoModal.tsx`: Displays non-eliminated opponents with card counts to select target for +2 penalty.
   - `ForcedSwapModal.tsx`: Displays non-eliminated opponents with card counts to select swap partner.
4. **Lobby & Room Creation:**
   - `CreateRoomModal.tsx`: Added All Wild card badge (`112C`), description, and capacity (2–10 players).
   - `LobbyPage.tsx`: Added `WILD` badge, variant description, and host variant toggle.

---

## 13. Test Coverage & Verification Matrix

### 1. Game Engine Tests (`@uno-ultimate/game-engine`)
- **Total Test Files:** 17 files
- **Total Tests:** 231 tests (all passing)
- **All Wild Deck Tests (`all-wild.deck.test.ts`):** 12 tests
  - 112 cards total, unique IDs, color null, exact distribution (54/14/14/10/6/6/4/4), scores.
- **All Wild Rules Tests (`all-wild.rules.test.ts`):** 30 tests
  - Setup, opening card suppression, general play, Standard Wild, Wild Reverse, Wild Skip, Wild Skip Two, Wild Draw Two, Wild Draw Four, Targeted Draw Two, Forced Swap, 2-player rules, 3-player rules, draw decisions, post-draw card play restrictions, pass turn validation, UNO calls/challenges, round victory, scoring calculation, discard recycling.
- **All Wild Fixture Tests (`all-wild.fixture.test.ts`):** 5 tests
  - Invariant assertion, deterministic card injection, hand size resizing, physical conservation.

### 2. Server Integration Tests (`@uno-ultimate/server`)
- **Total Test Files:** 13 files
- **Total Tests:** 96 tests (all passing)
- **All Wild Socket Tests (`game.all-wild.socket.test.ts`):** 2 tests
  - Full match creation, 112 cards, no active color, direct card play without color picker.
  - Targeted Draw Two and Forced Swap socket flows, target resolution, hand count verification.

### 3. Web Frontend Tests (`@uno-ultimate/web`)
- **Total Test Files:** 16 files
- **Total Tests:** 68 tests (all passing)
- **PlayingCard Tests (`PlayingCard.all-wild.test.tsx`):** 6 tests
  - Visual rendering and labels for all 8 wild card values.
- **All Wild Modals Tests (`AllWildModals.test.tsx`):** 4 tests
  - Visibility and target selection callbacks for `TargetedDrawTwoModal` and `ForcedSwapModal`.

### 4. Playwright End-to-End Tests
- **Total Spec Files:** 4 files
- **Total Tests:** 6 tests (all passing in 1.2m)
  - `multiplayer-game.spec.ts` (Classic UNO full lifecycle & invite links): 2 passed
  - `uno-flip-game.spec.ts` (UNO Flip Dark Side, starting wild, reload): 2 passed
  - `uno-no-mercy-game.spec.ts` (UNO Show 'em No Mercy stacking, 7s swap, mercy): 1 passed
  - `uno-all-wild-game.spec.ts` (UNO All Wild room creation, direct play, modals, invariants, reload): 1 passed

---

## 14. Concurrency Hardening & Test Helper Security

All test helper endpoints in `apps/server/src/routes/test.routes.ts` follow the Phase 5.3.1 hardened pattern:
- **Authentication:** Gated by `ENABLE_TEST_HELPERS === 'true'` and timing-safe header verification (`X-Test-Helper-Secret`).
- **Mutex Serialization:** State preconditions (`variant === 'uno_all_wild'` and `status === 'IN_PROGRESS'`) are checked **inside** the per-match lock callback `gameSessionManager.runWithLock(session.matchId, ...)`.
- **Atomic Persistence:** Injected state is durably saved to PostgreSQL via `gamePersistenceService.persistActionBatch` before memory update.
- **Broadcast:** Updated state published to all active participant sockets.
- **New Endpoints:**
  - `POST /api/test/inject-all-wild-card`
  - `POST /api/test/set-all-wild-hand-size`
  - `GET /api/test/verify-all-wild-invariants/:roomCode`

---

## 15. Backward Compatibility & Variant Preservation

Preservation of all previous variants was strictly maintained:
1. **Classic UNO:**
   - Standard 108 cards, number/color matching, Wild Draw Four challenge rules, 4-card penalty.
   - All Classic unit and Playwright tests pass without modification.
2. **UNO Flip:**
   - 112 dual-sided cards, Flip mechanic, Light/Dark sides, Draw 1/Draw 5.
   - All Flip unit and Playwright tests pass without modification.
3. **UNO Show ’em No Mercy:**
   - 168 cards, Draw Stacking (+2 to +10), 25-card Mercy Rule, 7s hand swap, 0s rotation, Color Roulette.
   - All No Mercy unit, integration, and Playwright tests pass without modification.

---

## 16. Unresolved Questions & Intentional Deviations

1. **Two-Player Skip Two Action:**
   - In a 2-player game, playing Wild Skip Two skips the opponent. The turn returns immediately to the active player (rather than skipping the active player). This matches official 2-player UNO conventions where action cards penalize opponents.
2. **Three-Player Skip Two Action:**
   - In a 3-player game, Skip Two skips 2 players in turn rotation, returning play back to the active player. This is mathematically and rules-wise intentional.
3. **Targeted Draw Two Turn Independence:**
   - The targeted player receives 2 cards but is not skipped, preserving turn order from the active player.
4. **Draw Decision Post-Draw Rule:**
   - Enforced strictly: If a player chooses to draw, they cannot play any pre-existing card in their hand on that turn. They can only play the newly drawn card or pass.

---

## 17. Commit Chronology & Verification Audit

| Milestone | Commit / Checkpoint | Description | Verification Gate |
| :--- | :--- | :--- | :--- |
| **Baseline** | `2b9521b65ded90c3b58adf12a4c68d34e5454907` | Clean working tree on `main` branch matching `origin/main` | Clean status |
| **Phase 7 Implementation** | `bdb653d7faf672160827e2bb9827ecb665e3fce9` | Complete UNO All Wild engine, deck, actions, protocol, server, UI, tests | All gates pass |

### Monorepo Verification Summary
```bash
$ pnpm -r typecheck
Packages: shared, database, game-engine, game-protocol, server, web
Status: 0 errors (ALL PASSED)

$ pnpm -r lint
Status: 0 errors, 0 warnings (ALL PASSED)

$ pnpm build
Status: ALL PACKAGES BUILT SUCCESSFULLY

$ pnpm test
- @uno-ultimate/game-engine: 231 tests passed (17 files)
- @uno-ultimate/server: 96 tests passed (13 files)
- @uno-ultimate/web: 68 tests passed (16 files)
Total Unit & Integration: 395 tests passed

$ pnpm --filter @uno-ultimate/web test:e2e
6 passed (1.2m) across 4 spec files
```

---

## 18. Next Phase Recommendations & Strict Scope Boundaries

### Strict Scope Boundary
Phase 7 is complete. Per user instructions, **do not begin Phase 8** or implement any additional variant (such as UNO Flex, UNO Teams, UNO Attack, UNO Dare, or UNO Party).

### Maintenance & Hand-off Notes
- The variant registry pattern (`VariantRegistry.register(new UnoAllWildAdapter())`) cleanly isolates variant logic.
- Physical card conservation checks (`assertValidAllWildGameState`) guarantee mathematical integrity in production and testing.
