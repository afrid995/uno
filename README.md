# UNO Ultimate — Phase 4: Playable Classic UNO (End-to-End Multiplayer)

UNO Ultimate is an online, private multiplayer card game crafted specifically for groups of friends. It does not provide public matchmaking, open player lobbies, or social networking features.

Phase 4 completes the integration between the private room system and the server-authoritative game engine, delivering a fully playable, real-time multiplayer Classic UNO experience based strictly on Mattel product **42001** official rules.

---

## Tech Stack

- **Game Engine**: Pure TypeScript, transport-agnostic, zero-IO, cryptographically secure and deterministic PRNGs (`@uno-ultimate/game-engine`)
- **Protocol**: Shared Zod schemas, socket contracts, typed payloads, and projections (`@uno-ultimate/game-protocol`)
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v7, Zustand, Socket.IO Client, Framer Motion, Howler.js, Zod (`@uno-ultimate/web`)
- **Backend**: Node.js, Express, TypeScript, Socket.IO, Zod validation, Helmet, CORS, Cookie-Parser, Express-Rate-Limit (`@uno-ultimate/server`)
- **Database**: PostgreSQL 16, Prisma ORM (`@uno-ultimate/database`)
- **Monorepo**: pnpm workspaces
- **Testing**: Vitest, React Testing Library, Supertest (153 automated tests passing across 25 test suites)

---

## Core Features (Phases 1, 2, 3 & 4)

- **Zero Sign-Up Guest Identity**: Instant play with a username. Server-generated UUID guest ID and temporary session token with HttpOnly cookie support and resumption validation.
- **Private Room Creation**: Server generates unique, unambiguous 6-character room codes (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
- **Direct Invitation Links**: Shareable `/join/:roomCode` URLs with pre-flight metadata checks.
- **Real-Time Lobby Presence**: Live member lists, player avatar badges, online/reconnecting indicators, and optimistic state versioning.
- **Player Readiness & Host Controls**: Ready status toggling, host capacity management (2–10 players), and match initiation with countdown.
- **Deterministic Host Transfer**: Seamless host handover to the earliest eligible member (`joinedAt ASC`) if the host disconnects or leaves.
- **30-Second Reconnection Grace Period**: Transient network disconnections retain room slot and state without aborting the lobby.
- **Playable Real-Time Classic UNO (Mattel 42001)**:
  - **Authoritative 108-Card Playable Deck**: 76 number cards, 24 action cards, 8 wild cards (no blank cards).
  - **Mattel 42001 Start Card Enforcement**: Both Wild and Wild Draw Four cards turned over on setup are returned to the draw pile and reshuffled until a non-Wild card is turned over.
  - **Information Hiding Security**: Players only ever receive their own private 7-card hand. Opponents receive only card counts; draw pile order is completely hidden.
  - **Wild Draw Four Challenge Lifecycle**: Suspected illegal plays can be challenged by the victim. The server securely reveals the offender's hand *only* to the challenger. If guilty: offender draws 4 cards; if innocent: challenger draws 6 cards and loses turn.
  - **UNO Shouting & 4-Card Penalty**: Players holding 1 card who fail to declare UNO can be caught by opponents before the next player's move, receiving a strict 4-card penalty per Mattel 42001 rules.
  - **Multi-Round Match Scoring**: Opponent cards scored at round conclusion (0-9 face value, 20 for action cards, 50 for wilds) accumulating towards the official 500-point match target.
  - **Seamless Active Match Reconnection**: Disconnected players rejoin their active seat and recover their private hand without losing match progress.
  - **Interactive Responsive Game Board**: SVG/CSS Uno cards with hover/playable glow, fan layouts, opponent seats, draw/discard piles, wild color selector modal, and round/match victory celebration modals.

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
│   ├── architecture/            # Phase 1, Phase 2, and Phase 4 gameplay architecture specifications
│   └── rules/                   # Mattel 42001 Classic UNO rules implementation specification
└── reports/                     # Formal verification and phase audit reports
```

---

## Getting Started

### Prerequisites

- Node.js >= 20.x
- pnpm >= 9.x
- Docker or local PostgreSQL 16

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
# Run all tests across monorepo (153 tests)
pnpm test

# Run TypeScript typechecks across all workspaces
pnpm typecheck

# Run ESLint across all workspaces
pnpm lint

# Build all packages and applications for production
pnpm build
```
