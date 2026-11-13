# UNO Ultimate — Phase 4.1: Rules, Event Integrity & Recovery Architecture

## 1. Executive Summary & Audit Scope

Phase 4.1 conducts a targeted correctness and reliability audit of the UNO Ultimate multiplayer platform following the completion of Phase 4.
The core objective of this phase is to harden game-engine mechanics against official Mattel 42001 rules, enforce strictly monotonic and unbroken game event sequencing, ensure ACID transactional persistence, verify cold-start server crash recovery, and establish automated browser end-to-end testing with multi-context Playwright suites.

---

## 2. Opening Reverse Mechanics (Correction A)

### 2.1 The Mattel 42001 Specification
Under official Mattel 42001 instructions:
> *"Reverse: If this card is turned up to begin play, the dealer plays first, then play moves to the right instead of the left (counter-clockwise)."*

In circular seating with dealer index $D$ and $N$ players, moving counter-clockwise (to the right of the dealer) designates the first active player index as:

$$\text{FirstPlayer} = (D - 1 + N) \pmod N$$

### 2.2 Concrete Seating Calculations
- **4 Players ($N=4, D=0$)**: Player to dealer's right is $(0 - 1 + 4) \pmod 4 = 3$. Play proceeds counter-clockwise: $3 \to 2 \to 1 \to 0$.
- **3 Players ($N=3, D=0$)**: Player to dealer's right is $(0 - 1 + 3) \pmod 3 = 2$. Play proceeds counter-clockwise: $2 \to 1 \to 0$.
- **2 Players ($N=2, D=0$)**: Player to dealer's right is $(0 - 1 + 2) \pmod 2 = 1$, which is the non-dealer opponent. Play continues alternating counter-clockwise.

### 2.3 Implementation Details
Implemented in `packages/game-engine/src/game/game.factory.ts`:
- **Round 1 (`createGame`)**:
  ```typescript
  if (topDiscardCard.value === 'reverse') {
    turnDirection = 'counter_clockwise';
    currentPlayerIndex = TurnManager.getNextPlayerIndex(dealerIndex, playerCount, 'counter_clockwise', 1);
  }
  ```
- **Subsequent Rounds (`startNextRound`)**:
  Applies the identical circular counter-clockwise offset relative to `newDealerIndex`.

---

## 3. Canonical Dealer Determination (Correction B)

### 3.1 Point Value System
Per official Mattel 42001 instructions:
- Each candidate draws a single card from the canonical 108-card deck.
- Highest card points deals.
- Point values:
  - **Number cards (0–9)**: Face value (0 to 9 points).
  - **Action cards (Skip, Reverse, Draw Two)**: **20 points** each.
  - **Wild cards (Wild, Wild Draw Four)**: **50 points** each.

### 3.2 Tie-Breaking Algorithm
If multiple players tie for the highest point value (e.g. two players draw Wild cards or 20-point Action cards):
1. Non-tied candidates are eliminated.
2. The remaining tied players redraw cards until a single unique winner emerges.
3. Shuffled using the engine's deterministic, injectable `RandomNumberGenerator`.

Implemented in `packages/game-engine/src/game/game.factory.ts` (`determineDealer()`).

---

## 4. Game Event Sequence Monotonicity & Invariant (Correction C)

### 4.1 Sequence Gap Problem
In Phase 4, multi-event actions (e.g. playing a card that triggers a draw and turn advance) incremented event sequence numbers locally while `nextState.sequenceNumber` remained incremented only once. Subsequent actions attempted to use duplicate or gapped sequence numbers, colliding with the database constraint:

```prisma
@@unique([matchId, sequenceNumber])
```

### 4.2 Sequence Invariant Formulation
To guarantee strictly monotonic, gapless, and collision-free event ordering, the engine enforces the following invariant across all actions:

$$\text{nextState.sequenceNumber} \equiv \begin{cases} \text{events.at}(-1)\text{.sequenceNumber}, & \text{if } |\text{events}| > 0 \\ \text{state.sequenceNumber}, & \text{otherwise} \end{cases}$$

### 4.3 Engine Processing Logic
Implemented in `packages/game-engine/src/actions/action.processor.ts`:
```typescript
let runningSeq = state.sequenceNumber;
for (const rawEvent of generatedEvents) {
  runningSeq++;
  finalEvents.push({
    ...rawEvent,
    sequenceNumber: runningSeq,
  });
}

return {
  nextState: {
    ...intermediateState,
    sequenceNumber: runningSeq,
  },
  events: finalEvents,
};
```
Every single action emitted by the engine advances `sequenceNumber` to match the exact sequence number of the final generated event.

---

## 5. Atomic Transactional Persistence (Correction D)

### 5.1 Architecture: Single Prisma `$transaction`
To prevent torn state or database-to-memory desynchronization during network failures, crashes, or constraint errors, `apps/server/src/modules/game/game.persistence.service.ts` encapsulates all match mutations in a single atomic transaction:

```
┌────────────────────────────────────────────────────────┐
│               prisma.$transaction                      │
│                                                        │
│  1. Update Match record (status, round, score, winner) │
│  2. Update MatchPlayer records (score, cardCount)      │
│  3. Insert GameEvent records (events 1..N)             │
│  4. Upsert GameSnapshot record (serialized GameState)  │
└────────────────────────────────────────────────────────┘
```

### 5.2 Failure Invariant
- If any database operation fails within the transaction, Prisma performs an automatic rollback.
- In `game.service.ts`, `persistActionBatch` is awaited **prior** to updating in-memory session state:
  ```typescript
  await this.persistenceService.persistActionBatch(matchId, nextState, events);
  activeSession.state = nextState; // Advances ONLY after database commit succeeds
  ```
- If the persistence transaction fails, an exception is thrown, the in-memory state remains untouched, and no corrupt state is broadcast.

---

## 6. Cold Server-Restart Rehydration & Recovery (Correction E)

### 6.1 Recovery Flow Diagram
```mermaid
sequenceDiagram
    autonumber
    actor Player as Disconnected Client
    participant Web as Web Client (Vite)
    participant Socket as Socket.IO Handler
    participant RoomSvc as RoomService
    participant GameSvc as GameService
    participant DB as PostgreSQL (Prisma)

    Note over Player, DB: Server crash / cold restart occurs; in-memory sessions lost
    Player->>Web: Re-opens app / browser reload
    Web->>Socket: emit("room:resume", { roomCode })
    Socket->>RoomSvc: getRoomByCode(roomCode)
    RoomSvc-->>Socket: room (status: "IN_GAME")
    Socket->>GameSvc: getOrRecoverPlayerState(guestId, roomId, roomCode)
    GameSvc->>GameSvc: Check in-memory activeSession
    Note over GameSvc: In-memory session NOT FOUND
    GameSvc->>DB: recoverMatchIfActive(roomId)
    DB-->>GameSvc: Latest GameSnapshot (sequenceNumber, state)
    GameSvc->>GameSvc: Register recovered activeSession in GameSessionManager
    GameSvc->>GameSvc: projectForPlayer(recoveredState, guestId)
    GameSvc-->>Socket: PlayerGameState
    Socket->>Web: emit("game:state", { state: PlayerGameState })
    Web->>Player: Renders private hand and active table
```

### 6.2 Key Verification Gates
- **Membership Verification**: Prevents unauthorized guests from snooping active matches.
- **Snapshot Integrity**: The latest `GameSnapshot` is deserialized with intact draw/discard piles, player hands, active color, and turn pointers.
- **Personalized Projection**: Only the recovering player's own 7 cards are decrypted and sent in `self.hand`; opponent hands remain obscured as counts.

---

## 7. Production Countdown Bypass Protection (Correction G)

In `apps/server/src/sockets/roomSocketHandler.ts`:
- In development/production environments, a 5-second countdown notification (`room:starting`) is unconditionally enforced before the game engine initializes.
- The `immediate: true` test parameter is strictly guarded:
  ```typescript
  const isTestEnv = process.env.NODE_ENV === 'test';
  const allowImmediate = isTestEnv && payload?.immediate === true;
  const countdownMs = allowImmediate ? 0 : 5000;
  ```
- Any unauthorized payload sending `immediate: true` in non-test environments is ignored, maintaining the 5000ms countdown.

---

## 8. Multi-Context Browser E2E Suite with Playwright (Correction F)

Located in `apps/web/tests/e2e/multiplayer-game.spec.ts`:
- Utilizes Google Chrome via Playwright (`channel: 'chrome'`).
- Runs two completely isolated browser contexts (`contextAlice` and `contextBob`), simulating real devices on separate networks.
- Automates:
  1. Room creation and 6-character code extraction.
  2. Room joining via code and direct invitation URL (`/join/:roomCode`).
  3. Ready toggling and host game start.
  4. 5-second starting countdown banner presentation.
  5. Dealing 7 cards to both participants.
  6. Real-time turn progression, card play, and discard pile synchronization.
  7. Active match disconnection and browser reload recovery.
