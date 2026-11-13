# UNO Ultimate — Phase 5: Variant Architecture & Complete UNO Flip Implementation

UNO Ultimate is an online, private multiplayer card game crafted specifically for groups of friends. It does not provide public matchmaking, open player lobbies, or social networking features.

Phase 5 establishes an extensible, decoupled **Variant Architecture** and implements the first official variant: **UNO Flip!**, strictly following the official **Mattel UNO Flip GDR44** rules sheet (English and Spanish editions), while maintaining 100% backward compatibility and test stability for **Classic UNO** (Mattel 42001).

---

## Tech Stack

- **Game Engine**: Pure TypeScript, transport-agnostic, zero-IO, extensible variant registry, deterministic PRNGs (`@uno-ultimate/game-engine`)
- **Protocol**: Shared Zod schemas, socket contracts, typed payloads, 8-color model, and projections (`@uno-ultimate/game-protocol`)
- **Frontend**: React 18, Vite, TypeScript, Tailwind CSS, React Router v7, Zustand, Socket.IO Client, Framer Motion, Howler.js, Zod (`@uno-ultimate/web`)
- **Backend**: Node.js, Express, TypeScript, Socket.IO, Zod validation, Helmet, CORS, Cookie-Parser, Express-Rate-Limit (`@uno-ultimate/server`)
- **Database**: PostgreSQL 16, Prisma ORM (`@uno-ultimate/database`)
- **Monorepo**: pnpm workspaces
- **Testing**: Vitest, React Testing Library, Supertest, Playwright E2E (comprehensive unit, socket integration, and browser E2E test suites)

---

## Core Features (Phases 1 through 5)

- **Zero Sign-Up Guest Identity**: Instant play with a username. Server-generated UUID guest ID and temporary session token with HttpOnly cookie support and resumption validation.
- **Private Room Creation & Variant Selection**: Host can choose between Classic UNO and UNO Flip during room creation, or toggle before match start.
- **Direct Invitation Links**: Shareable `/join/:roomCode` URLs with pre-flight metadata checks.
- **Real-Time Lobby Presence**: Live member lists, player avatar badges, variant indicator badge (`108 CARDS` vs `112 DUAL-SIDED CARDS`), online/reconnecting indicators, and optimistic state versioning.
- **Deterministic Host Transfer**: Seamless host handover to the earliest eligible member (`joinedAt ASC`) if the host disconnects or leaves.
- **Extensible Variant Architecture (`@uno-ultimate/game-engine`)**:
  - `GameVariantAdapter` interface isolating rules, deck factory, dealer selection, starting cards, moves, actions, and scoring.
  - `VariantRegistry` supporting runtime variant resolution (`classic` and `uno_flip`).
- **Complete Playable UNO Flip! (Mattel GDR44)**:
  - **Authoritative 112 Double-Sided Deck**: Physical card model where every card preserves identity and dual faces (`lightFace` and `darkFace`).
  - **Reconciled Inventory**: Adopts 8 Flip cards per side (2 per color) to resolve the English manual arithmetic discrepancy and match the 112-card total affirmed by the Spanish edition.
  - **Light Side Mechanics**: Red, Yellow, Green, Blue. Draw One (+1), Reverse, Skip, Flip, Wild, Wild Draw Two (+2, challengeable).
  - **Dark Side Mechanics**: Pink, Teal, Orange, Purple. Draw Five (+5), Reverse, Skip Everyone, Flip, Wild, Wild Draw Color (draws until chosen color, challengeable, infinite-draw safe).
  - **Atomic Flip Transition Protocol**: Flips active side, inverts and flips discard pile (placing played Flip card at bottom, underneath card becomes new top discard on opposite face), flips draw pile, and flips all hands in real time.
  - **Mattel GDR44 Dealer Selection**: Highest number 1–9 on Light side deals, symbol cards count as 0, candidate redraws, safety ceiling of 20 rounds with lowest-seat fallback.
  - **Mattel GDR44 Opening Starting Cards**: Reverse causes dealer to play first counter-clockwise; Flip immediately flips deck to Dark side; Draw One causes victim to draw 1 and lose turn; Wild Draw Two returned and reshuffled.
  - **Mattel GDR44 Missed UNO Penalty**: 2 cards (differs from Classic UNO's 4-card rule).
  - **Side-Specific Scoring to 500 Points**: Light Side face values / 20 action / 50 wild; Dark Side face values / 20 action / 50 wild / 60 Wild Draw Color. First to 500 points wins match.
- **Playable Classic UNO (Mattel 42001)**:
  - Preserved 108-card single-sided deck, 4-card missed UNO penalty, Wild Draw Four challenge lifecycle, and classic scoring.
- **Multi-Context Browser E2E Testing**:
  - Automated Playwright test suites (`multiplayer-game.spec.ts` and `uno-flip-game.spec.ts`) validating 2-player multi-browser context matches across both variants.

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
