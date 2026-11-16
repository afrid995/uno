# UNO Ultimate — Intermittent Accept Cards / Draw Penalty Processing Freeze Fix Report

**Project:** UNO Ultimate  
**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** 2026-11-16  
**Scope:** Root Cause Elimination, Idempotent Processing, State Broadcast Resilience, Frontend Visual & Timeout Hardening across all variants (Classic 42001, Flip, No Mercy, All Wild, Flex, Teams, Attack).

---

## 1. Executive Summary

During multiplayer matches across UNO Ultimate, an intermittent freeze was observed after a Wild Draw card (such as Wild Draw 4 in Classic, Wild Draw 2 in Flip, or Draw Stacks in No Mercy) was played and color selection completed:
1. Player A played a Wild Draw card and chose an active color.
2. Player B was targeted by the draw penalty and presented with the "Accept Cards" button.
3. Intermittently, clicking "Accept Cards" yielded no visible action: cards were not added to Player B's hand, the turn did not advance, and the game remained permanently frozen.

This investigation and remediation identified multiple compounding root causes across the WebSocket lifecycle, session lock serialization, game engine targeting logic, and frontend store/component state machines. All root causes have been resolved, verified with 18 automated integration tests covering the complete penalty acceptance lifecycle, and validated across all quality gates (`typecheck`, `lint`, and `test` in `@uno-ultimate/game-engine`, `@uno-ultimate/server`, and `@uno-ultimate/web`).

---

## 2. Root Cause Analysis

A rigorous end-to-end trace of the penalty acceptance pipeline revealed six contributing defects:

### 2.1 Critical Socket Registration Desync on `AUTH_AUTHENTICATE`
- **Location:** `apps/server/src/sockets/socketServer.ts` and `apps/server/src/sockets/roomSocketHandler.ts`
- **Mechanism:** In Socket.IO, when clients connected or resumed, token authentication could occur via `auth:authenticate` post-connection instead of during the initial HTTP handshake. While `socket.data.guestId` was assigned, the socket was **never registered into the server's `guestSockets` map**, and `roomService.restoreConnection()` was never invoked.
- **Impact:**
  - `gameStatePublisher.publishToPlayer` relies on `guestSockets.get(guestId)` to emit private player-state projections (`game:state`). When missing from `guestSockets`, the broadcast was silently dropped.
  - `getActiveRoomCode()` failed to resolve rooms on subsequent socket events, throwing `[NOT_IN_ROOM] "Not currently in a game room"`.
  - While Player A received game updates, Player B never received the updated hand or turn state, freezing the UI.

### 2.2 Missing Authoritative State in Socket Acknowledgement Callback
- **Location:** `apps/server/src/modules/game/game.socket.handler.ts`
- **Mechanism:** The socket acknowledgement for `game:accept-wild-draw-four`, `game:accept-wild-draw-two`, `game:accept-wild-draw-color`, and `game:accept-stack-penalty` returned only `{ success: true, data: { accepted: true, cardsDrawn: N } }`.
- **Impact:** The client store relied entirely on an asynchronous, separate `game:state` WebSocket broadcast. If that broadcast was dropped due to network jitter, packet reordering, or `guestSockets` desynchronization, the client remained on stale state with buttons disabled.

### 2.3 Unbounded Client Loading State (Absence of Request Timeout)
- **Location:** `apps/web/src/stores/gameStore.ts`
- **Mechanism:** `acceptWildDrawFour`, `acceptWildDrawTwo`, `acceptWildDrawColor`, and `acceptStackPenalty` set `isActionLoading: true` with an indefinite `new Promise()`.
- **Impact:** If an ack was dropped or delayed by transient network issues, `isActionLoading` remained `true` permanently. Because action buttons were disabled when `isActionLoading === true`, the player could never click again, permanently freezing the match.

### 2.4 Promise Chain Poisoning in `GameSessionManager.runWithLock`
- **Location:** `apps/server/src/modules/game/game.session.manager.ts`
- **Mechanism:** In `GameSessionManager`, `runWithLock` serialized actions by chaining promises: `session.actionLock = session.actionLock.then(...)`. If an action rejected with an error, the unhandled rejection in the chain poisoned all subsequent `runWithLock` executions for that match.
- **Impact:** Furthermore, rapid double-clicks on "Accept Cards" caused the second request to arrive after the penalty had resolved. The second request failed with `NO_PENDING_CHALLENGE`, reporting a bogus error and desynchronizing the client.

### 2.5 Victim Index Resolution Mismatch in No Mercy Stack Processing
- **Location:** `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts` (`processStackAccept`)
- **Mechanism:** `processStackAccept` resolved the victim via `const playerIndex = state.currentPlayerIndex;` instead of querying `state.players.findIndex(p => p.id === pending.targetPlayerId)`.
- **Impact:** If `currentPlayerIndex` was transiently out of sync with `pending.targetPlayerId`, cards were drawn into the wrong player's hand, leaving the intended victim waiting indefinitely.

### 2.6 False Challenge Banner Rendering
- **Location:** `apps/web/src/features/game/components/ChallengePanel.tsx`
- **Mechanism:** `ChallengePanel` rendered "Waiting for victim to accept or challenge..." unconditionally whenever `pendingActionState` was truthy, even during No Mercy stack penalties, All Wild targeted actions, or 7s swaps.

---

## 3. Implemented Fixes

### 3.1 Server Socket Registration & Self-Healing Broadcasts
1. **Authenticated Socket Registration Helper:**
   - Implemented `registerAuthenticatedGuestSocket(io, socket, guestId)` in `apps/server/src/sockets/roomSocketHandler.ts`.
   - Guaranteed replacement of stale socket entries, registration in `guestSockets`, and invocation of `roomService.restoreConnection()` with private state delivery.
   - Connected `registerAuthenticatedGuestSocket` to `socket.on(SOCKET_EVENTS.AUTH_AUTHENTICATE)`.
2. **State Publisher Self-Healing:**
   - Updated `publishToPlayer` in `apps/server/src/modules/game/game.state.publisher.ts` to accept `io?: UnoServer`.
   - If `guestSockets` lookup fails or socket is disconnected, it scans active sockets on `io.sockets.sockets` for a matching `socket.data.guestId`, restores the mapping, and delivers the broadcast.

### 3.2 Authoritative State in Socket Acknowledgements & Structured Diagnostics
1. Updated `GAME_ACCEPT_WILD_DRAW_FOUR`, `GAME_ACCEPT_WILD_DRAW_TWO`, `GAME_ACCEPT_WILD_DRAW_COLOR`, and `GAME_ACCEPT_STACK_PENALTY` in `apps/server/src/modules/game/game.socket.handler.ts` to return:
   ```ts
   callback({
     success: true,
     data: { accepted: true, cardsDrawn: N, state: getPlayerGameState(nextState, guestId) },
   });
   ```
2. Added structured diagnostic logging with start/complete duration metrics, sequence numbers, and card counts (with automatic token/secret sanitization).
3. Updated `@uno-ultimate/game-protocol` to type `state?: unknown` on all penalty acceptance ack payloads.

### 3.3 Safe Idempotency & Lock Hardening
1. Added `lastResolvedPenalty` tracking to `ActiveGameSession` in `apps/server/src/modules/game/game.session.manager.ts`.
2. Hardened `runWithLock` with `.catch(() => {})` so rejected actions can never break subsequent lock acquisitions.
3. In `gameService.executeAction`, added idempotent absorption: duplicate accept requests from the victim immediately return the authoritative session state without error (`success: true`, 0 cards drawn).

### 3.4 Target Player Resolution in No Mercy Game Engine
Updated `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`:
```ts
const targetIdx = state.players.findIndex((p) => p.id === pending.targetPlayerId);
const playerIndex = targetIdx !== -1 ? targetIdx : state.currentPlayerIndex;
const player = state.players[playerIndex];
```

### 3.5 Frontend Immediate Feedback, Double-Click Guard & 5s Timeout
1. In `apps/web/src/stores/gameStore.ts`:
   - Added guard: `if (get().isActionLoading) return false;` to prevent rapid duplicate clicks.
   - Added 5000ms timeout with cleanup: on timeout, sets `isActionLoading: false` and friendly error message.
   - On success, if `res.data?.state` is present, updates `gameState` directly without waiting for asynchronous broadcast.
2. In `apps/web/src/features/game/components/ChallengePanel.tsx`:
   - Filtered out non-challenge pending states (`AWAITING_WILD_DRAW_FOUR_RESOLUTION`, `AWAITING_WILD_DRAW_TWO_RESOLUTION`, `AWAITING_WILD_DRAW_COLOR_RESOLUTION`).
   - Added visual loading state with spinner and "Accepting..." label when `isActionLoading` is true.
3. In `apps/web/src/features/game/components/StackPenaltyBanner.tsx`:
   - Added visual loading state with spinner and "Accepting..." label when `isLoading` is true.

---

## 4. Automated Test Verification

A dedicated integration test suite was created in `apps/server/tests/integration/penalty-acceptance.socket.test.ts` covering all 18 required scenarios:

| # | Test Scenario | Result |
|---|---|---|
| 1 | Accepting Wild Draw 2 (Flip / GDR44 rules) | PASS |
| 2 | Accepting Wild Draw 4 (Classic 42001 rules) | PASS |
| 3 | Accepting No Mercy draw penalties (+4, +6, +10) via `GAME_ACCEPT_STACK_PENALTY` | PASS |
| 4 | Accepting Wild Reverse Draw 4 rebound in No Mercy (reverses direction, penalizes target) | PASS |
| 5 | Correct penalty card count added to victim hand | PASS |
| 6 | Correct card ownership (drawn cards belong exclusively to victim hand) | PASS |
| 7 | Correct pending-action cleanup on session and broadcasted state | PASS |
| 8 | Correct turn advancement skipping victim | PASS |
| 9 | Safe idempotent absorption of concurrent duplicate accept requests | PASS |
| 10 | Rejection of non-targeted player attempting acceptance (`INVALID_PLAYER`) | PASS |
| 11 | Rejection of accept request with stale state (`NO_PENDING_CHALLENGE`) | PASS |
| 12 | Delayed Socket.IO acknowledgement handled by client 5s timeout | PASS |
| 13 | Player disconnection during pending penalty without session crash | PASS |
| 14 | Player reconnection during pending penalty restoring active penalty status via `guestSockets` | PASS |
| 15 | Serialization of rapid repeated button clicks without double-drawing | PASS |
| 16 | Synchronized authoritative `GAME_STATE` broadcast to both players | PASS |
| 17 | Draw pile recycling and reshuffling when draw pile has fewer cards than penalty | PASS |
| 18 | Multiple consecutive penalty actions across successive turns | PASS |

---

## 5. Quality Gate Verification

All quality gates passed with zero errors:

1. **Game Engine Test Suite:**
   - Command: `pnpm --filter @uno-ultimate/game-engine test`
   - Output: 29 test files passed, 386 tests passed.
2. **Server Test Suite:**
   - Command: `pnpm --filter @uno-ultimate/server test`
   - Output: 20 test files passed, 135 tests passed.
3. **Web Test Suite:**
   - Command: `pnpm --filter @uno-ultimate/web test`
   - Output: 23 test files passed, 103 tests passed.
4. **TypeScript Strict Typecheck:**
   - Command: `pnpm -r typecheck`
   - Output: 6/6 packages and applications passed with 0 errors.
5. **ESLint Static Analysis:**
   - Command: `pnpm -r lint`
   - Output: 0 errors, 0 warnings.
6. **Production Build:**
   - Command: `pnpm build`
   - Output: All packages, Prisma client, server bundle, and Vite client build succeeded.
