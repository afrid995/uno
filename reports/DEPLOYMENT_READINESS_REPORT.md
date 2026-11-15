# UNO ULTIMATE — PRODUCTION DEPLOYMENT READINESS & FRIENDS PLAYTEST REPORT

**Project:** UNO Ultimate — Private Online Multiplayer Card Game for Friends  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Target Infrastructure:**  
- **Frontend:** Vercel (Vite + React SPA)
- **Backend:** Render (Persistent Node.js + Socket.IO Web Service)
- **Database:** Managed PostgreSQL 16 (Render Managed Database or Supabase / Neon)
- **ORM:** Prisma 5.22.0

---

## 1. Executive Summary & Architecture Assessment

UNO Ultimate has completed seven fully playable, server-authoritative UNO variants:
1. Classic UNO
2. UNO Flip
3. UNO Show 'em No Mercy
4. UNO All Wild
5. UNO Flex
6. UNO Teams
7. UNO Attack

Before this readiness phase, the application was functional in local development with Vite dev-server proxying (`localhost:5173` proxying to `localhost:4000`), but contained several critical architectural blockers that would have caused immediate runtime failure when deployed across separate cloud domains (Vercel frontend + Render backend).

All identified deployment blockers have been systematically resolved:
1. **Frontend-to-Backend Remote Communication:** Frontend API and Socket.IO clients now dynamically resolve production URLs via environment variables (`VITE_API_URL` and `VITE_WS_URL`) with WebSocket preference (`transports: ['websocket', 'polling']`).
2. **SPA Routing on Vercel:** Added `vercel.json` rewrite configurations preventing 404 errors when players directly access `/room/:roomCode`, `/game/:roomCode`, or invitation links `/join/:roomCode`.
3. **Cross-Origin & Cross-Site Authentication:** Configured CORS dynamically to support production domains, preview deployments, and local development. Updated session cookie attributes in production to `sameSite: 'none'` with `secure: true`, accompanied by redundant Bearer token headers and Socket.IO handshake auth payloads to ensure bulletproof guest session persistence across third-party-cookie-restricted browsers.
4. **Reverse-Proxy IP Resolution:** Enabled Express `trust proxy` so client IP addresses resolve accurately behind Render's load balancers, preventing rate-limiter false positives.
5. **Infrastructure as Code:** Created `render.yaml` blueprint defining the persistent Node.js web service, managed PostgreSQL 16 database, automated Prisma migrations (`pnpm db:deploy`), and zero-trust secret generation.

---

## 2. Deployment Blockers Identified & Resolved

| # | Component | Identified Blocker | Severity | Resolution Implemented |
|---|---|---|---|---|
| 1 | **Socket.IO Client** | `socketClient.ts` called `io({ path: '/socket.io' })` without a target URL. On Vercel, the browser attempted to connect WebSockets to Vercel's edge CDN (`https://*.vercel.app/socket.io`), failing instantly. | **BLOCKER** | Configured `socketClient.ts` to connect to `VITE_WS_URL || VITE_API_URL`, supporting direct cross-domain WebSocket connection with `transports: ['websocket', 'polling']`. |
| 2 | **SPA Routing** | Directly navigating to or refreshing `/join/:roomCode`, `/room/:roomCode`, or `/game/:roomCode` on Vercel returned 404 Not Found. | **BLOCKER** | Added `vercel.json` rewrites (`/(.*) -> /index.html`) in both `apps/web/vercel.json` and root `vercel.json`. |
| 3 | **CORS Configuration** | Backend only permitted a single exact string match for `CORS_ORIGIN`, failing if multiple domains, Vercel preview URLs, or trailing slashes were provided. | **HIGH** | Implemented `apps/server/src/utils/cors.ts` supporting comma-separated origins, wildcard patterns (`https://*.vercel.app`), and trailing-slash normalization. |
| 4 | **Cross-Site Cookies** | `sameSite: 'strict'` was set in production. Modern browsers reject cross-site cookies between `vercel.app` and `onrender.com`. | **HIGH** | Set `sameSite: 'none'` and `secure: true` in production in `guest.controller.ts`, backed by `Authorization: Bearer <token>` and `socket.auth.token` dual-auth redundancy. |
| 5 | **Reverse Proxy IP** | Express did not trust proxy headers. Under Render's reverse proxy, all clients would share Render's internal proxy IP, causing rate-limiting false positives. | **MEDIUM** | Configured `app.set('trust proxy', 1)` in `apps/server/src/app.ts`. |
| 6 | **Deployment Blueprint** | No automated Render configuration existed, requiring manual point-and-click setup prone to missed env vars. | **MEDIUM** | Created root `render.yaml` blueprint automating Node.js service, PostgreSQL 16 database, build/start commands, and cryptographic secret generation. |

---

## 3. Files Modified & Created

### Created Configuration Files
- `render.yaml`: Render Blueprint for persistent Node.js service, PostgreSQL 16 database, build commands, and health checks.
- `vercel.json`: Root Vercel SPA rewrite fallback configuration.
- `apps/web/vercel.json`: Scoped Vercel SPA rewrite fallback configuration.
- `apps/server/.env.example`: Scoped server environment template.
- `apps/web/.env.example`: Scoped frontend environment template.
- `apps/server/src/utils/cors.ts`: Dynamic CORS parser and wildcard pattern matcher.
- `apps/server/tests/unit/cors.test.ts`: Unit test suite verifying exact matches, wildcards, and non-browser origins.

### Modified Source Files
- `.env.example`: Comprehensive environment configuration template covering local dev and production hosting.
- `.gitignore`: Hardened `.env*` exclusion patterns preventing accidental credential exposure.
- `package.json`: Added `build:server`, `build:web`, and `start:server` monorepo scripts.
- `apps/server/src/app.ts`: Added `trust proxy`, dynamic CORS middleware, and root `/healthz` endpoint.
- `apps/server/src/sockets/socketServer.ts`: Connected dynamic CORS origin validator to Socket.IO.
- `apps/server/src/modules/guest/guest.controller.ts`: Configured production cookie flags (`sameSite: 'none'`, `secure: true`).
- `apps/server/vitest.config.ts`: Configured sequential vitest execution (`sequence: { concurrent: false }`) preventing DB test race conditions.
- `apps/web/src/services/apiClient.ts`: Added trailing-slash sanitization to `API_BASE`.
- `apps/web/src/services/socketClient.ts`: Added remote server URL resolution and WebSocket transport preference.
- `apps/web/src/vite-env.d.ts`: Added TypeScript definition for `VITE_WS_URL`.

---

## 4. Environment Variables Reference

### Backend (Render Web Service)

| Variable | Required | Description | Example / Default |
|---|:---:|---|---|
| `NODE_ENV` | Yes | Runtime environment | `production` |
| `PORT` | Yes | Port to listen on (Render automatically provides `10000`) | `10000` |
| `CORS_ORIGIN` | Yes | Allowed frontend origins (supports comma-separated & wildcards) | `https://uno-ultimate.vercel.app,https://*.vercel.app` |
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-linked from Render DB) | `postgresql://uno_admin:...@dpg-.../uno_ultimate` |
| `SESSION_SECRET` | Yes | Cryptographic secret for session token HMAC (min 32 chars) | Generated by Render (`generateValue: true`) |
| `COOKIE_SECRET` | Yes | Cryptographic secret for signed cookies | Generated by Render (`generateValue: true`) |
| `COOKIE_NAME` | No | Session cookie name | `uno_session` |
| `SESSION_EXPIRATION_HOURS` | No | Guest session lifetime | `24` |
| `RATE_LIMIT_WINDOW_MS` | No | Rate limit sliding window in ms | `60000` |
| `RATE_LIMIT_MAX_GUEST` | No | Max guest identity requests per IP per window | `120` |
| `ENABLE_TEST_HELPERS` | No | Strictly disabled in production | `false` |

### Frontend (Vercel Project)

| Variable | Required | Description | Example |
|---|:---:|---|---|
| `VITE_API_URL` | Yes | Full URL of the Render backend web service | `https://uno-ultimate-server.onrender.com` |
| `VITE_WS_URL` | No | Full WebSocket URL (defaults to `VITE_API_URL` if omitted) | `https://uno-ultimate-server.onrender.com` |

---

## 5. Verification & Quality Gates

All quality gates passed cleanly with zero errors:

1. **Monorepo Build (`pnpm build`):**
   - `@uno-ultimate/shared`: Built successfully (`dist/index.js`, `dist/index.mjs`, types).
   - `@uno-ultimate/game-engine`: Built successfully.
   - `@uno-ultimate/game-protocol`: Built successfully.
   - `@uno-ultimate/database`: Built successfully with Prisma client.
   - `@uno-ultimate/server`: Built successfully with `tsup` (`dist/server.js`).
   - `@uno-ultimate/web`: Built successfully with `tsc` and `vite` (`dist/`).
2. **Typecheck (`pnpm -r typecheck`):**
   - 0 errors across all 6 workspace packages.
3. **Lint (`pnpm -r lint`):**
   - 0 errors across all packages.
4. **Unit & Integration Tests (`pnpm -r test`):**
   - `@uno-ultimate/game-engine`: 28 test files, 361 tests passed.
   - `@uno-ultimate/server`: 17 test files, 113 tests passed (+6 CORS tests).
   - `@uno-ultimate/web`: 22 test files, 98 tests passed.
   - **Total Unit & Integration Tests:** **67 test files, 572 tests passed (100%)**.
5. **Playwright E2E Tests (`pnpm --filter @uno-ultimate/web test:e2e`):**
   - **9 passed (100%) in 1.6m** across all 7 variants:
     - Classic UNO 2-player match lifecycle & recovery
     - Classic UNO direct invitation link join flow
     - UNO All Wild 112-card match & Targeted Draw Two
     - UNO Attack 112-card match, Virtual Launcher & conservation invariant
     - UNO Flex 112-card match, 8 Power Cards & Flex actions
     - UNO Flip Dark/Light sides & transitions
     - UNO Flip starting Wild color picker flow
     - UNO Show 'em No Mercy 168-card match, Stacking & Mercy rule
     - UNO Teams 4-player match, team pass & team victory

---

## 6. Security Considerations & Compliance

- **No Committed Secrets:** Verified that no `.env` files, database passwords, or session tokens exist in git tracking. `.gitignore` strictly excludes all `.env*` files across all monorepo paths while preserving `.env.example`.
- **Zero-Trust Guest Identity:** Username-only guest identity is preserved. Guest sessions are identified by cryptographically random 256-bit hexadecimal tokens hashed via SHA-256 HMAC on the server. Mismatched or forged guest IDs are rejected with security alerts.
- **Private Rooms Only:** Public matchmaking is strictly absent. Rooms are only accessible via unambiguous 6-character room codes or cryptographically verified invitation links.
- **Production Test Shield:** Test helper endpoints (`/api/test`) are disabled in production (`process.env.NODE_ENV === 'production'`). Even in development, they require explicit opt-in and timing-safe secret validation.

---

## 7. Step-by-Step Manual Deployment Walkthrough

To make UNO Ultimate accessible online to friends, follow these exact manual steps using your own accounts:

### Step 1: Push Repository to GitHub
Ensure the latest `main` branch with the deployment configuration is pushed to your GitHub repository:
```bash
git push origin main
```

---

### Step 2: Deploy Backend & Database on Render
1. Log in to [Render](https://dashboard.render.com/).
2. Click **New +** $\to$ **Blueprint**.
3. Connect your GitHub repository: `https://github.com/afrid995/uno`.
4. Render will detect `render.yaml` and display two resources to create:
   - **Database:** `uno-ultimate-db` (Managed PostgreSQL 16)
   - **Web Service:** `uno-ultimate-server` (Persistent Node.js Service)
5. Under Environment Variables for `uno-ultimate-server`, find `CORS_ORIGIN` (marked `sync: false`). For now, leave it or enter a placeholder (e.g. `http://localhost:5173`). We will update it with your real Vercel domain in Step 4.
6. Click **Apply**.
7. Render will automatically:
   - Provision the PostgreSQL database.
   - Run `pnpm install --frozen-lockfile`.
   - Build all workspace packages (`pnpm --filter @uno-ultimate/server... build`).
   - Run database migrations (`pnpm db:deploy`).
   - Start the server on `0.0.0.0:$PORT`.
8. Once the web service is deployed, copy its public URL:  
   `https://uno-ultimate-server-xxxx.onrender.com`
9. Verify the health check by opening `https://uno-ultimate-server-xxxx.onrender.com/api/health` in your browser. It should return:
   ```json
   {
     "success": true,
     "data": {
       "status": "ok",
       "environment": "production",
       "database": { "status": "connected" }
     }
   }
   ```

---

### Step 3: Deploy Frontend on Vercel
1. Log in to [Vercel](https://vercel.com/dashboard).
2. Click **Add New...** $\to$ **Project**.
3. Import your GitHub repository (`uno`).
4. Configure the Project Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** Edit $\to$ select `apps/web`.
   - **Build and Output Settings:** Leave default (Vite defaults to `dist`).
5. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://uno-ultimate-server-xxxx.onrender.com` (your Render URL from Step 2, no trailing slash)
   - `VITE_WS_URL` = `https://uno-ultimate-server-xxxx.onrender.com`
6. Click **Deploy**.
7. Vercel will install dependencies, compile the client bundle with your backend URL, and deploy the application.
8. Once complete, copy your Vercel production URL:  
   `https://uno-ultimate-xxxx.vercel.app`

---

### Step 4: Link Vercel Domain to Render CORS
1. Return to the [Render Dashboard](https://dashboard.render.com/).
2. Navigate to your `uno-ultimate-server` Web Service $\to$ **Environment**.
3. Update `CORS_ORIGIN` to include your Vercel production URL and preview wildcard:
   ```text
   https://uno-ultimate-xxxx.vercel.app,https://*.vercel.app
   ```
4. Click **Save Changes**. Render will automatically redeploy the server with the new CORS policy.

---

## 8. Friends Real-Device Playtesting Checklist

Once deployed, execute this checklist with friends across phones, laptops, and different Wi-Fi/cellular networks:

### Pre-Test Verification
- [ ] Open `https://<your-app>.vercel.app` on a phone or desktop browser.
- [ ] Verify the Landing Page loads smoothly with responsive styling.
- [ ] Enter a username (e.g. `HostAlice`) and click **Enter UNO Ultimate**.
- [ ] Confirm automatic redirection to `/dashboard`.

### Scenario 1: Host Room Creation & Settings
- [ ] Click **Create Private Room**.
- [ ] Select capacity (e.g. 4 players).
- [ ] Select game variant (test **Classic**, **UNO Flip**, or **UNO Attack**).
- [ ] Click **Create Room** and verify arrival at `/room/:roomCode`.
- [ ] Verify the 6-character room code and the **Copy Invite Link** button.

### Scenario 2: Second Device Joining via Invitation Link
- [ ] On Device 2 (friend's phone on cellular/external network), open the invitation link:  
  `https://<your-app>.vercel.app/join/:roomCode`
- [ ] Verify the invitation card displays: *"You were invited to room :roomCode"*.
- [ ] Enter username (e.g. `FriendBob`) and click **Join Room**.
- [ ] Verify Device 2 joins the lobby.
- [ ] Verify Device 1 (Host) immediately sees `FriendBob` appear in real-time via WebSocket without refreshing.

### Scenario 3: Four-Player Lobby Synchronization
- [ ] Devices 3 and 4 join using the 6-character room code from the Landing Page.
- [ ] All 4 player cards appear on all screens.
- [ ] Non-host players click **Ready**. Host screen updates in real-time.
- [ ] Host updates game settings or variant. All 4 screens update synchronously.
- [ ] Host clicks **Start Match**. Countdown timer (3..2..1) animates in sync across all 4 devices.

### Scenario 4: Gameplay & Server Authority (Classic UNO)
- [ ] 7 cards are dealt to each player. Hands render securely (opponents only see card backs).
- [ ] Top discard card is displayed in the center discard pile.
- [ ] Turn indicator highlights the active player's name and avatar.
- [ ] Active player plays a matching card. Card animates to discard pile on all screens.
- [ ] Active player draws from draw pile when no match is available.
- [ ] Player with 1 card calls **UNO!**.
- [ ] Round terminates with authoritative score tabulation and winner declaration.

### Scenario 5: UNO Flip Playtest
- [ ] Host creates a room with variant **UNO Flip**.
- [ ] Start match. Both sides play on the **Light Side** (White borders).
- [ ] A player plays a **Flip** card.
- [ ] Verify all screens synchronously flip to the **Dark Side** (Dark purple borders, new actions: Draw 5, Dark Wild, Flip back).
- [ ] Play a Flip card on the Dark Side. Verify return to Light Side.

### Scenario 6: UNO Attack Virtual Launcher Playtest
- [ ] Host creates a room with variant **UNO Attack**.
- [ ] Start match. Center launcher renders with tension indicator.
- [ ] When a player must draw, they tap the **Launcher Button**.
- [ ] Launcher simulates physical card launch (sound and card burst animation).
- [ ] If 0 cards launch, turn advances safely. If cards launch, player collects them into hand.
- [ ] Verify 110 or 112 total card conservation invariant holds throughout play.

### Scenario 7: Network Interruption & Reconnection Resilience
- [ ] While in-game, turn off Wi-Fi on Device 2 for 5 seconds, then turn it back on.
- [ ] Verify the client automatically reconnects over WebSocket.
- [ ] Verify the game state, player hand, and turn order are re-delivered seamlessly without restarting the game.
- [ ] Refresh the browser tab on Device 1 (`/game/:roomCode`).
- [ ] Verify the page rehydrates from the server without 404 error and resumes active play.
