# UNO Ultimate — Phase 4.3: Official Rule Source Alignment & Verification Evidence Audit

UNO Ultimate is an online, private multiplayer card game crafted specifically for groups of friends. It does not provide public matchmaking, open player lobbies, or social networking features.

Phase 4.3 completes a rigorous rule source alignment and verification evidence audit: aligning dealer-determination and deck composition documentation with the official Mattel 42001 instruction sheet, distinguishing official Mattel rules from application-level design policies (such as tie-breaking redraws and fallbacks), accurately categorizing test tiers (57 server integration tests including full-round playout vs 2 multi-context Playwright browser E2E tests), verifying in-process session-loss recovery within a single-instance architecture, and validating real PostgreSQL transaction rollback under injected database failures.

---

## Tech Stack

- **Game Engine**: Pure TypeScript, transport-agnostic, zero-IO, cryptographically secure and deterministic PRNGs (`@uno-ultimate/game-engine`)
- **Protocol**: Shared Zod schemas, socket contracts, typed payloads, and projections (`@uno-ultimate/game-protocol`)
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v7, Zustand, Socket.IO Client, Framer Motion, Howler.js, Zod (`@uno-ultimate/web`)
- **Backend**: Node.js, Express, TypeScript, Socket.IO, Zod validation, Helmet, CORS, Cookie-Parser, Express-Rate-Limit (`@uno-ultimate/server`)
- **Database**: PostgreSQL 16, Prisma ORM (`@uno-ultimate/database`)
- **Monorepo**: pnpm workspaces
- **Testing**: Vitest, React Testing Library, Supertest, Playwright E2E (180 unit and integration tests across monorepo + 2 browser Playwright E2E tests)

---

## Core Features (Phases 1, 2, 3, 4, 4.1, 4.2 & 4.3)

- **Zero Sign-Up Guest Identity**: Instant play with a username. Server-generated UUID guest ID and temporary session token with HttpOnly cookie support and resumption validation.
- **Private Room Creation**: Server generates unique, unambiguous 6-character room codes (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
- **Direct Invitation Links**: Shareable `/join/:roomCode` URLs with pre-flight metadata checks.
- **Real-Time Lobby Presence**: Live member lists, player avatar badges, online/reconnecting indicators, and optimistic state versioning.
- **Player Readiness & Host Controls**: Ready status toggling, host capacity management (2–10 players), and match initiation with countdown.
- **Deterministic Host Transfer**: Seamless host handover to the earliest eligible member (`joinedAt ASC`) if the host disconnects or leaves.
- **30-Second Reconnection Grace Period**: Transient network disconnections retain room slot and state without aborting the lobby.
- **Playable Real-Time Classic UNO (Mattel 42001)**:
  - **Authoritative 108-Card Playable Deck**: The official Mattel 42001 instruction sheet lists 112 physical cards in the box (including 4 customizable Blank Cards). For digital gameplay, UNO Ultimate implements the canonical 108 non-blank card deck (76 number cards, 24 action cards, 8 wild cards), intentionally omitting the optional Blank Cards.
  - **Hardened Opening Reverse Rule**: Tested against real `createGame` and `startNextRound` methods with deterministic card fixtures. When Reverse is turned up at the beginning of play, play proceeds counter-clockwise and the player to the dealer's right plays first (e.g. for dealer 0 with 4 players, player 3; with 3 players, player 2; with 2 players, player 1).
  - **Canonical Dealer Determination & Application Tie-Breaking Policy**: Follows official Mattel 42001 Setup and Scoring tables: each player draws a card from the shuffled 108-card deck, and the highest point value deals (0–9 face value, 20 for action cards, 50 for wild cards). Ties are resolved through an explicit application-level policy (not specified by Mattel): tied candidates redraw cards up to a safety ceiling of 20 rounds, with a deterministic fallback (`Math.min(...candidates)`) to guarantee termination with zero infinite loops.
  - **Starting Wild Discard Resolution**: Adopts official Setup Section precedence—an opening Wild or Wild Draw Four card is returned to the deck and reshuffled until a non-Wild card is revealed.
  - **Monotonic Event Sequencing Invariant**: Ensures `nextState.sequenceNumber === (events.at(-1)?.sequenceNumber ?? state.sequenceNumber)` across all multi-event actions, preventing database unique constraint collisions.
  - **Atomic Transactional Persistence & Rollback**: Every game action batch (Match status, MatchPlayer standings, GameEvents, and GameSnapshot) commits in a single atomic Prisma `$transaction`. In-memory state advances only on database commit success. Verified through unit and integration tests injecting mid-transaction database failures to prove PostgreSQL ACID rollback of all partial writes without orphaned records or sequence gaps.
  - **In-Process Session-Loss Recovery**: Reconnection via `room:resume` deserializes the latest PostgreSQL GameSnapshot, validates membership, and restores the player's private hand and active table state seamlessly. Verified via in-process session clearing (`clearAllSessionsForTesting()`) within the single-instance server architecture.
  - **Active Countdown Tracking & Cancellation**: Production 5-second countdown is tracked in `activeCountdownTimers` and cleanly cancelled if any player unreadies, leaves, or disconnects.
  - **Information Hiding Security**: Players only ever receive their own private 7-card hand. Opponents receive only card counts; draw pile order is completely hidden.
  - **Wild Draw Four Challenge Lifecycle**: Suspected illegal plays can be challenged by the victim. The server securely reveals the offender's hand *only* to the challenger. If guilty: offender draws 4 cards; if innocent: challenger draws 6 cards and loses turn.
  - **UNO Shouting & 4-Card Penalty**: Players holding 1 card who fail to declare UNO can be caught by opponents before the next player's move, receiving a strict 4-card penalty per Mattel 42001 rules.
  - **Multi-Round Match Scoring & 500-Point Target**: Opponent cards scored at round conclusion (0-9 face value, 20 for action cards, 50 for wilds) accumulating towards the official 500-point match target. Match transitions to COMPLETED when cumulative score hits 500 points.
  - **Full Round & Multi-Round Socket/Database Integration Tests**: Complete round playouts down to zero cards, dealer rotation, score accumulation, and game completion validated through Socket.IO and PostgreSQL integration tests (`apps/server/tests/integration/game.full-round.test.ts`).
  - **Interactive Responsive Game Board**: SVG/CSS Uno cards with hover/playable glow, fan layouts, opponent seats, draw/discard piles, wild color selector modal, and round/match victory celebration modals.
  - **Multi-Context Browser E2E Testing**: Automated Playwright test suite (`apps/web/tests/e2e/multiplayer-game.spec.ts`) exercising 2 independent browser contexts (Alice & Bob in real Google Chrome) across room creation, joining, countdown display, dealing, real-time play, and disconnect recovery.

---

## Repository Structure

```
uno-ultimate/
├── apps/
│   ├── web/                     # React + Vite frontend application
│   │   ├── src/
│   │   │   ├── app/             # Application entry and routing (/join/:roomCode, /room/:roomCode, /game/:roomCode)
│   │   │   ├── components/      # Common UI components (Header, Footer)
│   │   │   ├── features/
│   │   │   │   ├── guest/       # Guest login form & dashboard view
│   │   │   │   ├── room/        # CreateRoomModal, JoinRoomModal, PlayerCard, InviteLinkCard
│   │   │   │   └── game/        # GameBoard, PlayingCard, PlayerHand, DrawPile, DiscardPile, UnoButton, ChallengePanel, Scoreboard
│   │   │   ├── pages/           # LandingPage, DashboardPage, LobbyPage, JoinInvitePage, GamePage
│   │   │   ├── services/        # HTTP API client and Socket.IO client manager
│   │   │   ├── stores/          # Zustand guestStore, roomStore, and gameStore
│   │   │   └── styles/          # Tailwind globals and theme styling
│   │   ├── tests/
│   │   │   └── e2e/             # Playwright multi-context browser end-to-end test suite
│   │   └── ...
│   └── server/                  # Express + Socket.IO backend service
│       ├── src/
│       │   ├── config/          # Zod-validated environment config
│       │   ├── middleware/      # Error handler, request validator, rate limiter
│       │   ├── modules/
│       │   │   ├── guest/       # Guest session controller, service, routes
│       │   │   ├── room/        # Room service, code generator, routes
│       │   │   └── game/        # GameSessionManager (concurrency mutex), GameService, GamePersistenceService, StatePublisher
│       │   ├── routes/          # Health, guest, and room routes
│       │   ├── sockets/         # SocketServer, roomSocketHandler, gameSocketHandler
│       │   ├── utils/           # Structured logger & crypto utilities
│       │   ├── app.ts           # Express app instance for tests
│       │   └── server.ts        # Server bootstrap and graceful shutdown
│       └── ...
├── packages/
│   ├── game-engine/             # Transport-agnostic server-authoritative UNO game engine (Mattel 42001)
│   │   ├── src/
│   │   │   ├── cards/           # Card models, immutable factories, and validators
│   │   │   ├── deck/            # 108-card factory, Fisher-Yates crypto/deterministic shuffle, deck manager
│   │   │   ├── players/         # Player models, hand manager, score calculator
│   │   │   ├── turns/           # Turn direction, sequencing, and 2-player rules
│   │   │   ├── validation/      # Pure move legality validator (strict UNO & WDF rules)
│   │   │   ├── actions/         # Pure state transition processor (ActionProcessor)
│   │   │   ├── projections/     # Secure state projection masks (PlayerGameState, PublicGameState)
│   │   │   └── game/            # GameState, GameConfig, and GameFactory
│   │   └── ...
│   ├── game-protocol/           # Shared socket events, payload DTOs, and schemas
│   ├── shared/                  # Shared constants, error codes, and utilities
│   └── database/                # Prisma schema, migrations, client exports
├── docs/
│   ├── architecture/            # Architecture specifications (Phases 1, 2, 3, 4 & 4.1 Integrity & Recovery)
│   └── rules/                   # Mattel 42001 Classic UNO rules implementation specification
└── reports/                     # Formal verification and phase audit reports
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.x
- pnpm >= 9.x
- Docker or local PostgreSQL 16
- Google Chrome (for Playwright E2E browser testing)

### Local Development Setup

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/afrid995/uno.git
   cd uno
   pnpm install
   ```

2. **Start PostgreSQL database**:
   ```bash
   # Using docker compose
   docker compose up -d postgres
   ```

3. **Run database migrations**:
   ```bash
   pnpm db:migrate
   ```

4. **Build shared packages**:
   ```bash
   pnpm --filter @uno-ultimate/shared build
   pnpm --filter @uno-ultimate/game-engine build
   pnpm --filter @uno-ultimate/game-protocol build
   ```

5. **Start frontend and backend concurrently**:
   ```bash
   pnpm dev
   ```
   - Web application: http://localhost:5173
   - Backend API & WebSockets: http://localhost:4000

---

## Quality Assurance & Verification Commands

```bash
# Run all unit and integration tests across monorepo (180 tests across 26 test files)
pnpm test

# Run multi-context browser E2E test suite (Playwright - 2 scenarios across 2 browser contexts)
pnpm --filter @uno-ultimate/web test:e2e

# Run TypeScript typechecks across all workspaces
pnpm typecheck

# Run ESLint across all workspaces
pnpm lint

# Build all packages and applications for production
pnpm build
```
