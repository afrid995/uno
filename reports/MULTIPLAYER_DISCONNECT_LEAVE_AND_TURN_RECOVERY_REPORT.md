# Multiplayer Disconnect, Leave, Logout, and Automatic Turn Recovery Report

**Project:** UNO Ultimate  
**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** November 16, 2026  
**Scope:** Server-Authoritative Player Lifecycle Management, Grace Period Disconnects, Intentional Departures, and Turn Recovery across all Seven UNO Variants  

---

## 1. Executive Summary

In multiplayer card games, unexpected player disconnections (due to network drops, closing tabs, or device sleep) and intentional departures (clicking "Leave Room", "Main Menu", or logging out) frequently jeopardize game continuity. Prior to this phase, when an active player disconnected or left during an in-progress match, the server updated room membership records in PostgreSQL, but **failed to inform the active game session or advance the game engine**. 

As a result:
- The game engine remained indefinitely halted awaiting an action from the vanished player.
- Pending actions (such as Wild color selection, draw penalties, 7-swap, or attack targets) remained unresolvable.
- When all but one player left, the lone remaining player was trapped in a zombie room with no declared victory.

This engineering phase implements a **bulletproof, server-authoritative player lifecycle management and turn recovery system** across the entire stack:
1. **30-Second Reconnection Grace Period:** Disconnecting players are granted 30 seconds to restore their socket connection without loss of turn or cards.
2. **Real-Time Disconnect Broadcasts & Badges:** Opponents receive real-time notifications with animated status badges and active countdown timers.
3. **Immediate Turn Progression on Intentional Leave:** Players clicking "Leave Room" or logging out immediately trigger turn recovery without any 30-second delay.
4. **Variant-Specific Departure & Card Conservation:**
   - **UNO Show ’em No Mercy:** Departing players' hands and absorbed stack penalties are moved into `state.setAsideCards`, strictly preserving the canonical 168-card conservation law.
   - **Classic, Flip, All Wild, Flex, Attack:** Departing players' hands are placed under the top card of the discard pile, preserving total cards in circulation.
   - **UNO Teams:** Departure of any player in a standard 4-player (2v2) match that breaks team balance immediately awards victory to the intact opposing team.
5. **Safe Pending Action Resolution:** Interrupted Wild color choices, stack penalties, challenge windows, hand swaps, and launcher targeting are resolved safely and deterministically without runtime exceptions or freeze states.
6. **Insufficient Active Player Resolution:** If departures reduce active players to fewer than 2 (or fewer than 2 active teams in UNO Teams), the sole remaining player or team is declared match winner by forfeit/default. Match status is set to `COMPLETED` and persisted atomically.

---

## 2. Root Cause Investigation

A systematic audit across `apps/server/src/sockets/roomSocketHandler.ts`, `apps/server/src/modules/room/room.service.ts`, and `apps/server/src/modules/game/game.session.manager.ts` revealed three fundamental architectural gaps:

1. **Disconnection Handlers Isolated to Room Service:**
   - When a socket disconnected, `roomSocketHandler.ts` invoked `roomService.markDisconnected(guestId, { onGracePeriodExpired })`.
   - When the 30-second timer elapsed, `onGracePeriodExpired` invoked `roomService.leaveRoom(guestId, roomCode)`.
   - While `leaveRoom` deleted the `RoomMember` record in PostgreSQL and transferred host status if needed, it **never notified `gameSessionManager` or `gameService`**.
   - The memory-resident `GameState` retained the departed player in `state.players` and `state.playerOrder`. If `state.playerOrder[state.currentPlayerIndex] === guestId`, `isCurrentTurn` never advanced.

2. **Missing In-Game Departure Trigger in `ROOM_LEAVE`:**
   - When a player explicitly emitted `SOCKET_EVENTS.ROOM_LEAVE`, the server invoked `roomService.leaveRoom(guestId)` and removed the socket from the room.
   - It did not check whether an active match was running or recover the turn, freezing the match for all remaining participants.

3. **Absence of Default/Forfeit Victory Logic:**
   - When players dropped out leaving only 1 active player, the game engine lacked logic to declare the remaining player the winner and transition the match to `COMPLETED`.

---

## 3. Architecture & Protocol Additions

Four new server-authoritative socket events and typed payloads were added to `@uno-ultimate/game-protocol`:

### Protocol Event Definitions (`packages/game-protocol/src/events.ts`)

```typescript
export const SOCKET_EVENTS = {
  ...
  GAME_PLAYER_DISCONNECTED: 'game:player-disconnected',
  GAME_PLAYER_RECONNECTED: 'game:player-reconnected',
  GAME_PLAYER_DEPARTED: 'game:player-departed',
  GAME_TURN_RECOVERED: 'game:turn-recovered',
} as const;

export interface GamePlayerDisconnectedPayload {
  guestId: string;
  username: string;
  disconnectTimestamp: number;
  gracePeriodSeconds: number;
}

export interface GamePlayerReconnectedPayload {
  guestId: string;
  username: string;
}

export interface GamePlayerDepartedPayload {
  guestId: string;
  username: string;
  reason: 'DISCONNECT_TIMEOUT' | 'INTENTIONAL_LEAVE';
}

export interface GameTurnRecoveredPayload {
  departedGuestId: string;
  departedUsername: string;
  newCurrentTurnGuestId: string;
  reason: 'DISCONNECT_TIMEOUT' | 'INTENTIONAL_LEAVE';
  message: string;
}
```

---

## 4. Server-Authoritative Turn Recovery Engine

The core recovery engine was implemented in `GameService.handlePlayerDeparture` in `apps/server/src/modules/game/game.service.ts`.

### Concurrency & Per-Match Serialization
All departure handling runs inside `gameSessionManager.runWithLock(session.matchId, async (activeSession) => { ... })`. This serializes player departure operations with concurrent card plays, draws, and socket reconnections, preventing race conditions.

### Flowchart: Player Departure & Turn Progression Lifecycle

```mermaid
flowchart TD
    A[Player Departure Triggered] --> B{Departure Type?}
    B -->|Socket Disconnect| C[Start 30s Grace Period Timer]
    C --> D{Player Reconnected within 30s?}
    D -->|Yes| E[Cancel Timer & Emit GAME_PLAYER_RECONNECTED]
    D -->|No: Timer Expired| F[Finalize Departure: DISCONNECT_TIMEOUT]
    B -->|Intentional ROOM_LEAVE / Logout| G[Immediate Finalize Departure: INTENTIONAL_LEAVE]
    
    F --> H[Acquire Session Per-Match Mutex Lock]
    G --> H
    
    H --> I{Active Players Remaining?}
    I -->|< 2 Active Players / < 2 Teams| J[Declare Remaining Player / Team Match Winner]
    J --> K[Persist COMPLETED Snapshot to DB]
    K --> L[Emit GAME_FINISHED & Update Room to FINISHED]
    
    I -->|>= 2 Active Players| M[Recycle Departing Cards]
    M --> N[Resolve Pending Action States]
    N --> O{Was Departing Player Active Turn?}
    O -->|Yes| P[Advance Turn in turnDirection to Next Active Player]
    O -->|No| Q[Retain Turn with Current Active Player]
    P --> R[Reset Turn Flags: hasDrawnThisTurn=false, drawnCardId=null]
    Q --> S[Persist Action Batch Snapshot to DB]
    R --> S
    S --> T[Emit GAME_PLAYER_DEPARTED & GAME_TURN_RECOVERED]
    T --> U[Publish Personalized State Projections to Remaining Players]
```

### Turn Progression Math
When an active player departs:
1. Identify the departing player's seating index `depIdx` in `oldPlayerOrder`.
2. Compute rotation step: `const step = state.turnDirection === 'clockwise' ? 1 : -1`.
3. Loop forward in `turnDirection` to identify the next eligible player present in `remainingActivePlayers`:
   ```typescript
   let candidateIdx = (((depIdx + step) % oldPlayerOrder.length) + oldPlayerOrder.length) % oldPlayerOrder.length;
   while (candidateIdx !== depIdx) {
     const candidateId = oldPlayerOrder[candidateIdx];
     if (remainingActiveIds.has(candidateId)) {
       nextActiveGuestId = candidateId;
       break;
     }
     candidateIdx = (((candidateIdx + step) % oldPlayerOrder.length) + oldPlayerOrder.length) % oldPlayerOrder.length;
   }
   ```
4. Reset turn flags on `nextActiveGuestId`: `hasDrawnThisTurn: false`, `drawnCardId: null`.
5. Monotonically increment `sequenceNumber` and `turnNumber`.

---

## 5. Pending Action Safe Resolution Matrix

When a player departs mid-action, the state is sanitized according to the following resolution rules:

| Pending Action State | Variant | Scenario | Resolution |
| :--- | :--- | :--- | :--- |
| `AWAITING_STACK_RESOLUTION` | No Mercy / Flex | Target/victim departs while facing accumulated penalty | Penalty cards drawn from draw pile into `setAsideCards`, stack cleared (`pendingActionState = null`), turn advances to next active player. |
| `AWAITING_WILD_DRAW_FOUR_RESOLUTION` | Classic / Flip / Flex / Teams / Attack | Victim or played-by departs during challenge window | Challenge window closed (`pendingActionState = null`), turn advances cleanly. |
| `AWAITING_STARTING_WILD_COLOR_SELECTION` | Classic / Flip / Flex | Designated starter departs before picking color | `activeColor` defaults to top discard color (or 'red' if wild), `pendingActionState = null`, turn advances to next player. |
| `AWAITING_7S_SWAP_SELECTION` | No Mercy | Initiator departs before selecting swap target | Hand swap cancelled (`pendingActionState = null`), turn advances. |
| `AWAITING_COLOR_ROULETTE_SELECTION` | No Mercy | Target departs before selecting roulette color | Roulette cancelled (`pendingActionState = null`), turn advances. |
| `AWAITING_TARGETED_DRAW_TWO / FOUR` | Flex | Initiator departs before selecting target | Targeted draw cancelled, turn advances. |
| `AWAITING_FORCED_SWAP_SELECTION` | All Wild | Initiator departs before selecting target | Forced swap cancelled, turn advances. |
| `AWAITING_ATTACK_TARGET_SELECTION` | Attack | Initiator departs before selecting target | Target selection cancelled, turn advances. |
| `AWAITING_TEAM_CARD_PASS` | Teams | Any participating player departs | Team card pass cancelled, match resolved or turn advances. |
| `activeColor === null` | Any | Player played Wild and departed before choosing color | Defaults safely to top discard card's color or `'red'`. |
| `inspectionHand` | Any | Challenger or offender departs | `inspectionHand` cleared to `null`. |
| `unoVulnerablePlayerId` | Any | Vulnerable player departs | `unoVulnerablePlayerId` cleared to `null`. |

---

## 6. Card Conservation & 168-Card Law Compliance

UNO Ultimate enforces strict card conservation across all variants to avoid card duplication or loss:

1. **UNO Show ’em No Mercy (Strict 168-Card Law):**
   - Departing player's entire hand is appended to `state.setAsideCards`.
   - If the player was facing a pending stack penalty (e.g. +4), the penalty cards are drawn from `state.drawPile` and appended to `state.setAsideCards`.
   - **Invariant:** `drawPile.length + discardPile.length + setAsideCards.length + sum(player.hand.length) === 168`. Verified by automated integration testing.

2. **Classic UNO, UNO Flip, UNO All Wild, UNO Flex, UNO Teams, UNO Attack:**
   - Departing player's hand is inserted into `discardPile` immediately beneath the top card:
     ```typescript
     if (newDiscardPile.length > 1) {
       const top = newDiscardPile[newDiscardPile.length - 1];
       const rest = newDiscardPile.slice(0, -1);
       newDiscardPile = [...rest, ...departedPlayer.hand, top];
     } else {
       newDiscardPile = [...departedPlayer.hand, ...newDiscardPile];
     }
     ```
   - Total deck count (108 cards in Classic, 112 cards in Flip/All Wild/Flex/Teams/Attack) is permanently conserved. When the draw pile depletes, discard pile reshuffling seamlessly recycles these cards back into circulation.

---

## 7. Frontend Round-Table Integration

The frontend was updated to provide immediate, intuitive visual feedback when opponents disconnect or turns are recovered:

1. **`useGameStore` (`apps/web/src/stores/gameStore.ts`):**
   - Tracks `disconnectedPlayers: Record<string, { disconnectTimestamp: number; gracePeriodSeconds: number }>`.
   - Tracks `turnRecoveryNotification: string | null`.
   - Binds listeners for `GAME_PLAYER_DISCONNECTED`, `GAME_PLAYER_RECONNECTED`, `GAME_PLAYER_DEPARTED`, and `GAME_TURN_RECOVERED`.
   - Automatically cleans up expired notifications and timers.

2. **`PlayerSeat` Component (`apps/web/src/features/game/components/PlayerSeat.tsx`):**
   - When `disconnectInfo` is active for a seated player, renders a pulsing rose badge with real-time countdown:
     ```tsx
     {disconnectInfo && (
       <div
         data-testid="disconnected-badge"
         className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/60 text-rose-300 font-bold text-[9px] uppercase tracking-wider animate-pulse"
       >
         <WifiOff className="w-2.5 h-2.5" />
         <span>DISCONNECTED ({secondsRemaining}s)</span>
       </div>
     )}
     ```
   - Implements a self-ticking 1-second interval effect that recalculates remaining grace period seconds dynamically.

3. **`RoundTable` Center Arena Banner (`apps/web/src/features/game/components/RoundTable.tsx`):**
   - Renders a turn-recovery banner above the center piles whenever `turnRecoveryNotification` is populated:
     ```tsx
     {turnRecoveryNotification && (
       <div
         data-testid="turn-recovery-banner"
         className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/90 to-yellow-400/90 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-glow-amber animate-bounce flex items-center gap-2"
       >
         <span>⚡</span>
         <span>{turnRecoveryNotification}</span>
       </div>
     )}
     ```

4. **Match Result Modal Integration:**
   - When a match concludes by forfeit/departure ($< 2$ active players), `GAME_FINISHED` triggers the existing `MatchResultModal`, presenting the champion and final standings.

---

## 8. Automated Test Matrix

A comprehensive suite of automated tests was designed and executed, verifying all aspects of the player lifecycle and turn recovery system:

### 1. Server Socket Integration Tests (`apps/server/tests/integration/game.disconnect.turn-recovery.socket.test.ts`)

| # | Test Scenario | Verified Assertions | Result |
| :--- | :--- | :--- | :--- |
| **1** | Non-active player disconnects and reconnects within grace period | `GAME_PLAYER_DISCONNECTED` broadcast with 30s timer; on reconnect, `GAME_PLAYER_RECONNECTED` emitted; active player's turn remains uninterrupted. | **PASS** |
| **2** | Active player disconnects $\rightarrow$ 30s grace period expires | Configured 100ms test grace timer expires; `GAME_PLAYER_DEPARTED` emitted with `reason: 'DISCONNECT_TIMEOUT'`; `GAME_TURN_RECOVERED` advances turn clockwise to next active player; turn flags reset. | **PASS** |
| **3** | Active player intentionally leaves (`ROOM_LEAVE`) | Turn advances immediately ($< 1000$ms, no 30s delay); `GAME_PLAYER_DEPARTED` and `GAME_TURN_RECOVERED` emitted with `reason: 'INTENTIONAL_LEAVE'`. | **PASS** |
| **4** | 2-Player match departure forfeit | When 1 of 2 players departs, remaining player is immediately declared match winner; `GAME_FINISHED` emitted; DB match updated to `COMPLETED` and room to `FINISHED`. | **PASS** |
| **5** | UNO No Mercy pending stack resolution | Active player departs while facing +4 stack; penalty cards drawn into `setAsideCards`; departing hand placed into `setAsideCards`; 168-card total strictly verified. | **PASS** |
| **6** | UNO Teams 4-player 2v2 match departure | Player on Team 2 departs; remaining Team 1 (2 players) declared match winner by default/forfeit; `GAME_FINISHED` emitted. | **PASS** |
| **7** | Counter-clockwise turn direction preservation | Reverse card in effect (`turnDirection = 'counter_clockwise'`); active player departs; turn advances counter-clockwise to preceding seat index. | **PASS** |

### 2. Frontend Component Tests (`apps/web/src/features/game/components/__tests__/DisconnectRecovery.test.tsx`)

| # | Test Scenario | Verified Assertions | Result |
| :--- | :--- | :--- | :--- |
| **1** | `PlayerSeat` disconnected badge display | Renders pulsing `DISCONNECTED (25s)` badge when `disconnectInfo` provided. | **PASS** |
| **2** | `PlayerSeat` connected state | Does not render disconnected badge when `disconnectInfo` is undefined. | **PASS** |
| **3** | `RoundTable` turn recovery banner | Renders `turn-recovery-banner` with message text when `turnRecoveryNotification` is set. | **PASS** |
| **4** | `RoundTable` opponent seat prop forwarding | Forwards `disconnectInfo` to the correct opponent seat. | **PASS** |
| **5** | `useGameStore` disconnect/reconnect state | State updates `disconnectedPlayers` dictionary and cleans up on reconnect. | **PASS** |
| **6** | `useGameStore` turn recovery notification | Notification set and clears on `dismissTurnRecoveryNotification`. | **PASS** |

---

## 9. Verification & Free-Tier Budget Compliance

### Monorepo Validation Results

- **`game-engine` Tests:** 29 test files, 386 tests passing (100%).
- **`server` Tests:** 23 test files, 160 tests passing (100%).
- **`web` Tests:** 28 test files, 151 tests passing (100%).
- **TypeScript Typecheck (`pnpm -r typecheck`):** 0 errors across all 6 packages.
- **ESLint (`pnpm -r lint`):** 0 errors across all 6 packages.
- **Production Build (`pnpm -r build`):** Clean compilation across all packages.

### Free-Tier Budget Compliance ($0/month)
- No additional infrastructure, external Redis, or third-party orchestration required.
- In-memory reconnection timers and mutex locks operate strictly within the free Render Node.js runtime limits ($0/month).
- PostgreSQL transactions utilize existing Neon connection pools ($0/month).
- Frontend assets bundle cleanly within Vercel Hobby static hosting limits ($0/month).

---

## 10. Conclusion

The multiplayer disconnect, leave, and turn recovery system is fully implemented, verified, and integrated into UNO Ultimate. Games are no longer susceptible to freezes or orphan state when players disconnect, leave, close their browsers, or log out. The solution preserves mathematical card conservation across all variants, provides real-time UI feedback, and guarantees that remaining players can always complete their games.
