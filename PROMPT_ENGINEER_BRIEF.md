# UNO Ultimate — Prompt Engineer Brief

### Project Summary & Current Phase
**UNO Ultimate** is an online private multiplayer card game crafted for friend groups via room codes and direct links. It features zero-registration guest identity (username only, HMAC session cookies), a server-authoritative TypeScript engine, and anti-cheat state projections. We completed 10 foundational variant phases (Classic, Flip, No Mercy, All Wild, Flex, Teams, Attack), cloud deployment (Render, Vercel, Neon PostgreSQL), and 19 post-deployment reliability/UX phases. We are currently at the conclusion of **Robust Multiplayer Network Recovery & Seamless Reconnection** (120s grace period, durable PostgreSQL snapshot recovery, client exponential backoff/jitter, non-destructive reconnect overlay).

### Tech Stack & Architecture
- **Monorepo:** pnpm workspaces, TypeScript 5.7.3, Node.js 20+.
- **Engine:** `@uno-ultimate/game-engine` (pure TS, zero-I/O, deterministic PRNG, event sourcing).
- **Backend:** `@uno-ultimate/server` (Express 4.21, Socket.IO 4.8, Prisma 5.22, Helmet, CORS, Rate Limit).
- **Frontend:** `@uno-ultimate/web` (React 18.3, Vite 6.1, React Router v7, Zustand 5, Tailwind CSS 3.4, Framer Motion 12, Lucide React).
- **Database:** `@uno-ultimate/database` (PostgreSQL 16, Prisma ORM, JSON state snapshots).
- **Core Architecture:** Per-room async mutex (`GameSessionManager`), server state projection filters (redacting hands/draw pile), and durable recovery across cold starts.

### Phase Timeline
1. Phase 1: Project Foundation (Guest auth, monorepo, DB) — DONE
2. Phase 2: Private Rooms & Presence (Lobby, invite codes, host transfer) — DONE
3. Phase 3: Server-Authoritative Game Engine (Pure transitions, event sourcing) — DONE
4. Phase 4–4.3: Playable Classic UNO & Rules Hardening (Multiplayer, mutex, E2E) — DONE
5. Phase 5–5.3.1: UNO Flip! Variant (Dual-sided deck, atomic flip transitions) — DONE
6. Phase 6–6.1.6: UNO Show 'em No Mercy (168 cards, stacking, card recycling) — DONE
7. Phase 7–7.1.2: UNO All Wild! (Targeted draws, forced swap victory ruling) — DONE
8. Phase 8–8.1: UNO Flex! (Power cards, dual-mode flex actions) — DONE
9. Phase 9–9.1: UNO Teams (Partner seating, card passing, split hands) — DONE
10. Phase 10–10.1.1: UNO Attack! (Virtual launcher, tension stages, custom cards) — DONE
11. Deployment: Production & Free-Tier Readiness (Render, Vercel, Neon Postgres) — DONE
12. Post-Deployment (19 bugfix/feature phases):
- Rule fidelity (draw rules, freeze prevention, 7s swap hardening) — DONE
- Card animations, room chat, circular round-table layout & orbit indicator — DONE
- Authoritative UNO declaration/catch, game start latency fix & room start lock — DONE
- No Mercy >25 elimination update, Classic Wild replacement, reverse draw 4 target fix — DONE
- Hand sorting, Play Again rematch, deep-link invite flow & privacy audit (hand inspection removed) — DONE
- Mobile portrait/landscape adaptive layouts & premium casino UI/UX redesign — DONE
- 120s disconnect grace period, cold-start recovery & network resilience — DONE

### Key Rules, Decisions & Conventions
- **Server Authority:** Game rules live strictly in `@uno-ultimate/game-engine`. Never put rule logic in client or routes.
- **Privacy:** Opponent hands and draw decks are never exposed. Hand inspection on challenges is strictly disabled across all variants.
- **Client Sorting:** Hand organization is purely visual (`cardSorting.ts`); authoritative card IDs and order remain unchanged.
- **Conventions:** Package imports `@uno-ultimate/*`, Conventional Commits (`feat`, `fix`, `docs`), and mandatory phase completion reports in `reports/`.

### Known Issues & Immediate Next Goal
- **Known Issues:** Typecheck error in `apps/server/tests/integration/game.robust-network-reconnection.socket.test.ts:472` (`cardPlayerId` should be `playedByPlayerId`); two long server socket tests timeout during full test runs; `howler` is installed but audio assets/playback are not hooked up; main web bundle exceeds 841 kB.
- **Immediate Goal:** Fix server test typecheck error and test timeouts, update root `README.md`, and implement audio effects or bundle splitting.

### Closing Instructions
You are my prompt engineer for this project. Using this context, write precise, copy-ready prompts for my coding agent (Antigravity) for each next step. Each prompt must reference real file names, respect existing conventions, state clear acceptance criteria, and ask for a phase completion report when done. Ask me for any missing information before writing a prompt.
