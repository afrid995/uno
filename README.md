# UNO Ultimate — Phase 3: Server-Authoritative Game Engine

UNO Ultimate is an online, private multiplayer card game crafted specifically for groups of friends. It does not provide public matchmaking, open player lobbies, or social networking features.

Phase 3 builds upon the Phase 1 guest identity and Phase 2 private multiplayer rooms to introduce an independent, reusable, deterministic, and server-authoritative UNO game engine package (`@uno-ultimate/game-engine`) that strictly implements Mattel's official Classic UNO rules.

---

## Tech Stack

- **Game Engine**: Pure TypeScript, transport-agnostic, zero-IO, cryptographically secure and deterministic PRNGs
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v7, Zustand, Socket.IO Client, Framer Motion, Howler.js, Zod
- **Backend**: Node.js, Express, TypeScript, Socket.IO, Zod validation, Helmet, CORS, Cookie-Parser, Express-Rate-Limit
- **Database**: PostgreSQL 16, Prisma ORM
- **Monorepo**: pnpm workspaces
- **Testing**: Vitest, React Testing Library, Supertest (124 automated tests passing)

---

## Core Features (Phase 1, Phase 2 & Phase 3)

- **Zero Sign-Up Guest Identity**: Instant play with a username. Server-generated UUID guest ID and temporary session token with HttpOnly cookie support and resumption validation.
- **Private Room Creation**: Server generates unique, unambiguous 6-character room codes (`23456789ABCDEFGHJKLMNPQRSTUVWXYZ`).
- **Direct Invitation Links**: Shareable `/join/:roomCode` URLs with pre-flight metadata checks.
- **Real-Time Lobby Presence**: Live member lists, player avatar badges, online/reconnecting indicators, and optimistic state versioning.
- **Player Readiness & Host Controls**: Ready status toggling, host capacity management (2–10 players), and match initiation with countdown.
- **Deterministic Host Transfer**: Seamless host handover to the earliest eligible member (`joinedAt ASC`) if the host disconnects or leaves.
- **30-Second Reconnection Grace Period**: Transient network disconnections retain room slot and state without aborting the lobby.
- **Server-Authoritative Game Engine**:
  - **Official Mattel Deck**: Exactly 108 canonical cards (76 number cards, 24 action cards, 8 wild cards).
  - **Strict Rules Compliance**: Color/value/wild matching; official Start Card flip handling (reserves Wild Draw 4 to draw pile); official 2-player rules (Reverse/Skip/Draw Two grant another turn).
  - **No Unvetted House Rules**: Zero stacking of +2 or +4 cards, no draw-until-playable, no 7-0 hand rotations.
  - **Card Conservation**: Rigorous invariant that Draw Pile + Discard Pile + Hands strictly equals 108 cards at all times.
  - **Automatic Reshuffling**: Depleted draw pile automatically reshuffles underlying discard cards while strictly preserving the active top card.
  - **UNO Shouting & Penalties**: Formal `CALL_UNO` and `CHALLENGE_UNO_FAILURE` 2-card draw penalty enforcement.
  - **Concealed State Projections**: `PublicGameState` hides card identities; `PlayerGameState` exposes legal `playableCardIds` for the authenticated player only.
  - **Match & Event Persistence**: Relational PostgreSQL schema tracking `Match`, `MatchPlayer`, `GameEvent`, and `GameSnapshot`.

---

## Repository Structure

```
uno-ultimate/
├── apps/
│   ├── web/                     # React + Vite frontend application
│   │   ├── src/
│   │   │   ├── app/             # Application entry and routing (/join/:roomCode, /room/:roomCode)
│   │   │   ├── components/      # Common UI components (UnoCardVisual, Header, Footer)
│   │   │   ├── features/
│   │   │   │   ├── guest/       # Guest login form & dashboard view
│   │   │   │   └── room/        # CreateRoomModal, JoinRoomModal, PlayerCard, InviteLinkCard
│   │   │   ├── pages/           # LandingPage, DashboardPage, LobbyPage, JoinInvitePage
│   │   │   ├── services/        # HTTP API client and Socket.IO client manager
│   │   │   ├── stores/          # Zustand guestStore and roomStore
│   │   │   ├── styles/          # Tailwind globals and theme styling
│   │   │   └── main.tsx         # DOM mount
│   │   └── ...
│   └── server/                  # Express + Socket.IO backend service
│       ├── src/
│       │   ├── config/          # Zod-validated environment config
│       │   ├── middleware/      # Error handler, request validator, rate limiter
│       │   ├── modules/
│       │   │   ├── guest/       # Guest session controller, service, routes
│       │   │   └── room/        # Room service, code generator, routes
│       │   ├── routes/          # Health, guest, and room routes
│       │   ├── sockets/         # SocketServer auth middleware & roomSocketHandler
│       │   ├── utils/           # Structured logger & crypto utilities
│       │   ├── app.ts           # Express app instance for tests
│       │   └── server.ts        # Server bootstrap and graceful shutdown
│       └── ...
├── packages/
│   ├── game-engine/             # Transport-agnostic server-authoritative UNO game engine
│   │   ├── src/
│   │   │   ├── cards/           # Card models, immutable factories, and validators
│   │   │   ├── deck/            # 108-card factory, Fisher-Yates crypto/deterministic shuffle, deck manager
│   │   │   ├── players/         # Player models, hand manager, score calculator
│   │   │   ├── turns/           # Turn direction, sequencing, and 2-player rules
│   │   │   ├── validation/      # Pure move legality validator
│   │   │   ├── actions/         # Pure state transition processor (ActionProcessor)
│   │   │   ├── game/            # GameState, GameFactory, GameEngine, serialization
│   │   │   ├── projections/     # PublicGameState and PlayerGameState projections
│   │   │   ├── variants/        # Extensible UnoVariant interface & Classic UNO rules
│   │   │   └── testing/         # Deterministic PRNGs (Mulberry32, sequence RNG)
│   │   └── tests/               # 52 unit and property tests
│   ├── game-protocol/           # Socket events and server-authoritative models
│   └── shared/                  # Shared Zod schemas, constants, and types
├── database/                    # Prisma schema, migrations, and database client
├── infrastructure/              # PostgreSQL startup scripts & container configs
├── docs/
│   ├── architecture/            # PHASE_1_ARCHITECTURE.md, PHASE_2_ROOM_ARCHITECTURE.md, PHASE_3_GAME_ENGINE_ARCHITECTURE.md
│   └── rules/                   # UNO_CORE_SPECIFICATION.md, CLASSIC_UNO_IMPLEMENTATION.md
├── reports/                     # PHASE_1_PROJECT_FOUNDATION_REPORT.md, PHASE_2_PRIVATE_ROOMS_REPORT.md, PHASE_3_GAME_ENGINE_REPORT.md
├── docker-compose.yml           # Local PostgreSQL service definition
├── package.json                 # Monorepo scripts
├── pnpm-workspace.yaml          # Monorepo workspace configuration
├── .env.example                 # Example configuration
└── README.md
```

---

## Prerequisites

- **Node.js**: >= 20.x (tested on v22.17.0)
- **pnpm**: >= 9.x or 12.x (configured with pnpm@12.18.0)
- **Docker Compose** or a running **PostgreSQL 16** instance on port 5432

---

## Quick Start & Setup Instructions

### 1. Clone & Install Dependencies

```bash
git clone <repository-url> uno-ultimate
cd uno-ultimate
pnpm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL` matches your local PostgreSQL credentials:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/uno_ultimate?schema=public
PORT=4000
VITE_API_URL=http://localhost:4000
CORS_ORIGIN=http://localhost:5173
SESSION_SECRET=dev_session_secret_replace_with_secure_random_hex_in_production
SESSION_EXPIRATION_HOURS=24
```

### 3. Start PostgreSQL Database

Using Docker Compose:
```bash
docker compose up -d
```

*(On Windows WSL environments, you can also run `./infrastructure/start-postgres.sh` directly)*.

### 4. Run Prisma Database Migrations

Generate the Prisma Client and deploy migrations:

```bash
pnpm db:generate
pnpm db:deploy
```

### 5. Launch Development Servers

Start both backend (`http://localhost:4000`) and frontend (`http://localhost:5173`) concurrently:

```bash
pnpm dev
```

---

## Verification & Commands

| Command | Description |
| :--- | :--- |
| `pnpm dev` | Starts backend and frontend development servers concurrently |
| `pnpm build` | Compiles all packages (`@uno-ultimate/shared`, `@uno-ultimate/game-engine`, `@uno-ultimate/game-protocol`, `@uno-ultimate/database`, `@uno-ultimate/server`, `@uno-ultimate/web`) |
| `pnpm test` | Runs the full Vitest suite (124 unit, property, integration, and UI tests across packages) |
| `pnpm lint` | Runs ESLint across all workspaces |
| `pnpm typecheck` | Validates TypeScript types across all workspaces with `tsc --noEmit` |
| `pnpm db:generate` | Generates the typed Prisma Client |
| `pnpm db:deploy` | Applies all pending migrations to PostgreSQL |

---

## API & Socket.IO Specification

### REST Endpoints
- `GET /api/health`: Health check and database latency ping
- `POST /api/guest`: Creates a guest session with username validation (sets `uno_session` HttpOnly cookie)
- `POST /api/guest/resume`: Resumes a session using cookie or Bearer token; prevents ID spoofing
- `GET /api/rooms/:roomCode`: Read-only pre-flight metadata for invitation links
- `GET /api/rooms/:roomCode/state`: Authenticated room state for room members

### Socket.IO Events
- **Room Lifecycle**: `room:create`, `room:join`, `room:join-link`, `room:leave`, `room:ready`, `room:update-settings`, `room:start`, `room:resume`
- **Room Broadcasting**: `room:created`, `room:joined`, `room:state`, `room:player-joined`, `room:player-left`, `room:player-ready`, `room:host-changed`, `room:starting`, `room:closed`, `room:error`
- **Game Engine Actions**: `game:play-card`, `game:draw-card`, `game:choose-color`, `game:uno`, `game:challenge-uno`
- **Game Broadcasting**: `game:state`, `game:finished`

See [PHASE_3_GAME_ENGINE_ARCHITECTURE.md](file:///d:/uno/docs/architecture/PHASE_3_GAME_ENGINE_ARCHITECTURE.md) and [CLASSIC_UNO_IMPLEMENTATION.md](file:///d:/uno/docs/rules/CLASSIC_UNO_IMPLEMENTATION.md) for complete specifications.

---

## Security Architecture Highlights

- **Guest Identity**: Player identity is anchored in a server-generated UUID, not client-supplied usernames.
- **Token Security**: Tokens are generated using 256-bit cryptographically secure random bytes (`crypto.randomBytes(32)`).
- **One-Way Hash**: Only SHA-256 HMAC digests are stored in the database. Raw tokens are never logged or persisted.
- **Constant-Time Comparison**: Token verifications use `crypto.timingSafeEqual` to defeat timing attacks.
- **Anti-Impersonation**: If a client provides a guest ID, it must match the token's authenticated owner or face immediate rejection.
- **Concealed Game State**: Draw pile card sequences and opponents' cards are never exposed over the network.
- **Server Authoritative Validation**: Client card plays and draws are strictly validated before state transitions are applied.
