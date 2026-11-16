# Card Movement Animations & Real-Time Multiplayer Chat Report

**Project:** UNO Ultimate  
**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** November 16, 2026  
**Status:** Successfully Implemented, Verified, and Ready for Deployment

---

## 1. Executive Summary

This phase introduces two major player experience enhancements to UNO Ultimate:
1. **Dynamic Card Movement Animations:** Real-time visual feedback for cards flying from hands to the discard pile (when playing) and from the draw pile / attack launcher to player seats/hands (when drawing). Multi-card draws (penalty draws and UNO Attack launcher discharges) animate with a smooth, staggered visual rhythm.
2. **Real-Time Multiplayer Room Chat:** An integrated in-match messaging system allowing players in the same game room to communicate, cheer, and strategize in real time, with persistent history, server-side sanitization, sliding-window rate limiting, and unread notification indicators.

Both features have been implemented with strict adherence to the project's zero-cost hosting architecture (Vercel Free + Render Free Web Service + Neon Free PostgreSQL) and fully server-authoritative game state integrity.

---

## 2. Architecture & Design

### 2.1 Card Movement Animations

#### Framer Motion Architecture
- **Non-Blocking Gameplay:** Animations are completely client-driven and non-blocking. The server emits lightweight animation broadcast events (`GAME_CARD_ANIMATION`) containing card identities, player IDs, action types (`PLAY` | `DRAW`), sequence numbers, and card counts. The authoritative game state updates immediately without waiting for animations to complete.
- **Dynamic Coordinate Resolution:** Screen coordinates for the draw pile (`[data-testid="draw-pile-btn"]`, `[data-testid="attack-launcher"]`), discard pile (`[data-testid="discard-pile"]`), local player hand (`[data-testid="player-hand"]`), and remote opponent seats (`[data-testid="player-seat"]`) are computed dynamically via `getBoundingClientRect()`. Safe responsive fallbacks ensure smooth rendering across screen sizes and SSR/testing environments.
- **Flight Trajectory & Physics:**
  - **Playing a Card:** Card departs player's hand or opponent seat, scales up subtly to `1.05x`, acquires a random rotational flair between `-10°` and `+10°`, and lands on the discard pile over a duration of `350ms` using custom cubic-bezier easing `[0.25, 1, 0.5, 1]`.
  - **Drawing Cards:** Face-down UNO cards leave the draw pile/launcher and travel to the target player's seat. For multi-card draws (e.g. Draw Two, Wild Draw Four, Wild Draw Six, or UNO Attack launcher bursts of up to 16 cards), each card is staggered by `70ms` (`delay: i * 0.07`).
- **Deduplication:** A bounded set of processed animation IDs (`processedAnimationIds`) on `cardAnimationStore` prevents duplicate rendering if identical socket events are received during reconnection or network jitter.
- **Accessibility & Reduced Motion:** Built-in integration with `useReducedMotion()`. When a user has `prefers-reduced-motion` enabled in their operating system, transition durations collapse to `50ms` without delays or disorienting rotations.

### 2.2 Real-Time Multiplayer Room Chat

#### Protocol & Event Definitions (`@uno-ultimate/game-protocol`)
- `room:chat-send`: Client-to-server event with schema-validated `{ message: string }`.
- `room:chat-message`: Server-to-client broadcast of the newly created and persisted `ChatMessageDto`.
- `room:chat-get-history`: Client-to-server request for recent room messages.
- `room:chat-history`: Server response delivering up to 50 chronological messages.

#### Persistence & Neon PostgreSQL Migration
A dedicated `chat_messages` table was added via Prisma and migrated to PostgreSQL (`20261116010000_add_chat_messages`):
- `id`: UUID primary key.
- `roomId`: Foreign key to `rooms(id)` with `ON DELETE CASCADE`.
- `senderGuestId`: Foreign key to `guest_sessions(id)` with `ON DELETE CASCADE`.
- `message`: Sanitized text content (up to 300 characters).
- `createdAt`: Timestamp with index on `[roomId, createdAt]` for ultra-fast history fetching.
- `senderUsername`: Resolved via relation or snapshot.

#### Security, Rate Limiting & Abuse Prevention
- **Authentication & Room Membership:** The sender's guest session is verified strictly from the authenticated Socket.IO handshake (`socket.data.guestId`), completely disallowing client identity spoofing. Senders must be registered members of the room in the database.
- **HTML Sanitization:** All messages pass through server-side sanitization escaping HTML entities (`&`, `<`, `>`, `"`, `'`, `/`) to eliminate stored XSS risks.
- **Sliding-Window Rate Limiting:** Each guest is limited to at most 5 messages per 3-second sliding window (`RATE_LIMIT_EXCEEDED`).
- **Duplicate Prevention:** Rapid identical messages submitted within 1,000ms are blocked (`DUPLICATE_MESSAGE`).
- **Zero-Cost Free Tier Compliance:** Message history queries are capped at 50 messages per room with indexed lookups, keeping database resource usage near zero on Neon Free PostgreSQL.

#### UI & UX
- **Responsive Floating Chat Panel (`ChatPanel.tsx`):**
  - Seamless toggleable floating modal at the bottom-right of the lobby and game screen.
  - Distinction between self messages (right-aligned in vibrant UNO blue gradient) and opponents' messages (left-aligned in dark slate with sender usernames).
  - Timestamps, auto-scroll to latest messages, character counter (`0/300`), and error banners.
  - Keyboard shortcuts: `Enter` sends the message; `Shift + Enter` inserts a newline.
- **Unread Notification Badge (`ChatToggleButton.tsx`):**
  - Displays a pulsing badge with the unread count when incoming messages arrive while the chat panel is closed.
  - Automatically resets when the chat window is opened.

---

## 3. Automated Test Verification

### 3.1 Server Socket Integration Tests (`apps/server/tests/integration/room.chat.socket.test.ts`)
Eight comprehensive integration tests verify the end-to-end Socket.IO chat system against a live PostgreSQL instance:

| # | Test Scenario | Result |
|---|---|---|
| 1 | Sends and receives chat messages in the same room | **PASSED** |
| 2 | Guarantees room isolation: message from Room A never leaks to Room B | **PASSED** |
| 3 | Rejects users who are not room members (`NOT_IN_ROOM` / `ROOM_NOT_FOUND`) | **PASSED** |
| 4 | Rejects empty, whitespace-only, and oversized (>300 chars) messages | **PASSED** |
| 5 | Enforces chat sliding-window rate limiting (max 5 in 3s) | **PASSED** |
| 6 | Prevents rapid duplicate message submissions (<1000ms cooldown) | **PASSED** |
| 7 | Fetches persistent chat history across client reconnections | **PASSED** |
| 8 | Supports multiple simultaneous players chatting concurrently | **PASSED** |

### 3.2 Web Card Animation Tests (`apps/web/src/features/game/components/__tests__/CardAnimation.test.tsx`)
Eight tests verify the animation store and overlay layer:

| # | Test Scenario | Result |
|---|---|---|
| 1 | Starts with empty flying cards in store | **PASSED** |
| 2 | Triggers a PLAY animation for the active player with correct coordinates | **PASSED** |
| 3 | Triggers a staggered multi-card DRAW animation for penalty draws | **PASSED** |
| 4 | Deduplicates identical animation events received multiple times | **PASSED** |
| 5 | Removes flying cards cleanly when animation completes | **PASSED** |
| 6 | Renders overlay container without crashing when idle | **PASSED** |
| 7 | Renders active flying card elements during play flight | **PASSED** |
| 8 | Renders face-down UNO cards during draw animations | **PASSED** |

### 3.3 Web Chat Component Tests (`apps/web/src/features/chat/__tests__/ChatPanel.test.tsx`)
Thirteen tests verify the store, panel, and toggle components:

| # | Test Scenario | Result |
|---|---|---|
| 1 | Initializes with closed state and zero unread messages | **PASSED** |
| 2 | Increments unreadCount when message arrives while chat is closed | **PASSED** |
| 3 | Resets unreadCount to 0 when chat is opened | **PASSED** |
| 4 | Does not increment unreadCount when chat is already open | **PASSED** |
| 5 | Does not render panel when `isOpen: false` | **PASSED** |
| 6 | Renders empty message placeholder state when opened with no messages | **PASSED** |
| 7 | Renders chat messages distinguishing between self and opponents | **PASSED** |
| 8 | Handles message typing, input state, and character counter (`19/300`) | **PASSED** |
| 9 | Closes panel when close button is clicked | **PASSED** |
| 10 | Displays error banner and clears error on dismiss | **PASSED** |
| 11 | Renders toggle button in closed state | **PASSED** |
| 12 | Displays unread badge when unread messages exist | **PASSED** |
| 13 | Toggles chat open/close on click | **PASSED** |

---

## 4. Full Monorepo Quality Gates

Every quality gate has passed across the entire workspace:

1. **Unit & Integration Tests:**
   - `@uno-ultimate/game-engine`: 29 test files, **386 passed** (0 failed).
   - `@uno-ultimate/server`: 22 test files, **153 passed** (0 failed).
   - `@uno-ultimate/web`: 25 test files, **124 passed** (0 failed).
   - **Total:** **663 tests passing** across the monorepo.
2. **Typecheck (`pnpm -r typecheck`):**
   - All 6 packages compiled with `tsc --noEmit` with **0 errors**.
3. **Lint (`pnpm -r lint`):**
   - ESLint completed across all packages with **0 errors and 0 warnings**.
4. **Production Build (`pnpm -r build`):**
   - `@uno-ultimate/database`: Prisma Client generated and tsup built (CJS + ESM + DTS).
   - `@uno-ultimate/shared`: tsup built (CJS + ESM + DTS).
   - `@uno-ultimate/game-protocol`: tsup built (CJS + ESM + DTS).
   - `@uno-ultimate/game-engine`: tsup built (CJS + ESM + DTS).
   - `@uno-ultimate/server`: tsup built production server bundle (172.37 KB).
   - `@uno-ultimate/web`: Vite production build succeeded (index-CeKEpxEY.js).

---

## 5. Summary of Files Changed & Created

| Path | Description |
|---|---|
| `database/prisma/schema.prisma` | Added `ChatMessage` model with relations and indexes |
| `database/prisma/migrations/20261116010000_add_chat_messages/migration.sql` | Production SQL migration for `chat_messages` table |
| `packages/game-protocol/src/events.ts` | Added chat and card animation schemas, types, and socket event signatures |
| `apps/server/src/modules/chat/chat.service.ts` | Server chat business logic, rate limiting, duplicate prevention, HTML sanitization, and DB queries |
| `apps/server/src/modules/chat/chat.socket.handler.ts` | Socket.IO event listeners for `room:chat-send` and `room:chat-get-history` |
| `apps/server/src/sockets/socketServer.ts` | Integrated chat socket handlers into server initialization |
| `apps/server/src/modules/game/game.socket.handler.ts` | Broadcasts `game:card-animation` on card play, draw, and penalty acceptance actions |
| `apps/server/tests/integration/room.chat.socket.test.ts` | 8 integration tests for real-time room chat |
| `apps/web/src/stores/chatStore.ts` | Zustand store managing room chat state, socket communication, history, and unread counts |
| `apps/web/src/stores/cardAnimationStore.ts` | Dynamic flying card manager computing coordinates, multi-draw delays, and deduplication |
| `apps/web/src/features/chat/ChatPanel.tsx` | Responsive floating chat panel with message bubbles, auto-scroll, and character counter |
| `apps/web/src/features/chat/ChatToggleButton.tsx` | Chat toggle button with pulsing unread notification badge |
| `apps/web/src/features/chat/__tests__/ChatPanel.test.tsx` | 13 component and unit tests for chat UI and store |
| `apps/web/src/features/game/components/CardAnimationOverlay.tsx` | Framer Motion animated overlay for flying cards with reduced-motion accessibility |
| `apps/web/src/features/game/components/__tests__/CardAnimation.test.tsx` | 8 component and unit tests for card animations |
| `apps/web/src/stores/gameStore.ts` | Connected `game:card-animation` socket listener to `cardAnimationStore` |
| `apps/web/src/pages/GamePage.tsx` | Integrated `CardAnimationOverlay`, `ChatPanel`, and `ChatToggleButton` on the game table |
| `apps/web/src/pages/LobbyPage.tsx` | Integrated `ChatPanel` and `ChatToggleButton` in the room lobby |
