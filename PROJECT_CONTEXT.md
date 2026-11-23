# UNO Ultimate — Complete Project Context & Architectural Specification

> **Reconstructed Project Context Document**  
> **Workspace:** `D:\uno`  
> **Repository:** [https://github.com/afrid995/uno](https://github.com/afrid995/uno)  
> **Current Default Branch:** `main`  
> **Current Git Head Commit:** `96f0308` (`feat(multiplayer): robust network recovery, 120s grace period and seamless reconnection`)  
> **Target Audience:** Lead Software Architects, Technical Writers, and Prompt Engineers continuing design and implementation.

---

## 1. Project Overview

- **Name:** UNO Ultimate (`uno-ultimate-monorepo`)
- **Purpose:** A private, multiplayer online implementation of UNO and its official physical variants designed exclusively for groups of friends.
  - **No Public Matchmaking:** No public lobbies, random queues, or stranger discovery. All games take place in private rooms via room codes or direct invitation links.
  - **Zero Sign-Up Identity:** Pure guest identity model where users provide only a display username. Authenticated via server-generated UUID guest sessions, HMAC/hash tokens stored in HttpOnly cookies, and local session storage.
  - **Strict Server Authoritative State:** Pure, transport-agnostic TypeScript game engine (`@uno-ultimate/game-engine`) running solely on the server. Opponent hands and draw pile ordering are cryptographically hidden through projection masks to eliminate client-side tampering.
  - **Comprehensive Official Variant Support:** Implements 7 distinct official Mattel editions with complete fidelity to physical boxed rule sheets: Classic UNO (42001), UNO Flip (GDR44), UNO Show 'em No Mercy (HWV18), UNO All Wild (HHL33), UNO Flex (HMY71/HNB00), UNO Teams (W2072), and UNO Attack (GTX66).
- **Current Status:** Production-ready multiplayer card game deployed on cloud free-tier infrastructure (Render for backend, Vercel for frontend, Neon for PostgreSQL). All 7 variants are fully playable. Core multiplayer resilience, casino-inspired premium UI/UX, mobile responsive layouts, chat, and network recovery are implemented and verified.
- **Current Phase:** Concluded **Robust Multiplayer Network Recovery & Seamless Reconnection** (Phase commit `96f0308`). Currently at the transition checkpoint before the next architectural or feature phase.

---

## 2. Tech Stack

### Languages & Runtime
- **TypeScript:** `^5.7.3` across all workspaces (`packages/*`, `apps/*`, `database/`).
- **Node.js:** `>=20.x` (Target ES2022, tested with Node v22.13.1).

### Monorepo Architecture & Build Tools
- **Package Manager:** `pnpm@12.18.0` via `pnpm-workspace.yaml`.
- **Bundler / Transpiler:** `tsup` (`^8.3.6`) for Node packages and server builds; `tsx` (`^4.19.2`) for server development watch mode; `vite` (`^6.1.0`) for client web builds.
- **Linters & Formatters:** `eslint` (`^8.57.0`), `@typescript-eslint/parser` (`^7.18.0`), `prettier` (`^3.2.5`), `concurrently` (`^9.1.2`).

### Monorepo Workspaces

| Workspace Name | Path | Description & Core Dependencies |
|---|---|---|
| `@uno-ultimate/shared` | `packages/shared` | Shared constants, DTO types, Zod schemas (`zod: ^3.24.2`), room/guest definitions. |
| `@uno-ultimate/game-engine` | `packages/game-engine` | Pure TypeScript, zero-I/O server-authoritative UNO game engine with deterministic PRNG, rule validators, variant registry, and state projection filters. |
| `@uno-ultimate/game-protocol` | `packages/game-protocol` | Typed Socket.IO event names (`SOCKET_EVENTS`), client/server payload DTOs, hand sorting utilities, and Zod request contracts. |
| `@uno-ultimate/database` | `database` | PostgreSQL ORM layer using Prisma (`@prisma/client: ^5.22.0`, `prisma: ^5.22.0`). |
| `@uno-ultimate/server` | `apps/server` | Node.js backend using Express (`^4.21.2`), Socket.IO (`^4.8.1`), Helmet (`^8.0.0`), CORS (`^2.8.5`), Cookie-Parser (`^1.4.7`), Express-Rate-Limit (`^7.5.0`), UUID (`^11.1.0`). |
| `@uno-ultimate/web` | `apps/web` | Single-page application using React (`^18.3.1`), Vite (`^6.1.0`), Tailwind CSS (`^3.4.17`), React Router v7 (`react-router-dom: ^7.1.5`), Zustand (`^5.0.3`), Socket.IO Client (`^4.8.1`), Framer Motion (`^12.4.7`), Lucide React (`^0.475.0`), Clsx (`^2.1.1`), Tailwind-Merge (`^3.0.1`), Howler.js (`^2.2.4`, installed but unused). |

### Database & Cloud Hosting
- **Database:** PostgreSQL 16 (Local WSL2/Docker; Neon Serverless PostgreSQL in production).
- **Backend Host:** Render Web Service (`render.yaml` free tier specification).
- **Frontend Host:** Vercel Static Hosting (`vercel.json`).

### Testing Stack
- **Unit & Integration:** Vitest (`^3.0.5`), JSDOM (`^26.0.0`), `@testing-library/react` (`^16.2.0`), Supertest (`^7.0.0`), `socket.io-client` (`^4.8.4`).
- **End-to-End (E2E):** Playwright (`^1.65.0`) multi-browser context testing.

---

## 3. How to Run

### Prerequisites
- Node.js >= 20.x
- pnpm >= 9.x (installed: 12.18.0)
- Local PostgreSQL 16 or Docker / WSL2 instance
- Chrome installed (for Playwright E2E browser testing)

### Environment Variables Configuration

Copy `.env.example` to `.env` at the repository root:

```env
# Runtime
NODE_ENV=development
PORT=4000
CORS_ORIGIN=http://localhost:5173

# Database (PostgreSQL direct connection string)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uno_ultimate?schema=public

# Security & Sessions
SESSION_SECRET=dev_session_secret_replace_with_secure_random_hex_in_production
COOKIE_SECRET=dev_cookie_secret_replace_with_secure_random_hex_in_production
COOKIE_NAME=uno_session
SESSION_EXPIRATION_HOURS=24
RECONNECT_GRACE_PERIOD_MS=120000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_GUEST=60

# Frontend Client Settings
VITE_API_URL=http://localhost:4000
VITE_WS_URL=http://localhost:4000

# Testing
ENABLE_TEST_HELPERS=false
```

### Installation, Database & Build Commands

```bash
# 1. Install all monorepo dependencies
pnpm install

# 2. Start PostgreSQL (if using local WSL helper script or Docker)
# WSL: wsl -u root /mnt/host/d/uno/infrastructure/start-postgres.sh
# Docker: docker compose up -d postgres

# 3. Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate

# 4. Build all packages and applications
pnpm build
```

### Development & Execution Commands

```bash
# Run server and web concurrently in development watch mode
pnpm dev
# Web URL: http://localhost:5173
# API/Socket URL: http://localhost:4000

# Run server only (production compiled artifact)
pnpm start:server

# Run web preview
pnpm --filter @uno-ultimate/web preview
```

### Testing & Verification Commands

```bash
# Run all unit and integration tests across monorepo
pnpm test

# Run game-engine pure unit tests (425 tests across 31 test files)
pnpm --filter @uno-ultimate/game-engine test

# Run frontend React component and store tests (189 tests across 31 test files)
pnpm --filter @uno-ultimate/web test

# Run backend integration tests (requires PostgreSQL running)
pnpm --filter @uno-ultimate/server test

# Run browser E2E tests (Playwright multi-context)
pnpm --filter @uno-ultimate/web test:e2e

# Run TypeScript typechecks across all packages
pnpm typecheck

# Run ESLint across all workspaces
pnpm lint
```

---

## 4. Folder and File Structure

```
d:\uno\
├── apps/
│   ├── server/                         # Node.js Express & Socket.IO backend service
│   │   ├── src/
│   │   │   ├── config/env.ts           # Zod-validated environment config schema
│   │   │   ├── middleware/             # Express middlewares (errorHandler, rateLimiter, validate)
│   │   │   ├── modules/
│   │   │   │   ├── chat/               # Real-time room chat service and socket event handler
│   │   │   │   ├── game/               # GameService, GameSessionManager (mutex), GamePersistenceService, StatePublisher
│   │   │   │   ├── guest/              # Guest identity controller, service, token verification
│   │   │   │   └── room/               # Room lifecycle, membership, deterministic host transfer, disconnect recovery
│   │   │   ├── routes/                 # Express REST endpoints (health, guest, room, test)
│   │   │   ├── sockets/                # Socket.IO connection manager, authentication handshake, event dispatchers
│   │   │   ├── utils/                  # Structured logger, crypto helpers, CORS utilities
│   │   │   ├── app.ts                  # Express app factory for integration tests
│   │   │   └── server.ts               # HTTP & WebSocket server entry point and graceful shutdown
│   │   └── tests/                      # 26 server unit and socket integration test suites
│   └── web/                            # React 18 + Vite SPA frontend application
│       ├── src/
│       │   ├── app/App.tsx             # Root React Router v7 routes (/join/:roomCode, /room/:roomCode, /game/:roomCode)
│       │   ├── components/common/      # Global UI components (Header, Footer, UnoCardVisual)
│       │   ├── features/
│       │   │   ├── chat/               # Collapsible ChatPanel and ChatToggleButton
│       │   │   ├── game/
│       │   │   │   ├── components/     # GameBoard, RoundTable, PlayerSeat, PlayerHand, PlayingCard, UnoButton, etc.
│       │   │   │   ├── hooks/          # useOrientation hook for portrait vs landscape mobile detection
│       │   │   │   └── utils/          # cardSorting presentation utilities
│       │   │   ├── guest/              # GuestLoginForm, DashboardView
│       │   │   └── room/               # CreateRoomModal, JoinRoomModal, PlayerCard, InviteLinkCard
│       │   ├── pages/                  # LandingPage, DashboardPage, LobbyPage, JoinInvitePage, GamePage
│       │   ├── services/               # Axios API client and Socket.IO client singleton
│       │   ├── stores/                 # Zustand state stores (guestStore, roomStore, gameStore, chatStore, cardAnimationStore)
│       │   └── styles/globals.css      # Casino-inspired Tailwind CSS design tokens and base styles
│       └── tests/                      # Component tests and Playwright E2E suites
├── database/                           # Database access workspace
│   ├── prisma/
│   │   ├── migrations/                 # PostgreSQL migration SQL scripts
│   │   └── schema.prisma               # Prisma data schema (guest_sessions, rooms, room_members, matches, etc.)
│   └── src/                            # Prisma client singleton and database exports
├── docs/                               # Architecture and rules documentation
│   ├── architecture/                   # Architecture RFCs for Phases 1 through 4.1
│   └── rules/                          # Canonical specifications for Classic UNO and UNO Flip
├── infrastructure/                     # Local environment bootstrap scripts
│   ├── setup-pg.sh                     # PostgreSQL directory initialization script
│   └── start-postgres.sh               # WSL PostgreSQL background launch daemon script
├── packages/
│   ├── game-engine/                    # Pure, server-authoritative TypeScript game engine
│   │   ├── src/
│   │   │   ├── actions/                # ActionProcessor state transition logic and action types
│   │   │   ├── cards/                  # Card factories, sorting algorithms, type definitions
│   │   │   ├── deck/                   # 108/112/168 card factories, Fisher-Yates crypto shuffle, deck manager
│   │   │   ├── game/                   # GameFactory, GameState, GameConfig, JSON state serializers
│   │   │   ├── players/                # HandManager, player models, score calculators
│   │   │   ├── projections/            # PlayerStateProjection and PublicGameState secure redaction filters
│   │   │   ├── testing/                # Deterministic PRNG seed utilities
│   │   │   ├── turns/                  # TurnDirection and TurnManager turn sequencing
│   │   │   ├── validation/             # MoveValidator move legality rules
│   │   │   └── variants/               # Modular adapters for all 7 UNO variants
│   │   └── tests/                      # 31 pure engine test suites (425 tests)
│   ├── game-protocol/                  # Shared WebSocket contracts, payload models, and DTO schemas
│   └── shared/                         # Cross-package constants, validation schemas, and common types
├── reports/                            # 57 comprehensive phase completion, audit, and verification reports
├── docker-compose.yml                  # Docker configuration for local PostgreSQL 16 container
├── render.yaml                         # Production Render blueprint deployment configuration
├── render.free.yaml                    # Free-tier Render blueprint configuration
└── vercel.json                         # Vercel SPA rewrite and header routing configuration
```

---

## 5. Game Rules Implemented

UNO Ultimate implements seven official Mattel boxed variants without ad-hoc house rules, with one specific user-requested deviation in No Mercy.

### Summary of Supported Variants

| Variant ID | Product Name | Authority Reference | Deck Size | Initial Hand | Target Score |
|---|---|---|---|---|---|
| `classic` | Classic UNO | Mattel 42001 | 108 | 7 | 500 pts |
| `flip` | UNO Flip! | Mattel GDR44 | 112 (Dual-sided) | 7 | 500 pts |
| `no-mercy` | UNO Show 'em No Mercy | Mattel HWV18 | 168 | 7 | 1000 pts |
| `all-wild` | UNO All Wild! | Mattel HHL33 | 112 | 7 | 500 pts |
| `flex` | UNO Flex! | Mattel HMY71 / HNB00 | 112 | 7 | 500 pts |
| `teams` | UNO Teams | Mattel W2072 | 112 | 7 | 500 pts |
| `attack` | UNO Attack! | Mattel GTX66 | 110 or 112 | 7 | 500 pts |

---

### Detailed Mechanics by Variant

#### 1. Classic UNO (Mattel 42001)
- **Deck (108 cards):** 76 Number cards (0–9 in Red, Yellow, Green, Blue; one 0 and two 1–9 per color), 24 Action cards (Skip, Reverse, Draw Two; two each per color), 8 Wild cards (4 Wild, 4 Wild Draw Four).
- **Actions:** Skip terminates next player's turn; Reverse flips direction (in 2-player matches, Reverse acts as a Skip); Draw Two inflicts 2 cards and skips turn.
- **Wild Draw Four:** Playable legally ONLY if player holds NO cards matching the active color. Opponent may challenge. If challenge succeeds (offender bluffed), offender draws 4; if challenge fails, challenger draws 6 (4 + 2 penalty). Opponent hand inspection is disabled for privacy; server validates legality authoritatively.
- **Draw Rule:** Player draws 1 card on unplayable or voluntary draw. Player may play drawn card immediately if legal, or pass. No automatic force-play.
- **Missed UNO Penalty:** 4 cards if caught before the next player begins their turn.

#### 2. UNO Flip! (Mattel GDR44)
- **Deck (112 dual-sided cards):** Light Side (Red, Yellow, Green, Blue) and Dark Side (Pink, Teal, Orange, Purple). Each card has physical Light and Dark faces.
- **Light Side:** Number 1–9, Draw One (+1), Reverse, Skip, Flip, Wild, Wild Draw Two (+2, challengeable).
- **Dark Side:** Number 1–9, Draw Five (+5), Reverse, Skip Everyone (returns play to card player), Flip, Wild, Wild Draw Color (draws until player draws chosen color, challengeable).
- **Flip Transition:** Playing a Flip card immediately flips active side, inverts discard pile (played Flip goes to bottom; underneath card becomes top discard on new face), flips draw pile, and flips all players' hands in real time.
- **Opening Wild:** Player to left of dealer selects starting color before first card is played.
- **Missed UNO Penalty:** 2 cards.

#### 3. UNO Show 'em No Mercy (Mattel HWV18)
- **Deck (168 cards):** Standard 0–9 cards, colored Draw 2, Draw 4, Discard All, Skip, Reverse, Skip Everyone, and Wild cards (Wild, Wild Reverse Draw 4, Wild Draw 6, Wild Draw 10).
- **Elimination (Mercy Rule):** A player holding **strictly greater than 25 cards** (`hand.length > 25`) is immediately eliminated from the round. Their cards are set aside to preserve card conservation. Eliminating another player awards a 250-point bonus to the round winner.
- **Stacking Mechanics:** When targeted with a draw penalty (+2, +4, Wild Reverse Draw 4, +6, +10), a player can stack another draw card of equal or higher penalty value.
  - Stacking accumulates the total penalty.
  - Playing **Wild Reverse Draw 4** reverses direction:
    - In **2-player matches**, the playing player receives the accumulated penalty.
    - In **3+ player matches**, direction reverses and the previous player receives the penalty; the player who played the Wild Reverse Draw 4 does NOT receive the penalty.
- **Draw Rule:** Draw-until-playable up to a maximum limit of 5 cards. If no card is playable after 5 draws, turn passes.
- **Color Roulette Deviation:** By explicit user design instruction, Wild Color Roulette was permanently removed and replaced with the Standard Classic Wild card.
- **Missed UNO Penalty:** 2 cards.

#### 4. UNO All Wild! (Mattel HHL33)
- **Deck (112 cards):** Entire deck consists of Wild cards (no color or number matching).
- **Card Types:** Wild (54), Wild Reverse (14), Wild Skip (14), Wild Draw Two (10), Wild Skip Two (6), Wild Draw Four (6), Wild Targeted Draw Two (4), Wild Forced Swap (4).
- **Special Actions:**
  - Wild Skip Two skips next 2 players.
  - Wild Targeted Draw Two allows player to target any chosen player.
  - Wild Forced Swap forces player to trade hands with any chosen opponent. If played as the player's final card, the swap occurs first, transferring the 1-card hand to the opponent and leaving the player with the opponent's former hand (player does not win immediately).
- **Missed UNO Penalty:** 2 cards.

#### 5. UNO Flex! (Mattel HMY71 / HNB00)
- **Deck (112 cards):** 104 playing cards + 8 Power Cards (one per player). Each playing card has a Primary Color and a secondary Flex Color/Action.
- **Power Card:** Starts on the Green (active) side. Allows playing a card on its Flex color or using its Flex action (e.g. Flex Draw Two targets any player, Flex All Draw forces all opponents to draw 1). Using a Flex move flips the Power Card to Red (inactive).
- **Flip Icons:** Number cards with flip icons (Red/Green evens, Yellow/Blue odds) flip Power Cards back to Green when played.
- **Missed UNO Penalty:** 2 cards.

#### 6. UNO Teams (Mattel W2072)
- **Deck (112 cards):** 4 to 8 players organized into 2-player teams (partners sit opposite each other).
- **Team Passing Actions:**
  - Initial Pass: Each player selects 1 card to pass to their partner at the start of the round.
  - Team Pass Card: Allows passing a card to a partner during play.
  - Wild Team Play: Player plays a card, and their partner plays an eligible card immediately out of turn.
  - Hand Splitting: When a player goes out, their remaining partner must split their hand in half to keep both players active until team victory.
- **Missed UNO Penalty:** 2 cards.

#### 7. UNO Attack! (Mattel GTX66)
- **Deck (110 or 112 cards):** Base 109 cards + 1 or 3 Wild Customizable cards (official GTX66 rule permits strictly 1 or 3 customizable cards). Includes Hit 2, Discard All, Wild Attack-Attack, Wild Hit 4.
- **Virtual Launcher:** Server simulates mechanical tension and variable launch probabilities (levels 0 to 4). If cards fly out, the pressing player must collect all launched cards. Pressing launcher on Hit 2 (2 presses), Wild Hit 4 (4 presses), or voluntary draw (1 press).
- **Missed UNO Penalty:** 2 launcher presses.

---

## 6. Architecture and Core Logic

### Architectural Pattern: Server-Authoritative State Engine
```
┌────────────────────────────────────────────────────────┐
│                   Client Browser                       │
│  - React UI / Zustand Stores (guest, room, game, chat)  │
│  - Socket.IO client (auto-reconnect, exponential backoff)│
└───────────────────────────▲────────────────────────────┘
                            │ WebSocket Events
┌───────────────────────────▼────────────────────────────┐
│                  Server-Side Core                      │
│  - SocketServer / Auth Handshake (HMAC session token)  │
│  - GameSessionManager (Room-level Concurrency Mutex)   │
│  - Pure MoveValidator -> ActionProcessor               │
│  - State Projection Filters (Anti-Cheat Redaction)    │
│  - GamePersistenceService (PostgreSQL Events & State)  │
└────────────────────────────────────────────────────────┘
```

### Core Engine Classes (`packages/game-engine/src`)
- **`GameFactory` (`game/game.factory.ts`):** Creates initial authoritative game state, performs dealer determination via high-card draw, and handles round-to-round resets.
- **`MoveValidator` (`validation/move.validator.ts`):** Pure static validator returning `{ valid: boolean, error?: string }` for all actions across variants.
- **`ActionProcessor` (`actions/action.processor.ts`):** Pure transition processor executing card plays, draws, challenges, passes, and variant-specific actions, producing the next immutable `GameState`.
- **`DeckFactory` (`deck/deck.factory.ts`) & `DeckManager` (`deck/deck.manager.ts`):** Assembles variant-specific inventories, manages draw pile exhaustion, and recycles discard pile cards (excluding top discard).
- **`CryptoShuffle` (`deck/deck.shuffle.ts`):** Fisher-Yates shuffle powered by Node.js `crypto.randomInt` or deterministic PRNG for test reproducibility.
- **`HandManager` (`players/hand.manager.ts`):** Manages immutable card addition, removal, and point scoring calculations.
- **`TurnManager` (`turns/turn.manager.ts`):** Tracks player seating order, clockwise/counter-clockwise direction, 2-player skip overrides, and active turn index.
- **`VariantRegistry` (`variants/variant.types.ts`):** Registry mapping variant identifiers (`classic`, `flip`, `no-mercy`, `all-wild`, `flex`, `teams`, `attack`) to implementations of `GameVariantAdapter`.

### Security Projections & Anti-Cheat
- **`PlayerStateProjection` (`projections/player-state.ts`):** Strictly redacts the game state sent to each individual client:
  1. Only the recipient's private hand cards are visible.
  2. All opponent hands are reduced to integer card counts.
  3. Draw pile ordering is completely concealed; only draw pile count is exposed.
  4. Discard pile exposes only top card face.
  5. Hand inspection (`inspectionHand`) is strictly suppressed across all variants.

### Server Session & Persistence (`apps/server/src/modules/game`)
- **`GameSessionManager`:** In-memory registry of active matches protected by per-room async mutexes. Ensures rapid consecutive clicks from multiple clients are serialized without race conditions.
- **`GamePersistenceService`:** Persists matches, match players, granular `game_events` (event sourcing), and latest `game_snapshots` in PostgreSQL.
- **`Durable State Recovery` (`room.service.ts` / `socketServer.ts`):** If the server restarts or a Render container wakes from sleep, `reconcileDurableDisconnects` checks elapsed wall-clock time against PostgreSQL `lastSeenAt` timestamps and restores active games from JSON snapshots.

### Player Types
- **Human Players:** Fully supported multiplayer via Socket.IO guest sessions.
- **Bot Players:** **Unknown / needs confirmation** — No bot or AI logic currently exists in the codebase. All participants must be real human players connected to the room.

---

## 7. UI / UX

### Visual Identity: Casino-Inspired Premium Board-Game
- **Color Palette:**
  - Table Felt: Deep Emerald Green (`#0a2618` to `#0d3320`).
  - Table Edge / Rail: Rich Walnut Wood and Brushed Gold Metallic Accents (`#d4af37`).
  - Cards: Matte charcoal slate backgrounds with distinct high-contrast variant faces.
- **Restrained Aesthetics:** Complete elimination of generic AI gradients, neon glows, floating confetti, and unnecessary visual ornamentation.

### Responsive Gameplay Layouts
- **Desktop & Landscape Mode (`RoundTable.tsx`):**
  - True circular/oval digital table layout.
  - Opponents dynamically positioned radially around the perimeter based on player count.
  - Centered Draw and Discard piles with circular directional turn ring orbit.
  - Bottom-docked local player profile, action bar, and fan hand.
- **Mobile Portrait Mode (`RoundTable.tsx` / `ResponsiveLayout`):**
  - Compact vertical column layout.
  - Top scrollable horizontal ribbon showing opponent seats with turn indicators and card counts.
  - Compact central game table with draw/discard stacks and directional arrows.
  - Docked bottom action bar with quick Draw / Pass / UNO buttons and hand display.
  - Seamless orientation switching detected via `useOrientation.ts` hook.

### Key UI Components (`apps/web/src/features/game/components`)
- **`PlayerHand.tsx`:** Renders local player's cards with client-side sorting (Red &rarr; Blue &rarr; Green &rarr; Yellow &rarr; Dark colors &rarr; Wilds). Includes selection hover states and invalid card play prevention.
- **`PlayingCard.tsx`:** Renders cards across all variants including dual-sided Flip cards, Flex dual-action banners, No Mercy badges, and All Wild graphics.
- **`UnoButton.tsx`:** Server-authoritative UNO declaration toggle. Active when down to 2 cards to declare on play, or when catching an opponent within the catch window.
- **`ChallengePanel.tsx`:** Prompts victims of Wild Draw Four, Wild Draw Two, or Wild Draw Color to Accept or Challenge.
- **`AttackLauncher.tsx`:** Interactive virtual launcher visualizer showing tension stages and animated dispensing.
- **`NetworkRecoveryOverlay.tsx`:** Minimal, non-destructive status banner for reconnecting states without navigating away or freezing the game table.
- **`ChatPanel.tsx`:** Slide-out multiplayer chat with unread notification badge, room isolation, and message history.

### Audio / Sound Effects
- **Status:** **Unknown / needs confirmation** — `howler` is present in `package.json` (`^2.2.4`), but no audio files exist in `apps/web/public` (only `card-icon.svg`), and no Howler audio playback logic is wired into frontend components.

---

## 8. Phase-by-Phase History

### Phase 1: Project Foundation
- **Goal:** Monorepo architecture, TypeScript configs, guest identity model, database schema.
- **What Was Built:** Root pnpm workspace, `packages/shared`, `database/prisma`, `apps/server`, `apps/web`. Basic guest login REST endpoints and UUID session tokens.
- **Decisions & Rationale:** Chose guest identity without passwords to provide frictionless instant play for friends.
- **Problems & Resolution:** TypeScript cross-project build dependencies resolved using `tsup` and composite project references.
- **Verification & Code Match:** Matches code. Reports: `PHASE_1_PROJECT_FOUNDATION_REPORT.md` (Commit `ae9706c`).

### Phase 2: Private Rooms & Real-Time Presence
- **Goal:** Room creation, invite codes, Socket.IO presence, deterministic host transfer.
- **What Was Built:** `RoomService`, `roomSocketHandler.ts`, `LobbyPage.tsx`, `CreateRoomModal.tsx`, `InviteLinkCard.tsx`.
- **Decisions & Rationale:** 6-character alphanumeric room codes; deterministic host failover to earliest joined member (`joinedAt ASC`).
- **Problems & Resolution:** Socket reconnection race conditions resolved via connection tokens and database session validation.
- **Verification & Code Match:** Matches code. Reports: `PHASE_2_PRIVATE_ROOMS_REPORT.md` (Commit `df5e3f3`).

### Phase 3: Server-Authoritative Game Engine
- **Goal:** Transport-agnostic, zero-I/O game engine for Classic UNO.
- **What Was Built:** `packages/game-engine`: `GameFactory`, `MoveValidator`, `ActionProcessor`, `DeckFactory`, `HandManager`, `TurnManager`.
- **Decisions & Rationale:** Pure state transitions returning new immutable state; event-sourcing with monotonically increasing sequence numbers.
- **Problems & Resolution:** Strict enforcement of Mattel 42001 WDF bluffing rules and 2-player reverse/skip rules.
- **Verification & Code Match:** Matches code. Reports: `PHASE_3_GAME_ENGINE_REPORT.md` (Commit `049a961`).

### Phase 4 through 4.3: Playable Classic UNO Multiplayer & Integrity Hardening
- **Goal:** Complete multiplayer loop for Classic UNO, browser E2E tests, recovery hardening.
- **What Was Built:** `GameSessionManager`, `GameService`, `GameBoard.tsx`, `UnoButton.tsx`, Playwright E2E suites.
- **Decisions & Rationale:** Implemented anti-cheat state projection masks. Added mutex queue per room to serialize rapid actions.
- **Problems & Resolution:** Race conditions during rapid card plays resolved by serializing game actions through `GameSessionManager` mutex.
- **Verification & Code Match:** Matches code. Reports: `PHASE_4_PLAYABLE_CLASSIC_UNO_REPORT.md`, `PHASE_4_1_INTEGRITY_HARDENING_REPORT.md`, `PHASE_4_2_FINAL_RULES_AND_E2E_VALIDATION_REPORT.md`, `PHASE_4_3_SOURCE_ALIGNMENT_AND_EVIDENCE_AUDIT_REPORT.md` (Commits `ee87ee6` through `44c8a83`).

### Phase 5 through 5.3.1: UNO Flip! Variant Architecture & Security Hardening
- **Goal:** Extensible variant architecture and complete implementation of UNO Flip (Mattel GDR44).
- **What Was Built:** `GameVariantAdapter`, `VariantRegistry`, `flip.adapter.ts`, `flip.deck.ts`, `flip.actions.ts`, dual-sided card UI.
- **Decisions & Rationale:** Authoritative 112-card dual-sided inventory (8 flip cards per side). Atomic flip transition flipping hands, draw pile, and discard pile.
- **Problems & Resolution:** GDR44 opening card edge cases (flip on deal, starting wild color selection by player to left of dealer).
- **Verification & Code Match:** Matches code. Reports: `PHASE_5_UNO_FLIP_IMPLEMENTATION_REPORT.md` through `PHASE_5_3_1_TEST_FIXTURE_MUTEX_HARDENING_REPORT.md` (Commits `00673c0` through `5dca36a`).

### Phase 6 through 6.1.6: UNO Show 'em No Mercy Implementation
- **Goal:** 168-card No Mercy variant, stacking mechanics, 25-card mercy rule, card recycling.
- **What Was Built:** `no-mercy.adapter.ts`, `no-mercy.deck.ts`, `no-mercy.actions.ts`, stacking validation and UI modals.
- **Decisions & Rationale:** Set-aside card pool to conserve cards when players are eliminated. 1000-point target score.
- **Problems & Resolution:** Card exhaustion under extreme draw penalties; resolved via resilient recycling preserving top discard card.
- **Verification & Code Match:** Note: Elimination was originally implemented as `>= 25` in Phase 6, and later changed to `> 25` in a post-deployment phase. Reports: `PHASE_6_UNO_SHOW_EM_NO_MERCY_REPORT.md` through `PHASE_6_1_6_PUBLICATION_METADATA_AUDIT_CORRECTION_REPORT.md` (Commits `0967aa6` through `2b9521b`).

### Phase 7 through 7.1.2: UNO All Wild! Implementation & Forced Swap Victory
- **Goal:** 112-card All Wild variant, action-only cards, targeted draw, forced swap mechanics.
- **What Was Built:** `all-wild.adapter.ts`, `all-wild.deck.ts`, `all-wild.actions.ts`, `ForcedSwapModal.tsx`.
- **Decisions & Rationale:** Ruled that playing Wild Forced Swap as a player's final card executes the swap before victory check, transferring the 1-card hand to the victim and preventing immediate win.
- **Problems & Resolution:** Turn sequencing after Skip Two in 2-player and 3-player configurations.
- **Verification & Code Match:** Matches code. Reports: `PHASE_7_UNO_ALL_WILD_IMPLEMENTATION_REPORT.md` through `PHASE_7_1_2_OFFICIAL_FORCED_SWAP_RULING_AUDIT_REPORT.md` (Commits `bdb653d` through `45d9d8e`).

### Phase 8 & 8.1: UNO Flex! Implementation
- **Goal:** Dual-mode cards, Power Cards (active/inactive), Flex actions, flip icon triggers.
- **What Was Built:** `flex.adapter.ts`, `flex.deck.ts`, `flex.actions.ts`, `FlexCardChoiceModal.tsx`.
- **Decisions & Rationale:** Strict color-pairing hierarchy for number and action cards; Power Card status tracked per player.
- **Problems & Resolution:** Power Card flip sequencing when opening card has flip icon.
- **Verification & Code Match:** Matches code. Reports: `PHASE_8_UNO_FLEX_IMPLEMENTATION_REPORT.md`, `PHASE_8_1_UNO_FLEX_RULE_SEQUENCING_AUDIT_REPORT.md` (Commits `52e6f5a`, `20f236c`).

### Phase 9 & 9.1: UNO Teams Implementation
- **Goal:** 4–8 player team play, partner seating, card passing, split hands, team scoring.
- **What Was Built:** `teams.adapter.ts`, `teams.deck.ts`, `teams.actions.ts`, `TeamPassModal.tsx`.
- **Decisions & Rationale:** Partner sits opposite (`(i + N/2) % N`). Passing mechanics at start and mid-game.
- **Problems & Resolution:** Splitting partner hand when teammate goes out without ending the match.
- **Verification & Code Match:** Matches code. Reports: `PHASE_9_UNO_TEAMS_IMPLEMENTATION_REPORT.md`, `PHASE_9_1_UNO_TEAMS_COMPLIANCE_AUDIT_REPORT.md` (Commits `7d6763f`, `422b097`).

### Phase 10 through 10.1.1: UNO Attack! Implementation
- **Goal:** Virtual card launcher, tension levels (0–4), customizable cards, Attack-Attack cards.
- **What Was Built:** `attack.adapter.ts`, `attack.deck.ts`, `attack.launcher.ts`, `AttackLauncher.tsx`.
- **Decisions & Rationale:** Strictly enforced Mattel GTX66 rule permitting only 1 or 3 Wild Customizable cards (110 or 112 deck size).
- **Problems & Resolution:** Virtual launcher probabilistic balance to ensure tension builds realistically.
- **Verification & Code Match:** Matches code. Reports: `PHASE_10_UNO_ATTACK_IMPLEMENTATION_REPORT.md` through `PHASE_10_1_1_UNO_ATTACK_RULES_CORRECTION_REPORT.md` (Commits `c28d9ed` through `d51e115`).

### Deployment Phases: Production & Free-Tier Readiness
- **Goal:** Deploy on Render (server), Vercel (web), and Neon PostgreSQL (database).
- **What Was Built:** `render.yaml`, `render.free.yaml`, `vercel.json`, database connection pooling configs.
- **Decisions & Rationale:** Configured free-tier parameters, health checks, and build scripts.
- **Problems & Resolution:** Prisma client missing before build on Render; fixed by ensuring `prisma generate` runs prior to compilation (`909cbe4`).
- **Verification & Code Match:** Matches code. Reports: `DEPLOYMENT_READINESS_REPORT.md`, `FREE_TIER_DEPLOYMENT_READINESS_REPORT.md`, `RENDER_PRISMA_CLIENT_INITIALIZATION_FIX_REPORT.md`.

### Post-Deployment Bug Fixes & UX Evolution (Chronological Order)
1. **Room Winner Isolation Fix (`4c35b4d`):** Cleared stale winner state when players create or enter new rooms (`ROOM_WINNER_ISOLATION_BUG_FIX_REPORT.md`).
2. **No Mercy Reverse Draw 4 Stacking Fix (`f4e62b6`):** Allowed Wild Reverse Draw 4 to stack onto regular Draw 4 with direction reversal (`NO_MERCY_WILD_REVERSE_DRAW_4_STACKING_BUG_FIX_REPORT.md`).
3. **Global Force-Play Elimination (`3ca51f1`):** Removed automatic forced card play after drawing across all variants; player can choose to pass (`GLOBAL_DRAW_FORCE_PLAY_BUG_FIX_REPORT.md`).
4. **Variant-Specific Draw Rules (`083a37b`):** Aligned draw rules per official specs (single draw for Classic/Flip/Flex vs draw-until-playable up to 5 for No Mercy) (`UNO_VARIANT_SPECIFIC_DRAW_RULES_IMPLEMENTATION_REPORT.md`).
5. **Accept Cards Intermittent Freeze Fix (`7785b49`):** Fixed deadlock when multiple players accepted draw penalties simultaneously (`ACCEPT_CARDS_INTERMITTENT_FREEZE_FIX_REPORT.md`).
6. **Full App Interaction Reliability Hardening (`74cb9af`):** Hardened 7s swap, modal dismissals, duplicate click absorption (`FULL_APPLICATION_INTERACTION_AUDIT.md`, `INTERACTION_REGRESSION_TEST_MATRIX.md`).
7. **Card Movement Animations & Real-Time Chat (`60cae37`):** Added Framer Motion flight animations and room chat backed by PostgreSQL (`CARD_MOVEMENT_ANIMATIONS_AND_REALTIME_CHAT_REPORT.md`).
8. **Round-Table Game Layout (`c173da5`):** Built radial seat positioning, circular play direction indicator, and turn highlights (`ROUND_TABLE_GAME_LAYOUT_AND_PLAY_DIRECTION_REPORT.md`).
9. **Multiplayer Disconnect Grace Period & Leave Recovery (`d7c09b1`):** Added 30s disconnect grace period and automatic turn advancement on forfeit (`MULTIPLAYER_DISCONNECT_LEAVE_AND_TURN_RECOVERY_REPORT.md`).
10. **WDF Challenge Freeze Resolution (`0898fe9`):** Resolved freeze during challenge resolution and state recovery (`COMPREHENSIVE_GAME_FREEZE_AUDIT.md`).
11. **Authoritative UNO Declaration & Catch Window (`eec623b`):** Restricted UNO declaration to playing 2nd-to-last card; catch window enforcement (`UNO_DECLARATION_AND_CATCH_AUDIT.md`).
12. **Game Start Delay Fix (`16a4f84`):** Removed artificial 3-second countdown delay, batched database writes, added button loading state (`GAME_START_DELAY_FIX.md`).
13. **No Mercy Rules Update (`f15837d`):** Elimination threshold changed from `>= 25` to `> 25`; Wild Color Roulette replaced with Classic Wild (`NO_MERCY_RULES_UPDATE.md`).
14. **Hand Sorting, Rematch & Deep-Link Invitation (`c8eaaf0`):** Client-side card grouping by color and value, "Play Again" rematch flow with score persistence, `/join/:roomCode` deep links (`HAND_SORTING_REMATCH_INVITATION_FLOW.md`).
15. **Opponent Hand Inspection Removal Across All Variants (`bdd4795`):** Removed hand reveal on challenges to guarantee multiplayer privacy (`REMOVE_OPPONENT_HAND_INSPECTION_ACROSS_ALL_VARIANTS.md`).
16. **Wild Reverse Draw 4 Stacking Target Fix (`4a75a7b`):** In 3+ player games, penalty passes to previous player on reverse stack; in 2-player games, player receives penalty (`NO_MERCY_WDF_REVERSE_DRAW4_STACKING_TARGET_FIX.md`).
17. **Mobile Adaptive Gameplay Layouts (`ba9e571`):** Added dedicated mobile portrait layout with compact opponent ribbon and docked action controls (`MOBILE_ADAPTIVE_GAMEPLAY_REPORT.md`).
18. **Complete Premium UI/UX Redesign (`2aba10e`):** Eliminated AI slop; introduced deep emerald casino felt aesthetic and polished typography (`PREMIUM_REDESIGN_AUDIT.md`, `PREMIUM_UI_REDESIGN_REPORT.md`).
19. **Robust Multiplayer Network Recovery & Reconnection (`96f0308`):** Extended grace period to 120s, added PostgreSQL cold start recovery, client exponential backoff/jitter, non-destructive reconnect overlay (`NETWORK_RECOVERY_RECONNECTION_REPORT.md`).

---

## 9. Features List

### Completed Features
- **Zero-Registration Guest Identity:** Username-only login, UUID guest IDs, HMAC/hash token validation, session resumption.
- **Private Room Management:** 6-character room codes, shareable invitation links (`/join/:roomCode`), real-time lobby presence, host settings toggling, deterministic host transfer.
- **All 7 Official Mattel Game Variants:** Classic UNO, UNO Flip, UNO Show 'em No Mercy, UNO All Wild, UNO Flex, UNO Teams, UNO Attack.
- **Authoritative Rules & Action Processing:** Stacking, skipping, reversing, challenges, color choice, power cards, launcher simulation, hand splitting, team passing.
- **Server-Authoritative Anti-Cheat:** Cryptographic hand/draw pile redaction masks; full elimination of opponent hand inspection.
- **Room Chat:** Real-time multiplayer chat panel, persistent message history in PostgreSQL, unread count badges.
- **Visual Design & Responsive Layouts:** Deep emerald casino table aesthetic, radial desktop/landscape layout, compact mobile portrait layout, card movement animations.
- **Hand Organization:** Client-side grouping by color (Red &rarr; Blue &rarr; Green &rarr; Yellow &rarr; Dark &rarr; Wilds) and ascending value sorting.
- **Rematch Flow:** "Play Again" host action preserving cumulative scores across multiple rounds.
- **Multiplayer Resilience:** 120-second disconnect grace period, database cold-start recovery, client auto-reconnection with exponential backoff and jitter, non-destructive recovery overlay.

### Partially Done Features
- **Sound & Audio Feedback:** `howler` dependency is installed in `apps/web/package.json`, but sound effects are not wired into the UI and no audio asset files exist in `public/`.
- **E2E Test Suite Expansion:** Playwright tests cover Classic and Flip, but automated browser E2E suites have not yet been extended to No Mercy, All Wild, Flex, Teams, and Attack.

### Planned or Missing Features
- **AI Bot Players:** No single-player or bot replacement mode exists.
- **Spectator Mode:** Non-player room observation is not implemented.
- **Custom House Rules Configurator:** Ability for hosts to toggle individual rules (e.g. enabling 7-0 passing in Classic or custom penalty limits).
- **Sound Mute / Volume Settings Panel:** Audio controls cannot be rendered until audio engine is implemented.

---

## 10. Key Design Decisions

1. **Transport-Agnostic Engine:** The core game engine (`packages/game-engine`) has zero dependencies on Express, Socket.IO, HTTP, or filesystem. It operates solely on pure input actions and immutable state trees. This guarantees testability and prevents network leaks.
2. **Event Sourcing with State Snapshots:** Every valid action increments a sequence number and persists a `GameEvent` record in PostgreSQL. Periodic `GameSnapshot` records serialize full engine state to disk, allowing instant recovery across server restarts or container sleeps.
3. **Variant Adapter Pattern:** Rather than conditional branching (`if (variant === 'flip')`), each variant implements `GameVariantAdapter` registered in `VariantRegistry`. All lifecycle steps (deck creation, dealer determination, move validation, action processing, scoring) are encapsulated.
4. **Guest-Only Ephemeral Identity:** Eliminates user registration friction for casual play sessions while maintaining cryptographic session integrity via hashed token cookies.
5. **Multiplayer Privacy Over Physical Rule Emulation:** In physical UNO, a Wild Draw Four challenge involves showing the offender's physical hand to the challenger. In online multiplayer, this created privacy vulnerabilities. The decision was made to execute legality checks purely on the server and completely suppress opponent hand reveals across all variants.
6. **Pure Frontend Presentation Sorting:** Hand sorting is executed strictly on the client presentation layer (`cardSorting.ts`). Hand card IDs and array indices in the authoritative game state remain unchanged, ensuring move submission IDs never desynchronize.
7. **Durable Disconnect Reconciler:** Wall-clock elapsed time checks on server reboot compare `now()` against `lastSeenAt` timestamps in PostgreSQL, ensuring players disconnected during a Render container restart are not unfairly dropped or preserved indefinitely.

---

## 11. Known Issues, Bugs, and TODOs

### 1. TypeScript Typecheck Error in Server Integration Test
- **File:** `apps/server/tests/integration/game.robust-network-reconnection.socket.test.ts:472`
- **Error:** `error TS2353: Object literal may only specify known properties, and 'cardPlayerId' does not exist in type 'PendingWildDrawFourState'.`
- **Root Cause:** Test fixture mock state specifies `cardPlayerId: guest1Id` instead of the schema-defined property `playedByPlayerId`.
- **Impact:** `pnpm typecheck` fails in `apps/server`, although Vitest executes because it transpiles without type validation.

### 2. Integration Test Timeouts Under Sequential Execution
- **Files:**
  - `apps/server/tests/integration/game.rematch.socket.test.ts`
  - `apps/server/tests/integration/game.robust-network-reconnection.socket.test.ts` (Test 11: duplicate concurrent reconnects)
- **Impact:** Vitest times out (35000ms / 10000ms) on these two tests during full test suite runs when database transactions or socket disconnections exceed default timeouts.

### 3. Missing Audio Assets & Unused Dependency
- **File:** `apps/web/package.json`
- **Issue:** `"howler": "^2.2.4"` is installed, but no audio files exist in `apps/web/public` and no audio playback service exists in `apps/web/src`.

### 4. Client Web Bundle Size Warning
- **File:** `apps/web/vite.config.ts` / `pnpm build`
- **Issue:** Main bundle chunk `dist/assets/index-*.js` exceeds 841 kB. Code splitting and lazy loading of game variant modals have not been implemented.

### 5. Outdated Root Documentation
- **File:** `d:\uno\README.md`
- **Issue:** `README.md` was last updated at Phase 5.1 and omits Phases 6 through 10, deployment configs, and the 19 post-deployment phases.

---

## 12. Data and Assets

### Static Assets
- `apps/web/public/card-icon.svg`: Application favicon and card back branding icon.
- Card Faces: Rendered procedurally via Tailwind CSS, SVG shapes, and Lucide React icons in `PlayingCard.tsx`.

### Audio Assets
- **Status:** None present. Directory `apps/web/public/sounds/` does not exist.

### Database Entities (`database/prisma/schema.prisma`)
- `GuestSession`: Ephemeral player records (`id`, `username`, `tokenHash`, `createdAt`, `expiresAt`, `lastSeenAt`).
- `Room`: Game rooms (`id`, `roomCode`, `hostGuestId`, `status`, `maxPlayers`, `settings`, `version`, `expiresAt`).
- `RoomMember`: Player-to-room mappings (`role`, `readyStatus`, `connectionStatus`, `lastSeenAt`).
- `Match`: Active or historical game sessions (`variant`, `status`, `sequenceNumber`, `turnNumber`, `winnerGuestId`).
- `MatchPlayer`: Player participation records (`playerIndex`, `cardCount`, `score`, `isWinner`).
- `GameEvent`: Event sourcing journal (`sequenceNumber`, `eventType`, `payload`).
- `GameSnapshot`: Serialized JSON state checkpoints (`sequenceNumber`, `state`).
- `ChatMessage`: Room chat history (`guestId`, `username`, `message`, `createdAt`).

---

## 13. Conventions

### Naming & Code Style
- **Workspaces:** `@uno-ultimate/<package-name>`
- **Files & Folders:**
  - Backend modules/services: `kebab-case.service.ts` (e.g. `room.service.ts`, `game.session.manager.ts`).
  - React components: `PascalCase.tsx` (e.g. `RoundTable.tsx`, `PlayingCard.tsx`).
  - Unit/Integration tests: `*.test.ts` or `*.test.tsx` placed in `__tests__` or `tests/`.
  - State stores: `camelCaseStore.ts` (e.g. `gameStore.ts`, `guestStore.ts`).
- **Git Commit Messages:** Conventional Commits standard:
  - `feat(<scope>): description`
  - `fix(<scope>): description`
  - `docs(<scope>): description`
- **Phase Reports:** Every completed phase or major bugfix requires a comprehensive Markdown report stored in `reports/` documenting objectives, architecture, files modified, test matrices, and remote commit SHAs.

---

## 14. Next Phase Plan

Based on the verified codebase state, the remaining priorities are ordered as follows:

### Priority 1 (Immediate Next Phase): Test Hardening & Typecheck Cleanliness
- **Goal:** Resolve the typecheck failure in `apps/server/tests/integration/game.robust-network-reconnection.socket.test.ts:472` (`cardPlayerId` &rarr; `playedByPlayerId`), tune socket test timeouts to eliminate intermittent timeouts under full suite runs, and update root `README.md` to reflect all completed phases.
- **Scope:** `apps/server/tests/integration`, `README.md`.

### Priority 2: Audio Engine & Sound FX Integration
- **Goal:** Activate the existing `howler` dependency. Source or synthesize lightweight, high-quality casino sound effects (card deals, card flips, draw slaps, UNO declarations, challenge alerts, victory chimes). Add a mute/volume control in the game header.
- **Scope:** `apps/web/public/sounds`, `apps/web/src/services/soundService.ts`, `apps/web/src/components/common/Header.tsx`.

### Priority 3: Frontend Bundle Optimization & Code Splitting
- **Goal:** Code-split route pages (`LandingPage`, `LobbyPage`, `GamePage`) and dynamically import large variant modals (`AttackLauncher`, `FlexCardChoiceModal`, `TeamPassModal`) to reduce initial JS chunk size from 841 kB to below 250 kB.
- **Scope:** `apps/web/src/app/App.tsx`, `apps/web/vite.config.ts`.

### Priority 4: AI Bot Mode (Single-Player / Practice)
- **Goal:** Implement server-side lightweight rule-based bot agents (`BotPlayerService`) so solo hosts can practice or fill empty room seats.
- **Scope:** `packages/game-engine/src/players/bot.strategy.ts`, `apps/server/src/modules/game/bot.service.ts`.
