# UNO Ultimate — Phase 2: Socket.IO Event Specification

This document details the strongly-typed WebSocket event contract implemented in `@uno-ultimate/game-protocol` and enforced across `@uno-ultimate/server` and `@uno-ultimate/web`.

---

## 1. Authentication & Connection Handshake

All Socket.IO connections must be authenticated against an active guest session established during Phase 1.

### Handshake Authentication Flow
1. **Cookie Authentication (Primary)**: The client includes credentials (`withCredentials: true`), allowing Socket.IO to extract the `uno_session` HttpOnly cookie automatically.
2. **Auth Token Payload (Fallback)**: When cookies are unavailable, the client transmits `{ auth: { token: "<sessionToken>" } }` in the handshake configuration.
3. **Impersonation Prevention**: Sockets cannot specify arbitrary `guestId` or `username` values. The server resolves the identity strictly from the cryptographically hashed session token in PostgreSQL.
4. **Duplicate Tab Handling**: If a guest opens a new connection while an older socket is active, the server terminates the older socket with a `SESSION_REPLACED` error.

---

## 2. Standard Acknowledgement Contract

Requests from client to server utilize acknowledgment callbacks conforming to the generic `SocketAck<T>` type:

```typescript
export type SocketAck<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };
```

---

## 3. Client-to-Server Events

### 3.1 `room:create`
Creates a new private room with the calling guest as `HOST`.

- **Payload (`CreateRoomInput`)**:
  ```typescript
  {
    maxPlayers?: number; // 2 to 10, defaults to 6
    settings?: Record<string, unknown>; // Optional room settings
  }
  ```
- **Acknowledgement Callback**: `SocketAck<RoomPublicDto>`
- **Server Actions**:
  - Validates payload with `createRoomSchema`.
  - Leaves any previously joined rooms.
  - Generates unique 6-character room code.
  - Inserts `Room` and `RoomMember` records atomically.
  - Joins socket to the room channel.
  - Emits `room:created` to calling client.

---

### 3.2 `room:join`
Joins an existing private room using a 6-character room code.

- **Payload (`JoinRoomInput`)**:
  ```typescript
  {
    roomCode: string; // 6 uppercase alphanumeric chars
  }
  ```
- **Acknowledgement Callback**: `SocketAck<RoomPublicDto>`
- **Server Actions**:
  - Validates code with `joinRoomSchema`.
  - Enforces capacity (`playerCount < maxPlayers`).
  - Rejects if room status is not `WAITING`.
  - Idempotently restores presence if member had temporarily disconnected.
  - Joins socket to room channel.
  - Broadcasts `room:player-joined` and updated `room:state` to all room members.

---

### 3.3 `room:join-link`
Alias for `room:join` specifically triggered when entering via an invitation URL (`/join/:roomCode`).
- **Payload & Behaviour**: Identical to `room:join`.

---

### 3.4 `room:leave`
Voluntarily exits the current room.

- **Payload**: None (`{}`)
- **Acknowledgement Callback**: `SocketAck<{ left: boolean }>`
- **Server Actions**:
  - Removes calling member from room in database.
  - Removes socket from Socket.IO room channel.
  - If the member was the `HOST`, executes deterministic host transfer to earliest remaining member (`joinedAt ASC`) and emits `room:host-changed`.
  - If no members remain, marks room `FINISHED`.
  - Broadcasts `room:player-left` and updated `room:state`.

---

### 3.5 `room:ready`
Toggles or sets the ready status of the calling player.

- **Payload (`ReadyStatusInput`)**:
  ```typescript
  {
    isReady: boolean;
  }
  ```
- **Acknowledgement Callback**: `SocketAck<{ readyStatus: boolean }>`
- **Server Actions**:
  - Validates payload with `readyStatusSchema`.
  - Updates member's `readyStatus` in PostgreSQL.
  - Increments `room.version`.
  - Broadcasts `room:player-ready` and updated `room:state`.

---

### 3.6 `room:update-settings`
Updates room capacity or configuration (Host only).

- **Payload (`UpdateRoomSettingsInput`)**:
  ```typescript
  {
    settings: {
      maxPlayers?: number;
      [key: string]: unknown;
    };
  }
  ```
- **Acknowledgement Callback**: `SocketAck<Record<string, unknown>>`
- **Authorization**: Rejects with `HOST_ONLY_ACTION` if caller is not the room host.
- **Server Actions**:
  - Updates room record in PostgreSQL.
  - Increments `room.version`.
  - Broadcasts updated `room:state`.

---

### 3.7 `room:start`
Initiates the match countdown sequence (Host only).

- **Payload**: None (`{}`)
- **Acknowledgement Callback**: `SocketAck<{ starting: boolean }>`
- **Validation**:
  - Caller must be `HOST` (otherwise `HOST_ONLY_ACTION`).
  - At least 2 players must be in the room (otherwise `NOT_ENOUGH_PLAYERS`).
  - All non-host members must have `readyStatus: true` (otherwise `PLAYERS_NOT_READY`).
- **Server Actions**:
  - Sets room status to `STARTING`.
  - Broadcasts `room:starting` with `{ countdownSeconds: 5 }`.

---

### 3.8 `room:resume`
Resumes presence in an existing room after a client tab reload or reconnect.

- **Payload (`JoinRoomInput`)**: `{ roomCode: string }`
- **Acknowledgement Callback**: `SocketAck<RoomPublicDto>`
- **Server Actions**:
  - Verifies calling guest is a member of the room.
  - Cancels any pending 30s disconnection timer.
  - Sets member `connectionStatus = 'CONNECTED'`.
  - Broadcasts updated `room:state`.

---

## 4. Server-to-Client Events

| Event Name | Payload Type | Description |
|---|---|---|
| `room:created` | `{ room: RoomPublicDto }` | Emitted to creator upon successful room instantiation. |
| `room:joined` | `{ room: RoomPublicDto }` | Emitted to joining player upon successful entry. |
| `room:state` | `{ room: RoomPublicDto }` | Broadcast to all room members whenever lobby state changes. |
| `room:player-joined` | `{ player: RoomMemberPublicDto, version: number }` | Broadcast when a new player joins the lobby. |
| `room:player-left` | `{ guestId: string, newHostGuestId?: string, version: number }` | Broadcast when a player departs. |
| `room:player-ready` | `{ guestId: string, isReady: boolean, version: number }` | Broadcast when a player changes ready state. |
| `room:host-changed` | `{ newHostGuestId: string, version: number }` | Broadcast when host transfer occurs. |
| `room:starting` | `{ countdownSeconds: number, version: number }` | Broadcast when host initiates the match. |
| `room:closed` | `{ reason: string }` | Broadcast if the room expires or is terminated. |
| `room:error` | `{ code: string, message: string }` | Unicast error alert (e.g. `SESSION_REPLACED`). |

---

## 5. Error Code Reference

| Error Code | HTTP / Socket Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid guest session token. |
| `SESSION_REPLACED` | - | Older socket disconnected because guest connected elsewhere. |
| `ROOM_NOT_FOUND` | 404 | Room code does not match any active database record. |
| `ROOM_FULL` | 400 | Room has reached `maxPlayers` capacity. |
| `ROOM_EXPIRED` | 410 | Room has passed its expiration timestamp or is `FINISHED`. |
| `ROOM_NOT_ACCEPTING` | 400 | Room has transitioned to `STARTING` or `IN_GAME`. |
| `NOT_IN_ROOM` | 403 | Attempted room action without being an active member. |
| `HOST_ONLY_ACTION` | 403 | Action permitted only to the room host. |
| `NOT_ENOUGH_PLAYERS` | 400 | Attempted to start with fewer than 2 players. |
| `PLAYERS_NOT_READY` | 400 | Attempted to start while non-host players are not ready. |
| `INTERNAL_ERROR` | 500 | Unexpected server error. |
