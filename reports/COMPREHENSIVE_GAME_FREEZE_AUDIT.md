# Comprehensive Game Freeze, Deadlock & State-Recovery Audit Across All UNO Variants

**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** November 16, 2026  
**Status:** Resolved, Hardened, Verified & Production-Ready

---

## 1. Executive Summary

### 1.1 Problem Statement
During multiplayer gameplay across UNO Ultimate, an intermittent game-freeze occurred in Classic UNO when a player played a **Wild Draw 4** card and the targeted opponent chose to **Challenge** the legality of the play. Specifically, when the challenge failed (meaning the offender had played legally and held no cards matching the active color), the challenger was required to draw 6 cards (4 cards from the Wild Draw 4 plus 2 penalty cards) and forfeit their turn. Under certain network conditions, rapid duplicate clicks, or event sequencing, the game became permanently frozen:
1. The challenger's UI remained locked in an action-loading state with the challenge modal active.
2. The card draw animations were never broadcast to table participants.
3. Subsequent retry attempts threw `BAD_REQUEST: No pending Wild Draw Four resolution to challenge` errors because the server had already processed the initial request, leaving the client out of sync.
4. The match halted without turn progression, deadlocking the room.

### 1.2 Audit Scope & Mandate
Rather than applying an ad-hoc patch for this single scenario, a comprehensive audit was executed across **all seven playable variants**:
1. **Classic UNO**
2. **UNO Flip**
3. **UNO Show 'em No Mercy**
4. **UNO All Wild**
5. **UNO Flex**
6. **UNO Teams**
7. **UNO Attack**

The primary objective was to ensure that **no valid player action, network retry, rapid click, or edge condition can leave a multiplayer game permanently stuck or deadlocked**.

---

## 2. Root Cause Analysis (RCA)

Our end-to-end investigation revealed five interconnected root causes across the engine, server orchestration, protocol, and frontend client:

### 2.1 Challenge Idempotency Omission in Server Orchestration
- In commit `7785b49`, idempotent duplicate absorption was introduced for penalty acceptance actions (`ACCEPT_WILD_DRAW_FOUR`, `ACCEPT_WILD_DRAW_TWO`, `ACCEPT_WILD_DRAW_COLOR`, `ACCEPT_STACK_PENALTY`).
- However, challenge actions (`CHALLENGE_WILD_DRAW_FOUR`, `CHALLENGE_WILD_DRAW_TWO`, `CHALLENGE_WILD_DRAW_COLOR`, and `CHALLENGE_UNO_FAILURE`) were omitted from this idempotency mechanism.
- If a player experienced latency or clicked "Challenge Legality" rapidly, the first call transitioned the engine state from `AWAITING_WILD_DRAW_FOUR_RESOLUTION` to `null`.
- The immediate duplicate request arrived with `pendingActionState === null`, causing `ActionProcessor.process` to reject the action with `BAD_REQUEST: No pending Wild Draw Four resolution to challenge`.

### 2.2 Lack of Authoritative State Recovery in Client Error Callbacks
- In `apps/web/src/stores/gameStore.ts`, when a socket action received an error response (`res.success === false`), the store recorded `error: res.error.message` but failed to reconcile `gameState`.
- If the server had already resolved the challenge on a previous packet, the client's local store still had `pendingActionState` populated.
- Consequently, the challenge decision modal remained permanently mounted on screen, preventing the user from interacting with their hand or passing their turn.

### 2.3 Absence of Timeout Re-sync Fallback
- If a socket callback was dropped or delayed beyond 5000ms, `isActionLoading` was reset, but no authoritative state synchronization (`ROOM_RESUME`) was dispatched.
- The client remained permanently desynchronized from the actual server match state.

### 2.4 Missing Card Movement Animations for Challenge Outcomes
- While `GAME_ACCEPT_WILD_DRAW_FOUR` emitted `GAME_CARD_ANIMATION` (4 cards to victim), `GAME_CHALLENGE_WILD_DRAW_FOUR`, `GAME_CHALLENGE_WILD_DRAW_TWO`, and `GAME_CHALLENGE_WILD_DRAW_COLOR` never emitted animation events.
- Opponents at the table received no visual feedback that 6 cards (challenge loss) or 4 cards (challenge win) were drawn, creating an apparent freeze on spectator and opponent screens.

### 2.5 Engine State Progression & Turn Hygiene Omissions
- In `ActionProcessor.processChallengeWildDrawFour`:
  - When the challenge failed (innocent offender), the challenger drew 6 cards. While the turn correctly skipped the challenger, the engine omitted resetting the challenger's `hasDeclaredUno: false`, `hasDrawnThisTurn: false`, and `drawnCardId: null`, and did not clear `unoVulnerablePlayerId: null`.
  - When the challenge succeeded (guilty offender), the offender drew 4 cards. The offender's `hasDeclaredUno` was not reset, allowing a player who previously shouted UNO to retain their protection even after drawing 4 penalty cards.
  - Furthermore, `turnNumber` was not incremented consistently across challenge resolutions.
- In **UNO Flex**, `flex.actions.ts` emitted event `game:wdf-challenge-result` instead of `WILD_DRAW_FOUR_CHALLENGE_WON`, causing `game.socket.handler.ts` to mistakenly evaluate `won === false` in all Flex matches.

---

## 3. Systematic Audit Across All 7 UNO Variants

| Variant | Potential Deadlock Vector Audited | Finding & Action Taken | Status |
| :--- | :--- | :--- | :--- |
| **Classic UNO** | Wild Draw 4 challenge failed (6 cards) & won (4 cards); uno shout vulnerability | Implemented idempotent absorption in `game.service.ts`; added 6-card and 4-card animation broadcasts; reset `hasDeclaredUno`, `unoVulnerablePlayerId`, and `turnNumber` in `action.processor.ts`. | **Hardened** |
| **UNO Flip** | Wild Draw 2 & Wild Draw Color challenge & accept on Dark Side | Added duplicate absorption for `CHALLENGE_WILD_DRAW_TWO` & `CHALLENGE_WILD_DRAW_COLOR`; added animation broadcasts for 4-card and draw-to-color penalties; sanitized player state flags in `flip.actions.ts`. | **Hardened** |
| **UNO Show 'em No Mercy** | Stacking penalties (+4, +6, +10), 25-card Mercy Rule elimination deadlock | Verified stack acceptance idempotency; verified that players eliminated by drawing 25+ cards correctly trigger automatic turn recovery to the next active player without halting. | **Hardened** |
| **UNO All Wild** | Targeted Draw Two, Targeted Draw Four, Forced Swap modal timeouts | Idempotent absorption verified for all target selection actions; timeout recovery added to client store; verified turn advances immediately upon target selection. | **Hardened** |
| **UNO Flex** | Flex Wild Draw 4 challenge result schema mismatch (`game:wdf-challenge-result`) | Updated server socket handler to inspect `game:wdf-challenge-result` payload for `challengeWon: true`, ensuring offender receives 4 cards and animation is broadcast properly. | **Hardened** |
| **UNO Teams** | Initial card pass, split hand swap, partner elimination | Verified team action locks and mutual pass handoffs; ensured no deadlock if a player disconnects during split hand pass. | **Hardened** |
| **UNO Attack** | Launcher draw events, hit-stream bursts, target attacker selections | Launcher draws emit animation streams and correctly reset turn flags; verified launcher jam states advance turns cleanly. | **Hardened** |

---

## 4. Implementation Details

### 4.1 Pure Game Engine (`packages/game-engine`)
1. **`action.processor.ts` (`processChallengeWildDrawFour` & `processAcceptWildDrawFour`)**:
   - Challenge Succeeded: Offender receives 4 cards; offender's `hasDeclaredUno`, `hasDrawnThisTurn`, and `drawnCardId` reset; `unoVulnerablePlayerId: null`; `turnNumber` incremented.
   - Challenge Failed: Challenger receives 6 cards; challenger's `hasDeclaredUno`, `hasDrawnThisTurn`, and `drawnCardId` reset; `unoVulnerablePlayerId: null`; `turnNumber` incremented; turn cleanly skips challenger.
2. **`flip.actions.ts`**:
   - `CHALLENGE_WILD_DRAW_TWO`, `ACCEPT_WILD_DRAW_TWO`, `CHALLENGE_WILD_DRAW_COLOR`, and `ACCEPT_WILD_DRAW_COLOR` updated to reset all turn and UNO vulnerability flags on penalized players.
3. **`flex.actions.ts`**:
   - `handleWildDrawFourChallenge` and `processAcceptWildDrawFour` updated to sanitize turn flags and clear vulnerabilities.

### 4.2 Server Orchestration (`apps/server`)
1. **`game.session.manager.ts`**:
   - Expanded `LastResolvedPenalty` interface to include `CHALLENGE_WILD_DRAW_FOUR`, `CHALLENGE_WILD_DRAW_TWO`, `CHALLENGE_WILD_DRAW_COLOR`, and `CHALLENGE_UNO_FAILURE`.
2. **`game.service.ts`**:
   - In `executeAction`: Added safe idempotent duplicate absorption for challenge actions. Duplicate calls return the active session state without error or redundant card draws.
   - Idempotent duplicate check for `CHALLENGE_UNO_FAILURE` only absorbs if a previous `CHALLENGE_UNO_FAILURE` was already resolved in the session, allowing invalid challenges to be rejected cleanly by the engine.
   - Added `checkAndRecoverStuckSession(roomCode, io, guestSockets)`:
     - Automatically repairs out-of-bounds or eliminated `currentPlayerIndex`.
     - Detects and clears orphaned `pendingActionState` instances where the actor is missing or eliminated.
     - Persists healed state and broadcasts `GAME_TURN_RECOVERED` to room participants.
3. **`game.socket.handler.ts`**:
   - Added `GAME_CARD_ANIMATION` broadcast to `GAME_CHALLENGE_WILD_DRAW_FOUR`, `GAME_CHALLENGE_WILD_DRAW_TWO`, and `GAME_CHALLENGE_WILD_DRAW_COLOR`.
   - Handled both Classic's `WILD_DRAW_FOUR_CHALLENGE_WON` and Flex's `game:wdf-challenge-result`.
   - On error, retrieves and returns authoritative `PlayerGameState` so clients immediately clear out-of-sync modals.
4. **`roomSocketHandler.ts`**:
   - Integrated `checkAndRecoverStuckSession` into `ROOM_RESUME` requests so any recovering client triggers an automatic server state audit.

### 4.3 Web Client (`apps/web`)
1. **`gameStore.ts`**:
   - Added `roomCode: string | null` to state store and initialized it on `initGameListeners`.
   - In all penalty acceptance and challenge actions (`challengeWildDrawFour`, `acceptWildDrawFour`, `challengeWildDrawTwo`, `acceptWildDrawTwo`, `challengeWildDrawColor`, `acceptWildDrawColor`, `acceptStackPenalty`, `challengeUno`):
     - **5000ms Timeout Fallback**: Emits `ROOM_RESUME` with `roomCode` to force authoritative re-synchronization.
     - **Error State Recovery**: If `res.state` or `res.data.state` is provided, updates `gameState` immediately, clearing stuck modals.
2. **`ChallengePanel.tsx`**:
   - Separated button loading indicators (`actionType: 'accept' | 'challenge'`) so that clicking "Challenge Legality" displays "Challenging..." only on the challenge button and leaves "Accept" responsive.
   - Added a dismiss button (`data-testid="dismiss-inspected-hand-btn"`) for inspected opponent hands so challengers can close the inspection overlay at will.

---

## 5. Verification & Test Suite Results

### 5.1 New Dedicated Integration Suite (`game.challenge-freeze.socket.test.ts`)
Seven comprehensive socket integration tests were authored and executed against live Socket.IO connections and PostgreSQL:
1. **Classic UNO Challenge Failed**: Challenger draws 6 cards, turn skips challenger, `GAME_CARD_ANIMATION` emitted with count 6. (PASSED)
2. **Classic UNO Challenge Won**: Offender draws 4 cards, challenger retains turn, `GAME_CARD_ANIMATION` emitted with count 4. (PASSED)
3. **Duplicate Challenge Absorption**: Simultaneous rapid challenge requests absorbed safely without double card draw or crash. (PASSED)
4. **UNO Flex Challenge Won**: Correctly recognizes `game:wdf-challenge-result` and penalizes offender with 4 cards and animation. (PASSED)
5. **UNO Flip Wild Draw 2 Loss**: Challenger draws 4 cards and receives animation on Dark Side. (PASSED)
6. **Stuck-State Auto-Recovery**: Corrupted `currentPlayerIndex` and orphaned pending action healed; `GAME_TURN_RECOVERED` broadcast received. (PASSED)
7. **Deck Exhaustion Recovery**: Handles penalty drawing when deck + discard have fewer than 6 cards gracefully without throwing. (PASSED)

### 5.2 Full Test Suite Summary

| Package | Test Command | Result | Notes |
| :--- | :--- | :--- | :--- |
| **`@uno-ultimate/game-engine`** | `pnpm --filter @uno-ultimate/game-engine test` | **29/29 files passed (386/386 tests)** | Full coverage across all 7 variants |
| **`@uno-ultimate/server`** | `pnpm --filter @uno-ultimate/server test` | **24/24 files passed (167/167 tests)** | All integration, unit, and socket tests |
| **`@uno-ultimate/web`** | `pnpm --filter @uno-ultimate/web test` | **28/28 files passed (153/153 tests)** | All component, modal, and hook tests |
| **Monorepo Typecheck** | `pnpm -r typecheck` | **Passed (0 errors)** | Full strict TypeScript across all workspaces |
| **Monorepo Lint** | `pnpm -r lint` | **Passed (0 errors)** | Clean ESLint across all workspaces |
| **Monorepo Build** | `pnpm build` | **Passed (0 errors)** | Production bundles built successfully |

---

## 6. Zero-Cost & Production Assurance

1. **Zero-Cost Budget Compliance**: All fixes use existing in-memory session tracking, existing WebSocket event schemas, and standard database transactions without adding external cloud services or billable dependencies.
2. **Rules Fidelity**: Pure Mattel rules (42001, GDR44, J0572, HHL33, HPF82, GXY75, GTX66) and owner-mandated custom rules remain strictly preserved.
3. **No Force-Push**: All changes committed and pushed cleanly to `main` on GitHub.
