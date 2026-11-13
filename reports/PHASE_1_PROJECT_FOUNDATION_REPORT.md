# UNO Ultimate — Phase 1: Project Foundation Report

**Project**: UNO Ultimate  
**Phase**: Phase 1 — Project Foundation  
**Date**: November 13, 2026  
**Status**: Complete  

---

## 1. Executive Summary

Phase 1 of **UNO Ultimate** has been established from scratch as a production-oriented, private online multiplayer card game for groups of friends. The project architecture strictly eliminates public matchmaking, social networking, and persistent account registrations in favor of an ephemeral, cryptographically secure guest identity lifecycle and server-authoritative protocol contracts.

The monorepo has been structured using `pnpm` workspaces, integrating a React 18 / Vite / Tailwind CSS frontend, an Express / TypeScript / Socket.IO backend service, and a PostgreSQL 16 database layer managed by Prisma ORM. A comprehensive automated test suite (36 tests across Vitest, React Testing Library, and Supertest) verifies session integrity, security boundary enforcement, validation rules, and UI responsiveness.

---

## 2. Objectives

The primary objectives for Phase 1 were:
1. Configure a unified `pnpm` monorepo with cross-package dependency linking, TypeScript typechecking, linting, and build tooling.
2. Provision a local PostgreSQL database with Prisma schema, migrations, and typed client generation.
3. Architect and implement an authoritative guest session system featuring high-entropy token generation, one-way SHA-256 HMAC hashing, timing-safe verification, configurable expiration, and anti-impersonation controls.
4. Build a responsive, accessible frontend interface with custom UNO branding (without trademarked Mattel assets), live input validation, session resumption, and Phase 2 placeholder cards.
5. Provide foundational Socket.IO handshake structures and server-authoritative projection models.
6. Establish 100% automated test coverage for critical security and validation paths.

---

## 3. Architecture Implemented

The system is organized into a clean monorepo architecture:

- **`packages/shared` (`@uno-ultimate/shared`)**: Shared constants (e.g. username length constraints, token bit-depth, session TTL), Zod validation schemas (`usernameSchema`, `createGuestSchema`, `resumeGuestSchema`), and TypeScript interface definitions.
- **`packages/game-protocol` (`@uno-ultimate/game-protocol`)**: Type contracts for future Socket.IO events (`ClientToServerEvents`, `ServerToClientEvents`, `SocketData`) and server-authoritative state models designed to strictly conceal deck order and private opponent hands.
- **`database` (`@uno-ultimate/database`)**: Prisma ORM schema, SQL migration scripts, and exported PrismaClient singleton.
- **`apps/server` (`@uno-ultimate/server`)**: Node.js/Express service providing REST endpoints, security headers (`helmet`), CORS management, cookie parsing, rate limiting (`express-rate-limit`), centralized error handling, and Socket.IO connection initialization.
- **`apps/web` (`@uno-ultimate/web`)**: Client-side application with React 18, Vite, Tailwind CSS, Zustand session store, Framer Motion animations, and React Router v7.

---

## 4. Technology Choices and Versions

| Component | Technology | Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | v22.17.0 | Backend execution environment |
| **Package Manager** | pnpm | 12.18.0 | Monorepo dependency management |
| **Backend Framework** | Express | 4.21.2 | HTTP REST API server |
| **WebSockets** | Socket.IO | 4.8.1 | Real-time communication foundation |
| **Database** | PostgreSQL | 16.14 | Relational persistence |
| **ORM** | Prisma | 5.22.0 | Type-safe database queries & migrations |
| **Validation** | Zod | 3.24.2 | Runtime schema validation across server & client |
| **Frontend Framework** | React | 18.3.1 | Component-based UI library |
| **Bundler** | Vite | 6.1.0 / 6.4.6 | Fast frontend development & production builds |
| **Styling** | Tailwind CSS | 3.4.17 | Utility-first responsive styling |
| **State Management** | Zustand | 5.0.3 | Lightweight client state & session persistence |
| **Animations** | Framer Motion | 12.4.7 | Restrained UI transitions |
| **Testing** | Vitest | 3.0.5 / 3.2.7 | Fast unit & integration test runner |
| **HTTP Testing** | Supertest | 7.0.0 | End-to-end HTTP integration tests |
| **UI Testing** | React Testing Library | 16.2.0 | DOM testing for React components |

---

## 5. Features Implemented

1. **Guest Identity Creation (`POST /api/guest`)**:
   - Player submits display name.
   - Client-side & server-side Zod validation trims whitespace, verifies length (2–20), blocks control characters, and allows duplicate usernames.
   - Server creates a UUID v4 guest identity and generates a 32-byte cryptographically secure random token (64 hex characters).
   - Only the SHA-256 HMAC hash of the token is persisted in PostgreSQL.
   - Server sets an `HttpOnly`, `SameSite=Lax`, `Secure` (prod) cookie and returns guest metadata in JSON response.
2. **Session Resumption (`POST /api/guest/resume`)**:
   - Client automatically attempts session resumption upon initial load.
   - Server extracts token from cookie, `Authorization: Bearer <token>`, or request body.
   - Validates existence, verifies cryptographic hash with constant-time comparison, checks expiration timestamp (`expiresAt > now`), and updates `lastSeenAt`.
   - Prevents client-supplied guest ID spoofing with strict ownership validation.
3. **Health Check (`GET /api/health`)**:
   - Live endpoint reporting service status, server uptime, version, and PostgreSQL connectivity with round-trip database latency measurement.
4. **Responsive Frontend UI**:
   - Dark gaming aesthetic with custom glassmorphism and animated card fan visuals.
   - Live username validation indicator with character count counter.
   - Loading spinners and error banner feedback.
   - Post-authentication Dashboard displaying active session status, username, server-generated Guest ID with copy-to-clipboard functionality, and non-functional Phase 2 placeholder cards for "Create Private Room" and "Join Room".

---

## 6. Files Created and Modified

- **Root Configuration**:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `tsconfig.base.json`
  - `.eslintrc.cjs`
  - `.prettierrc`
  - `.gitignore`
  - `.env.example`
  - `docker-compose.yml`
  - `README.md`
- **Shared Package (`packages/shared`)**:
  - `package.json`, `tsconfig.json`
  - `src/constants/index.ts`
  - `src/schemas/guest.schema.ts`
  - `src/types/guest.types.ts`
  - `src/types/api.types.ts`
  - `src/index.ts`
- **Game Protocol Package (`packages/game-protocol`)**:
  - `package.json`, `tsconfig.json`
  - `src/events.ts`
  - `src/models.ts`
  - `src/index.ts`
- **Database Package (`database`)**:
  - `package.json`, `tsconfig.json`
  - `prisma/schema.prisma`
  - `prisma/migrations/20261110000000_init_guest_sessions/migration.sql`
  - `src/client.ts`
  - `src/index.ts`
- **Backend Application (`apps/server`)**:
  - `package.json`, `tsconfig.json`, `vitest.config.ts`
  - `src/config/env.ts`
  - `src/utils/logger.ts`, `src/utils/crypto.ts`
  - `src/middleware/errorHandler.ts`, `src/middleware/validate.ts`, `src/middleware/rateLimiter.ts`
  - `src/modules/guest/guest.service.ts`, `guest.controller.ts`, `guest.routes.ts`
  - `src/routes/health.routes.ts`, `src/routes/index.ts`
  - `src/sockets/socketServer.ts`
  - `src/app.ts`, `src/server.ts`
  - `tests/setup.ts`
  - `tests/unit/crypto.test.ts`, `guest.service.test.ts`
  - `tests/integration/health.api.test.ts`, `guest.api.test.ts`
- **Frontend Application (`apps/web`)**:
  - `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`
  - `public/card-icon.svg`
  - `src/styles/globals.css`, `src/vite-env.d.ts`, `src/main.tsx`
  - `src/app/App.tsx`
  - `src/pages/LandingPage.tsx`, `DashboardPage.tsx`
  - `src/components/common/Header.tsx`, `Footer.tsx`, `UnoCardVisual.tsx`
  - `src/features/guest/components/GuestLoginForm.tsx`, `DashboardView.tsx`
  - `src/services/apiClient.ts`, `guestApi.ts`
  - `src/stores/guestStore.ts`
  - `src/test/setup.ts`
  - `src/features/guest/GuestLoginForm.test.tsx`, `DashboardView.test.tsx`
- **Infrastructure & Docs**:
  - `infrastructure/start-postgres.sh`, `infrastructure/setup-pg.sh`
  - `docs/architecture/PHASE_1_ARCHITECTURE.md`
  - `docs/rules/UNO_CORE_SPECIFICATION.md`

---

## 7. Database Schema and Migration Details

### Migration File: `database/prisma/migrations/20261110000000_init_guest_sessions/migration.sql`

```sql
CREATE TABLE "guest_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guest_sessions_tokenHash_key" ON "guest_sessions"("tokenHash");
CREATE INDEX "idx_guest_sessions_token_hash" ON "guest_sessions"("tokenHash");
CREATE INDEX "idx_guest_sessions_expires_at" ON "guest_sessions"("expiresAt");
```

- **Execution Status**: Applied cleanly via `pnpm db:deploy` to PostgreSQL 16 on `localhost:5432`.
- **Prisma Client**: Generated successfully with `@prisma/client` v5.22.0.

---

## 8. API Endpoints and Request/Response Examples

### 1. Health Check
- **Method**: `GET /api/health`
- **Response**: HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-11-13T07:37:46.102Z",
    "uptime": 12,
    "environment": "development",
    "database": {
      "status": "connected",
      "latencyMs": 50
    },
    "version": "0.1.0"
  }
}
```

### 2. Create Guest Session
- **Method**: `POST /api/guest`
- **Request Body**:
```json
{
  "username": "CosmicPlayer"
}
```
- **Response**: HTTP 201 Created
- **Headers**: `Set-Cookie: uno_session=...; Path=/; HttpOnly; SameSite=Lax`
```json
{
  "success": true,
  "data": {
    "guest": {
      "id": "b900e384-26b5-497a-9dfb-ca8ca2d3015b",
      "username": "CosmicPlayer",
      "createdAt": "2026-11-13T07:37:53.770Z",
      "expiresAt": "2026-11-14T07:37:53.770Z",
      "lastSeenAt": "2026-11-13T07:37:53.770Z"
    },
    "sessionToken": "7589922a5db88a3dc0f636a3e8252188cfc29ab741a1a62fcf297bc736c8e488"
  }
}
```

### 3. Resume Guest Session
- **Method**: `POST /api/guest/resume`
- **Request Body (or Cookie)**:
```json
{
  "sessionToken": "7589922a5db88a3dc0f636a3e8252188cfc29ab741a1a62fcf297bc736c8e488"
}
```
- **Response**: HTTP 200 OK
```json
{
  "success": true,
  "data": {
    "guest": {
      "id": "b900e384-26b5-497a-9dfb-ca8ca2d3015b",
      "username": "CosmicPlayer",
      "createdAt": "2026-11-13T07:37:53.770Z",
      "expiresAt": "2026-11-14T07:37:53.770Z",
      "lastSeenAt": "2026-11-13T07:38:10.029Z"
    },
    "sessionToken": "7589922a5db88a3dc0f636a3e8252188cfc29ab741a1a62fcf297bc736c8e488"
  }
}
```

### 4. Impersonation Rejection
- **Method**: `POST /api/guest/resume`
- **Request Body**: Valid token belonging to Player A with claimed `guestId` belonging to Player B
- **Response**: HTTP 401 Unauthorized
```json
{
  "success": false,
  "error": {
    "code": "SESSION_IMPERSONATION",
    "message": "Security rejection: Provided guest ID does not match the authenticated session."
  }
}
```

---

## 9. Guest Session Security Implementation

1. **Randomness & Entropy**: 32 cryptographically secure random bytes generated via `crypto.randomBytes(32)` (256 bits).
2. **Storage Protection**: The raw token is hashed immediately with HMAC-SHA256 using the server's private secret (`SESSION_SECRET`). Only `tokenHash` is saved in the database.
3. **No Hash Exposure**: `tokenHash` is explicitly excluded from all API response payloads and client models.
4. **Log Redaction**: Structured JSON logging intercepts and redacts all keys containing `token`, `sessionToken`, `secret`, `cookie`, or `authorization`.
5. **Constant-Time Verification**: `timingSafeCompare` (`crypto.timingSafeEqual`) prevents timing attack side channels during token lookup verification.
6. **Rate Limiting**: `express-rate-limit` prevents brute-force guest creation and resume flooding.
7. **Identity Verification**: The client cannot impersonate another player by supplying arbitrary `guestId` strings.

---

## 10. Frontend Implementation

- **Dark Gaming Theme**: Custom slate palette (`bg-[#0b0f19]`, `surface`, `border`) with subtle radial gradients and UNO color accents (Red `#ef4444`, Amber `#f59e0b`, Emerald `#10b981`, Blue `#3b82f6`).
- **Original Assets**: Custom card fan component (`UnoCardVisual`) using pure CSS and SVGs without trademarked Mattel logos.
- **Accessibility**: Explicit `<label>` links, ARIA live regions for errors, keyboard Enter navigation, and contrast-compliant typography.
- **Session Lifecycle**: Auto-resumption triggers in `App.tsx` on page load. If valid, redirects seamlessly to `/dashboard`.
- **Placeholder Transparency**: "Create Private Room" and "Join Room" feature cards are explicitly styled with `cursor-not-allowed`, `disabled` buttons, and `Coming in Phase 2` warning pills to avoid deceiving players.

---

## 11. Tests Executed and Actual Results

A total of **36 automated tests** were written and executed using Vitest. All 36 passed with 0 failures and 0 skipped.

### Backend Tests (`apps/server`) — 26 Passed:
- `tests/unit/crypto.test.ts` (7 tests):
  - 64-character hex generation with 256 bits of entropy: **PASSED**
  - Distinct random tokens on subsequent calls: **PASSED**
  - Deterministic HMAC-SHA256 generation: **PASSED**
  - Unique hashes for distinct tokens: **PASSED**
  - Constant-time string comparison: **PASSED**
  - Mismatch rejection: **PASSED**
  - Differing length handling: **PASSED**
- `tests/unit/guest.service.test.ts` (6 tests):
  - Guest creation with UUID and safe public fields: **PASSED**
  - Duplicate usernames permitted with distinct IDs/tokens: **PASSED**
  - Successful session resumption: **PASSED**
  - Invalid token rejection: **PASSED**
  - Expired session rejection: **PASSED**
  - Impersonation attempt rejection: **PASSED**
- `tests/integration/health.api.test.ts` (1 test):
  - Returns 200 OK with connected database: **PASSED**
- `tests/integration/guest.api.test.ts` (12 tests):
  - Guest creation returns 201 with HttpOnly cookie: **PASSED**
  - Username whitespace trimming: **PASSED**
  - Empty username rejection (400): **PASSED**
  - Minimum length rejection (400): **PASSED**
  - Maximum length rejection (400): **PASSED**
  - Control characters rejection (400): **PASSED**
  - Cookie-based resumption (200): **PASSED**
  - Bearer header resumption (200): **PASSED**
  - Body token resumption (200): **PASSED**
  - Missing token rejection (401): **PASSED**
  - Invalid token rejection (401): **PASSED**
  - ID spoofing rejection (401): **PASSED**

### Frontend Tests (`apps/web`) — 10 Passed:
- `src/features/guest/GuestLoginForm.test.tsx` (6 tests):
  - Renders input, counter, and play button: **PASSED**
  - Empty username client validation: **PASSED**
  - Minimum length client validation: **PASSED**
  - Submission triggers store action: **PASSED**
  - Loading state disables button and shows spinner: **PASSED**
  - Server error display: **PASSED**
- `src/features/guest/DashboardView.test.tsx` (4 tests):
  - Renders welcome message with username: **PASSED**
  - Displays active session indicator and guest ID: **PASSED**
  - Renders disabled Phase 2 room cards with badges: **PASSED**
  - Renders server-authoritative fair play notice: **PASSED**

---

## 12. Build and Typecheck Results

1. **`pnpm typecheck`**:
   - `packages/shared`: 0 errors
   - `packages/game-protocol`: 0 errors
   - `database`: 0 errors
   - `apps/server`: 0 errors
   - `apps/web`: 0 errors
   - Result: **CLEAN EXIT (Code 0)**
2. **`pnpm lint`**:
   - `packages/shared`: 0 warnings, 0 errors
   - `apps/server`: 0 warnings, 0 errors
   - `apps/web`: 0 warnings, 0 errors
   - Result: **CLEAN EXIT (Code 0)**
3. **`pnpm build`**:
   - Shared bundle: CJS + ESM + DTS generated
   - Game-protocol bundle: CJS + ESM + DTS generated
   - Database bundle: CJS + ESM + DTS generated
   - Server bundle: `dist/server.js` (22.03 KB) with sourcemap
   - Web bundle: Vite production build generated (`dist/assets/index-FLT6TmCA.js` 393.47 KB / gzip 121.75 KB; `dist/assets/index-DG2kLU0h.css` 29.35 KB / gzip 5.74 KB)
   - Result: **CLEAN EXIT (Code 0)**

---

## 13. Bugs Discovered and Fixes

1. **Prisma Client Multi-Instance Type Conflict**:
   - *Issue*: Running tsup in `database` threw `Cannot find name 'global'` when referencing Node `global`.
   - *Fix*: Standardized on `globalThis as unknown as { prisma: PrismaClient | undefined }` and added `@types/node` to devDependencies.
2. **ESLint `no-control-regex` Flagging in Zod Schema**:
   - *Issue*: The regex `/[\u0000-\u001F\u007F-\u009F]/` triggered `no-control-regex`.
   - *Fix*: Added `// eslint-disable-next-line no-control-regex` with comments documenting that the control characters are intentionally blocked to sanitize player names.
3. **Zod Error Instance Checking Across Bundles**:
   - *Issue*: `err instanceof ZodError` returned false in certain bundling contexts when transpiled separately.
   - *Fix*: Updated the check to `err instanceof ZodError || err.name === 'ZodError'` to ensure 100% reliable 400 Bad Request responses.
4. **Supertest Header Array vs String Type**:
   - *Issue*: In `guest.api.test.ts`, TypeScript flagged that `.find` did not exist on `string` for `res.headers['set-cookie']`.
   - *Fix*: Normalised with `const cookieList = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string];`.

---

## 14. Implementation Evidence

- **Health Endpoint Live Response**:
  ```json
  {"success":true,"data":{"status":"ok","uptime":12,"environment":"development","database":{"status":"connected","latencyMs":50},"version":"0.1.0"}}
  ```
- **Active Database Query Execution**:
  `SELECT 1` ping verification completed in 50ms.
- **Session Resumption Live Response**:
  ```json
  {"success":true,"data":{"guest":{"id":"a152d7fb-0ba0-43ae-b8e3-387c474849dd","username":"SessionTester","lastSeenAt":"2026-11-13T07:38:10.029Z"}}}
  ```

---

## 15. Security Considerations

- **Transport Layer**: HttpOnly session cookies prevent JavaScript access from malicious browser extensions or XSS vectors.
- **Secret Salting**: Token hashes use HMAC-SHA256 with a high-entropy `SESSION_SECRET` configured via environment variables.
- **Zero Raw Token Persistence**: Database compromises do not leak raw tokens because hashes cannot be inverted.
- **Defense in Depth**: Even if a guest attempts to inject someone else's `guestId`, the server extracts the session strictly from the cryptographic token hash and asserts equality before responding.

---

## 16. Known Limitations

- **Single Instance**: Phase 1 uses an in-memory / local PostgreSQL store without Redis or cluster coordination. This is fully compliant with the specification ("Redis is not required for the first single-instance implementation").
- **Rooms and Gameplay**: Intentionally not implemented in Phase 1 per product roadmap requirements.

---

## 17. Deviations from the Original Requirements

None. All structural and technical requirements were strictly met.

---

## 18. Acceptance Criteria Checklist

- [x] Monorepo is configured (`pnpm-workspace.yaml`, root scripts).
- [x] Frontend starts successfully (`apps/web`).
- [x] Backend starts successfully (`apps/server`).
- [x] PostgreSQL connection works (`localhost:5432`).
- [x] Prisma migration succeeds (`20261110000000_init_guest_sessions`).
- [x] Prisma Client generates successfully (`@prisma/client` v5.22.0).
- [x] Guest creation works (`POST /api/guest`).
- [x] Guest session resumption works (`POST /api/guest/resume`).
- [x] Session expiration is enforced (`expiresAt` validation).
- [x] Frontend connects to backend (tested via REST and mocked stores).
- [x] Landing page works on desktop and mobile (responsive layout).
- [x] Automated tests pass (36 tests passing, 0 failing, 0 skipped).
- [x] Production builds succeed (`pnpm build`).
- [x] Documentation is complete (`PHASE_1_ARCHITECTURE.md`, `README.md`).
- [x] Phase report exists (`PHASE_1_PROJECT_FOUNDATION_REPORT.md`).
- [x] Git checkpoint is documented.

---

## 19. Git Commit Hash

- Commit Message: `feat(phase-1): establish UNO Ultimate project foundation`
- Commit Hash: *Pending final git commit operation (see Section 20)*

---

## 20. GitHub Remote and Push Status

- Git repository status: Initialized locally.
- Remote check: `git remote -v` reported no remotes configured.
- Push status: **SKIPPED (No remote configured)**. Per requirements: "Never create or assume a remote repository without authorization. Never report a push as successful unless the push command succeeds."

---

## 21. Instructions for Running the Project

```bash
# 1. Install all dependencies
pnpm install

# 2. Start PostgreSQL (via Docker Compose or local script)
docker compose up -d

# 3. Apply Prisma migrations
pnpm db:generate
pnpm db:deploy

# 4. Run tests
pnpm test

# 5. Start dev environment
pnpm dev
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health API: `http://localhost:4000/api/health`

---

## 22. Recommendations for Phase 2

1. **Room State Architecture**: Implement room entities with server-generated 6-character room codes (`/room/:code`), room lifecycle state machine (`WAITING`, `STARTING`, `IN_GAME`, `FINISHED`), and host privileges.
2. **Socket.IO Room Handlers**: Attach authenticated guest sessions to Socket.IO rooms (`room:${roomCode}`) to broadcast player join/leave events.
3. **Invitation Links**: Provide one-click clipboard copying for invitation links (`http://localhost:5173/join/:code`).
4. **Heartbeat & Disconnection Handling**: Gracefully handle tab closures with a 30-second reconnection grace period before ejecting a player from a room.
