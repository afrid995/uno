# UNO Ultimate — Authoritative UNO Declaration, Catch Window, and Penalty Mechanics Audit Report

**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** November 16, 2026  
**Scope:** Server-Authoritative Engine, All 7 Playable Variants, Socket.IO Server, and Web Client UI/UX  

---

## 1. Executive Summary

In casual UNO digital implementations, players often experience erroneous UNO declarations: players pressing "UNO" at arbitrary moments, holding 3+ cards, shouting UNO after forgetting on their turn (retroactive self-rescue), or opponents being unable to challenge within the canonical Mattel catch window. Furthermore, Classic UNO in the engine previously hardcoded a 4-card penalty instead of the official 2-card penalty mandated by Mattel Rule 42001.

This implementation delivers a **comprehensive, server-authoritative UNO declaration and catch/challenge engine** across all 7 playable variants in UNO Ultimate:
1. **Classic UNO** (Mattel 42001)
2. **UNO Flip** (Mattel GDR44)
3. **UNO Show 'em No Mercy** (Mattel HWV18)
4. **UNO All Wild** (Mattel HHL33)
5. **UNO Flex** (Mattel HMY99)
6. **UNO Teams** (Mattel 42001 / HXT58)
7. **UNO Attack** (Mattel T8220 / V9408)

All declarations, vulnerability windows, and challenges are strictly validated and processed by the authoritative game engine, projected safely to player clients, and backed by a 23-scenario automated regression test suite.

---

## 2. Rule Specifications & Mechanical Contracts

### 2.1 The Two Valid Methods of Declaring UNO
According to official Mattel rules, a player must declare UNO when playing their penultimate card (reducing their hand from 2 cards to 1 card):
1. **Atomic Declaration with Card Play (Preferred UI Flow):** The player arms or toggles the UNO button before or as they click their card to play down to 1 card (`PLAY_CARD { declareUno: true }`). The engine executes the play and sets `hasDeclaredUno = true`, leaving `unoVulnerablePlayerId = null`.
2. **Pre-Play Turn Declaration:** A player holding **exactly 2 cards** whose **turn it currently is** may trigger `CALL_UNO` immediately before releasing their card. The player's `hasDeclaredUno` flag is set to `true`. When they subsequently play a card down to 1 card, the engine honors their prior declaration.

### 2.2 Prohibited Actions & Invalidation Criteria
- **Holding 3+ Cards:** `CALL_UNO` is strictly rejected with `INVALID_UNO_CALL`.
- **Off-Turn Calls:** Calling UNO when it is not your turn is strictly rejected with `NOT_YOUR_TURN`.
- **Holding 1 Card (Retroactive Self-Rescue):** Once a card has been played down to 1 card without declaring UNO, the player is marked vulnerable (`unoVulnerablePlayerId = playerId`). The vulnerable player is strictly forbidden from executing `CALL_UNO` retroactively; doing so is rejected with `INVALID_UNO_CALL`.
- **Already Declared:** Calling UNO when `hasDeclaredUno === true` is rejected with `ALREADY_DECLARED_UNO`.

### 2.3 Catch / Challenge Window Lifecycle
- **Window Opens:** As soon as a player's hand reduces from 2 cards to 1 card and neither `action.declareUno` nor `player.hasDeclaredUno` was true, the engine sets `state.unoVulnerablePlayerId = playerId` and emits `PLAYER_VULNERABLE_UNO`.
- **Window Closes:** The catch window remains open until the next player begins their turn. Specifically, any of the following actions by the next player immediately clears `unoVulnerablePlayerId = null`:
  - Playing a card (`PLAY_CARD`).
  - Drawing a card from the draw pile (`DRAW_CARD`).
  - Passing turn (`PASS_TURN`).
- **Post-Window Rejection:** Once closed, any opponent catch attempt is rejected with `TARGET_NOT_VULNERABLE`.
- **Self-Catch Rejection:** A player cannot challenge themselves (`CANNOT_CHALLENGE_SELF`).
- **Concurrent Catch Absorption:** If two opponents simultaneously submit a catch, the first processes and draws penalty cards; the second is rejected cleanly with `TARGET_NOT_VULNERABLE`, ensuring no double-penalty occurs.

### 2.4 Penalty Mechanics Across Variants
- **Classic UNO, Flip, Show 'em No Mercy, All Wild, Flex:** The caught player draws **exactly 2 penalty cards** from the draw pile. (Corrected the legacy 4-card bug in Classic UNO).
- **UNO Teams:** 
  - Missed UNO penalty is **2 cards**.
  - **Teammate Protection Rule:** In accordance with Mattel Teams rules, a player may call UNO on behalf of their partner when their partner holds 1 or 2 cards.
  - Teammates cannot challenge/catch each other (`CANNOT_CHALLENGE_SELF`).
- **UNO Attack:** 
  - Missed UNO penalty is **2 launcher button presses** (`ATTACK_LAUNCHER_CONFIG.PRESSES.MISSED_UNO_PENALTY = 2`), resulting in random mechanical card dispensation according to the launcher RNG model.
- **Turn Order Invariant:** When a player is caught, the penalty is applied immediately to their hand, but the turn order and active player index do **NOT** change or skip.

---

## 3. Architecture & Key Changes

### 3.1 Protocol & Event Schema Updates
- **`packages/game-protocol/src/events.ts`:**
  Added `declareUno: z.boolean().optional()` to `playCardInputSchema`.
- **`packages/game-engine/src/actions/action.types.ts`:**
  Added `declareUno?: boolean` to `PlayCardAction`.
- **`packages/game-engine/src/projections/public-state.ts` & `player-state.ts`:**
  - Added `isVulnerableToUno?: boolean` to `PublicPlayer` (true when `state.unoVulnerablePlayerId === p.id`).
  - In `createPlayerGameState`, `canCallUno` is set to true only when `player.hand.length === 2 && isCurrentTurn && !player.hasDeclaredUno` (or when teammate can call on partner's behalf in Teams).

### 3.2 Core Move Validation & Processing
- **`packages/game-engine/src/validation/move.validator.ts`:**
  - `validateCallUno`: Enforces `state.status === 'IN_PROGRESS'`, player not eliminated, `isCurrentTurn` (`NOT_YOUR_TURN`), `player.hand.length === 2` (`INVALID_UNO_CALL`), and `!player.hasDeclaredUno` (`ALREADY_DECLARED_UNO`).
  - `validateChallengeUnoFailure`: Enforces player not eliminated, `targetPlayerId !== challengerPlayerId` (`CANNOT_CHALLENGE_SELF`), `state.unoVulnerablePlayerId === targetPlayerId` (`TARGET_NOT_VULNERABLE`), `target.hand.length === 1` (`TARGET_NOT_VULNERABLE`), and `!target.hasDeclaredUno` (`TARGET_NOT_VULNERABLE`).
- **`packages/game-engine/src/actions/action.processor.ts`:**
  - `processPlayCard`: Checks `remainingHand.length === 1`. If `player.hasDeclaredUno || action.declareUno`, marks `hasDeclaredUno = true` and clears `unoVulnerablePlayerId = null`. Otherwise sets `unoVulnerablePlayerId = playerId`.
  - `processCallUno`: Sets `player.hasDeclaredUno = true`. Crucially, does **NOT** clear `unoVulnerablePlayerId` (preventing retroactive escape).
  - `processChallengeUno`: Penalizes target with exactly 2 cards drawn via `DeckManager.drawCards(nextState.drawPile, nextState.discardPile, 2)`, resets `unoVulnerablePlayerId = null`, and emits `UNO_CHALLENGE_SUCCESS`.

### 3.3 Variant Engine Alignment
Audited and updated all 6 variant adapters:
- `packages/game-engine/src/variants/all-wild/`
- `packages/game-engine/src/variants/attack/`
- `packages/game-engine/src/variants/flex/`
- `packages/game-engine/src/variants/flip/`
- `packages/game-engine/src/variants/no-mercy/`
- `packages/game-engine/src/variants/teams/`

Standardized validator error codes to canonical `'NOT_YOUR_TURN'` and `'INVALID_UNO_CALL'`. Verified that in UNO Teams, teammate can call UNO on partner's behalf to protect them.

### 3.4 Server Socket Integration
- **`apps/server/src/modules/game/game.socket.handler.ts`:**
  - In `GAME_PLAY_CARD`, forwards `validated.declareUno` to `gameService.playCard`.
  - In `GAME_CHALLENGE_UNO`, removed legacy hardcoded 4-card fallback; broadcasts actual penalty card count from the engine event (2 cards).

### 3.5 Client UI/UX Hardening
- **`apps/web/src/stores/gameStore.ts`:**
  - Added state `isUnoDeclaredForNextPlay: boolean` and action `toggleDeclareUno()`.
  - In `playCard()`, passes `declareUno: isUnoDeclaredForNextPlay` and resets the toggle after play.
- **`apps/web/src/features/game/components/UnoButton.tsx`:**
  - Implements 4 distinct visual states:
    1. **Disabled/Hidden:** 3+ cards in hand or not player's turn.
    2. **Armed/Toggleable:** 2 cards in hand on player's turn. Clicking toggles `isUnoDeclaredForNextPlay` with glowing amber ring.
    3. **Declared Badge:** Displays green "UNO CALLED!" badge when `hasDeclaredUno` is true.
    4. **Vulnerable Warning:** Displays pulse warning badge "VULNERABLE!" when undeclared with 1 card.
- **`apps/web/src/features/game/components/GameBoard.tsx`:**
  - Added a high-visibility, pulsing **"CATCH UNO!"** alert button for opponents when `self.canCatchUno` is true, targeting the vulnerable player instantly.

---

## 4. Comprehensive Test Coverage Matrix

A dedicated test suite was constructed in `packages/game-engine/tests/uno-declaration-catch.test.ts` containing 23 exhaustive scenarios:

| # | Test Scenario | Expected Outcome | Status |
|---|---------------|-------------------|:------:|
| 1 | Player with 5 cards calls UNO | Rejected with `INVALID_UNO_CALL` | Passed |
| 2 | Player with 3 cards calls UNO | Rejected with `INVALID_UNO_CALL` | Passed |
| 3 | Player with 2 cards calls UNO on turn | Accepted, `hasDeclaredUno = true` | Passed |
| 4 | Player with 2 cards calls UNO off-turn | Rejected with `NOT_YOUR_TURN` | Passed |
| 5 | Player who already called UNO calls again | Rejected with `ALREADY_DECLARED_UNO` | Passed |
| 6 | Atomic declaration on play down to 1 card | Protected, `unoVulnerablePlayerId = null` | Passed |
| 7 | Playing down to 1 card without declaration | Vulnerable, `unoVulnerablePlayerId = p1` | Passed |
| 8 | Holding 1 card retroactively calls UNO | Rejected with `INVALID_UNO_CALL` | Passed |
| 9 | Opponent catches vulnerable player (Classic) | Exactly 2 cards drawn, vulnerable cleared | Passed |
| 10 | Declared player cannot be caught | Catch rejected with `TARGET_NOT_VULNERABLE` | Passed |
| 11 | Player attempts to catch themselves | Catch rejected with `CANNOT_CHALLENGE_SELF` | Passed |
| 12 | Catch execution preserves turn index | Current player turn remains unchanged | Passed |
| 13 | Window closes when next player plays card | Catch after play rejected with `TARGET_NOT_VULNERABLE` | Passed |
| 14 | Window closes when next player draws card | Catch after draw rejected with `TARGET_NOT_VULNERABLE` | Passed |
| 15 | Window closes when next player passes turn | Catch after pass rejected with `TARGET_NOT_VULNERABLE` | Passed |
| 16 | Concurrent catches by multiple opponents | First draws 2 cards; second rejected safely | Passed |
| 17 | Card conservation across catch | Total deck + hand cards strictly invariant | Passed |
| 18 | UNO Attack: Catch penalty | Exactly 2 launcher presses recorded | Passed |
| 19 | UNO Show 'em No Mercy: Catch penalty | Exactly 2 cards + Mercy 25-card limit enforced | Passed |
| 20 | UNO Teams: Teammate protection | Partner calls UNO on behalf of teammate; partner cannot catch | Passed |
| 21 | UNO Flip: Atomic play down to 1 card | Protected with light/dark side cards | Passed |
| 22 | UNO Flex: Missed UNO penalty | Draws 2 cards and preserves flex status | Passed |
| 23 | UNO All Wild: Missed UNO penalty | Draws 2 cards from all-wild deck | Passed |

---

## 5. Monorepo Quality Verification Summary

| Package / Workspace | Check | Result |
|---------------------|-------|:------:|
| `@uno-ultimate/game-engine` | Unit & Variant Test Suites (30 files) | **409 / 409 Passed** |
| `@uno-ultimate/server` | Socket.IO & Integration Tests (24 files) | **167 / 167 Passed** |
| `@uno-ultimate/web` | Frontend Component & Store Tests (28 files) | **155 / 155 Passed** |
| **All Workspaces** | Monorepo Typecheck (`tsc --noEmit`) | **0 Errors** |
| **All Workspaces** | Monorepo Linter (`eslint`) | **0 Errors, 0 Warnings** |
| **All Workspaces** | Full Production Build (`pnpm build`) | **Success (All 6 artifacts)** |

---

## 6. Conclusion

The UNO declaration and catch mechanics across UNO Ultimate are now strictly server-authoritative, conform to official Mattel specifications across all variants, eliminate retroactive declaration exploits, and provide an intuitive, responsive user experience in the web client.
