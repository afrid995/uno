# UNO ULTIMATE — PHASE 9: UNO TEAMS IMPLEMENTATION & VALIDATION REPORT

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `b19374c14baf26d3def2e0140e79dff346338ee1`  
**Phase:** 9 — UNO Teams  
**Official Edition:** Mattel UNO Teams™, Product **HXT58** / **JDM40** (©2024 Mattel)  
**Primary Rules Authority:** `HXT58 UNO TEAMS [English_ French_German_Italian_Dutch_Spanish_Portuguese] [7LA]. pdf.pdf`  
**Date:** November 15, 2026  

---

## 1. Executive Summary

Phase 9 implements **UNO Teams** as a server-authoritative multiplayer variant in UNO Ultimate, adhering strictly to official Mattel Product HXT58 / JDM40 rules. UNO Teams is a 2-team partnership game played with 4, 6, or 8 players (2 teams: Team 1 and Team 2) seated in alternating order. The variant introduces a custom 112-card deck with 36 Passing Symbol number cards, two novel team wild cards (**Wild Team Play** and **Wild Team Draw Four**), mandatory simultaneous pre-game card passing, dynamic team hand-splitting upon going out, and partner draw tag-in mechanics.

All variant mechanics were integrated cleanly via the existing `VariantRegistry` and `VariantRulesAdapter` architecture without modifying the behaviors of Classic UNO, UNO Flip, UNO Show ’em No Mercy, UNO All Wild, or UNO Flex. Across the full repository test suite, **508 tests passed with 0 regressions, 0 ESLint warnings, 0 TypeScript errors, and 100% clean production builds**.

---

## 2. Official Rules Authority & Physical Card Composition

### 2.1 Primary Source Verification
- **Publisher:** Mattel Customer Service / Mattel Games.
- **Product Code:** HXT58 / JDM40 (Asst. 42001).
- **Instruction Sheet:** Official multilingual 7LA rules sheet (`HXT58_UNO_TEAMS.pdf`).
- **Deck Count:** Exactly 112 physical cards.

### 2.2 Canonical 112-Card Inventory
The complete physical deck consists of 112 cards distributed across four standard colors (Red, Yellow, Green, Blue) and special Wild cards:

| Card Category | Specification | Quantity | Rule Details |
|---|---|---|---|
| **Number Cards** (Regular) | 1x `0`, 1x `1`-`9` per color (4 colors) | 40 | Standard number cards without passing symbol (value = face value). |
| **Number Cards** (Passing Symbol) | 1x `1`-`9` per color (4 colors) | 36 | Number cards marked with the Passing Symbol (`⇄`). When played, active player and partner swap 1 card each. (Value = face value). |
| **Action: Skip** | 2x per color (4 colors) | 8 | Skips the next opponent in turn order (20 points). |
| **Action: Reverse** | 2x per color (4 colors) | 8 | Reverses direction of play (20 points). |
| **Action: Draw Two** | 2x per color (4 colors) | 8 | Next opponent draws 2 cards and forfeits turn (20 points). |
| **Wild** | Standard Wild card | 4 | Choose next active color (50 points). |
| **Wild: Team Play** | Novel Teams Wild card | 4 | Active player picks color; play immediately passes to partner. If partner has matching card, partner plays it. If partner cannot play, active player draws 2 penalty cards (50 points). |
| **Wild: Team Draw Four** | Novel Teams Wild card | 4 | Next opponent draws 2 cards and skips turn; their partner also draws 2 cards (50 points). |
| **TOTAL** | | **112** | **Physical invariant: Exactly 112 cards conserved across all states.** |

---

## 3. Core Mechanics Implementation

### 3.1 Seating & Team Allocation
- Valid player capacities: 4, 6, or 8 players (must be even).
- Players are assigned to two teams (`team_1` and `team_2`) in strictly alternating seating order:
  - Player 0: Team 1
  - Player 1: Team 2
  - Player 2: Team 1 (Player 0's partner)
  - Player 3: Team 2 (Player 1's partner)
  - Player 4: Team 1, Player 5: Team 2 (in 6-player games)
  - Player 6: Team 1, Player 7: Team 2 (in 8-player games)
- Partner lookup helper: `getPartnerId(playerId, state)` maps any player to their partner on the same team.

### 3.2 Setup Rule 6: Initial Team Pass
- After 7 cards are dealt to each player, regular play does not begin immediately.
- State enters `AWAITING_TEAM_INITIAL_PASS`.
- All players simultaneously and secretly select 1 card from their initial hand to pass to their teammate.
- Once all players have submitted their card, cards are exchanged simultaneously and play begins with the player to the left of the dealer.

### 3.3 Passing Symbol Cards (`⇄`)
- 36 Number cards (numbers 1-9 in each color) bear the double-arrow passing symbol.
- When an active player plays a card with `hasPassingSymbol: true`:
  - If their partner is currently in the game (`isOut === false`), state enters `AWAITING_TEAM_CARD_PASS`.
  - Both teammates simultaneously select 1 card from their hand to swap secretly.
  - When both have submitted, cards are swapped, and turn advances to the next player.
  - If the active player's partner is currently out of cards (`isOut === true`), the passing effect is bypassed and play advances immediately.

### 3.4 Wild Team Play Card
- Active player declares the next color.
- Turn immediately jumps to their teammate:
  - If the teammate holds a card matching the chosen color or a wild card, the teammate must play a valid card.
  - If the teammate does not hold a playable card:
    - The active player who played the Wild Team Play card is penalized and draws 2 cards from the draw pile.
    - Play continues from the teammate (who must draw from the draw pile or pass per standard draw rules) under the chosen color.

### 3.5 Wild Team Draw Four Card
- Active player declares the next color.
- The next player in current turn rotation must draw 2 cards and skips their turn.
- The next player's teammate must also draw 2 cards.
- If the victim's teammate was previously out of cards (`isOut === true`), drawing 2 cards immediately tags them back into the game (`isOut = false`).
- Play proceeds to the player following the victim.

### 3.6 Going Out & Partner Hand-Off Split
- When a player plays their final card, round victory is NOT triggered unless their partner also has 0 cards.
- If the partner has $> 1$ card:
  - State enters `AWAITING_TEAM_SPLIT_PASS`.
  - The partner must select and pass $\lfloor n / 2 \rfloor$ cards (rounded down) to the emptied player.
  - For example, if partner holds 5 cards, partner passes $\lfloor 5 / 2 \rfloor = 2$ cards, retaining 3 cards.
  - Both players remain active in the game.
- If the partner has exactly 1 card:
  - Partner cannot split (half of 1 rounded down is 0).
  - Emptied player receives 0 cards and sits out (`isOut = true`).
  - Partner continues playing alone for Team 1 or Team 2.
- If the partner has 0 cards:
  - **Team Victory!** Both partners have emptied their hands. The round concludes immediately.

### 3.7 Partner Draw Tag-In Mechanic
- If an inactive player's partner (`isOut === true`) draws one or more cards for any reason (cannot play on their turn, drawing due to action penalty, or Wild Team Draw Four):
  - If the partner now holds $> 1$ card, the partner must immediately split their hand and pass $\lfloor n / 2 \rfloor$ cards to the inactive player.
  - The inactive player receives the cards and is tagged back into active play (`isOut = false`).

### 3.8 UNO Declaration & Partner Protection
- When holding exactly 1 card, a player may declare UNO for themselves (`CALL_UNO`).
- A player may also declare UNO on behalf of their teammate (`CALL_UNO` with `targetPlayerId`).
- Teammates are strictly forbidden from challenging each other for failure to declare UNO (`TeamsMoveValidator` rejects partner challenges).

### 3.9 Scoring
- Round winner: The team whose members both successfully emptied their hands.
- Round score: Sum of all card point values remaining in both opponents' hands.
- Match target: First team to accumulate 500 points wins the match.

---

## 4. Architecture & Monorepo Changes

### 4.1 Packages Modified

```
uno/
├── packages/
│   ├── shared/
│   │   └── src/schemas/room.schema.ts          # Added 'uno_teams' variant to roomSettingsSchema
│   ├── game-protocol/
│   │   └── src/events.ts                       # Added GAME_TEAM_INITIAL_PASS, GAME_TEAM_CARD_PASS,
│   │                                           # GAME_TEAM_SPLIT_HAND_PASS schemas and event signatures
│   └── game-engine/
│       ├── src/
│       │   ├── cards/card.types.ts             # TeamsWildCardValue, hasPassingSymbol, isTeamsCard
│       │   ├── cards/card.validation.ts        # Updated wildCardValueSchema
│       │   ├── players/player.types.ts         # teamId ('team_1' | 'team_2'), isOut boolean
│       │   ├── game/game.types.ts              # PendingTeamInitialPassState, PendingTeamCardPassState,
│       │   │                                   # PendingTeamHandSplitState, PendingWildTeamPlayState
│       │   ├── actions/action.types.ts         # TeamInitialPassAction, TeamCardPassAction,
│       │   │                                   # TeamSplitHandPassAction, CallUnoAction targetPlayerId
│       │   ├── projections/public-state.ts     # teamId, isOut, public pending pass states
│       │   ├── projections/player-state.ts     # canTeamInitialPass, canTeamCardPass, canTeamHandSplit
│       │   ├── variants/teams/                 # New UNO Teams domain module
│       │   │   ├── teams.constants.ts          # Rules constants, card scores, 500 target
│       │   │   ├── teams.types.ts              # Seating order, team allocation, partner resolution
│       │   │   ├── teams.deck.ts               # TeamsDeckFactory (112 cards, 36 passing symbol)
│       │   │   ├── teams.dealer.ts             # TeamsDealerSelector
│       │   │   ├── teams.invariants.ts         # assertValidTeamsGameState, validateTeamsGameStateInvariants
│       │   │   ├── teams.validator.ts          # TeamsMoveValidator
│       │   │   ├── teams.actions.ts            # TeamsActionProcessor (pass, split, wild actions)
│       │   │   ├── teams.adapter.ts            # UnoTeamsAdapter (VariantRegistry registration)
│       │   │   └── teams.fixture.ts            # TeamsFixtureBuilder
│       │   └── index.ts                        # Module exports
│       └── tests/
│           ├── teams.deck.test.ts              # 7 deck composition tests
│           ├── teams.fixture.test.ts           # 3 fixture & state projection tests
│           └── teams.rules.test.ts             # 12 official rules validation tests
├── apps/
│   ├── server/
│   │   ├── src/
│   │   │   ├── modules/room/room.service.ts    # Enabled 'uno_teams' with 4, 6, 8 player capacity
│   │   │   ├── modules/game/game.service.ts    # Team pass operations, teammate UNO declaration
│   │   │   ├── modules/game/game.socket.handler.ts # Registered socket handlers for team passes
│   │   │   └── routes/test.routes.ts           # Added /api/test/verify-teams-invariants/:roomCode
│   │   └── tests/integration/
│   │       └── game.teams.socket.test.ts       # 4-player Socket.IO multiplayer integration test
│   └── web/
│       ├── src/
│       │   ├── features/room/components/CreateRoomModal.tsx # Added UNO Teams variant selector (112C badge)
│       │   ├── pages/LobbyPage.tsx             # Added UNO Teams banner, TEAMS badge, description
│       │   ├── features/game/components/
│       │   │   ├── PlayingCard.tsx             # Passing symbol ⇄ badge, TEAM PLAY / TEAM DRAW 4 values
│       │   │   ├── PlayerSeat.tsx              # TEAM 1 / TEAM 2 badge, WAITING FOR PARTNER badge
│       │   │   ├── TeamPassModal.tsx           # Initial pass, passing symbol swap, and hand split modal
│       │   │   └── GameBoard.tsx               # UNO Teams badge, self-team badge, TeamPassModal integration
│       │   ├── stores/gameStore.ts             # teamInitialPass, teamCardPass, teamSplitHandPass actions
│       │   └── features/game/components/__tests__/
│       │       ├── PlayingCard.teams.test.tsx  # 4 tests for passing symbol & wild card rendering
│       │       └── TeamPassModal.test.tsx      # 2 tests for pass modal selection & submission
│       └── tests/e2e/
│           └── uno-teams-game.spec.ts          # 4-player Playwright E2E full lifecycle test
└── reports/
    ├── PHASE_9_UNO_TEAMS_RULES_RESEARCH.md     # Primary source extraction & rules analysis report
    └── PHASE_9_UNO_TEAMS_IMPLEMENTATION_REPORT.md # This report
```

---

## 5. Test Evidence & Verification Results

### 5.1 Typecheck Suite (`pnpm -r typecheck`)
All 6 workspace packages checked with `tsc --noEmit`:
```
database: Done (0 errors)
packages/shared: Done (0 errors)
packages/game-protocol: Done (0 errors)
packages/game-engine: Done (0 errors)
apps/server: Done (0 errors)
apps/web: Done (0 errors)
Status: PASSED (0 errors)
```

### 5.2 Lint Suite (`pnpm -r lint`)
ESLint verified across all packages with strict rules:
```
packages/shared lint: Done (0 errors, 0 warnings)
packages/game-engine lint: Done (0 errors, 0 warnings)
apps/server lint: Done (0 errors, 0 warnings)
apps/web lint: Done (0 errors, 0 warnings)
Status: PASSED (0 errors, 0 warnings)
```

### 5.3 Unit & Integration Test Summary (`pnpm test`)
Total: **500 tests across 59 test files passed with 0 failures**.

#### A. `@uno-ultimate/game-engine` (311 tests across 24 test files)
- `tests/teams.deck.test.ts`: **7 passed**
  - Exactly 112 cards created.
  - 76 Number cards (40 standard, 36 with Passing Symbol).
  - Exactly 1 copy of numbers 1-9 in each of the 4 colors has `hasPassingSymbol: true`.
  - Exactly 0s do not have Passing Symbol.
  - 24 Action cards (8 Skip, 8 Reverse, 8 Draw Two).
  - 12 Wild cards (4 Wild, 4 Wild Team Play, 4 Wild Team Draw Four).
  - Distinct unique card IDs across all 112 cards.
- `tests/teams.fixture.test.ts`: **3 passed**
  - Builds initial 4-player game fixture with valid 112-card conservation.
  - Completes initial card pass transitioning state to `IN_PROGRESS`.
  - Sets custom hands and discard pile while maintaining physical deck conservation.
- `tests/teams.rules.test.ts`: **12 passed**
  - Enforces alternating seating and team assignments (`team_1` vs `team_2`).
  - Executes simultaneous initial card pass before Turn 1.
  - Triggers passing symbol card swap when playing number card with symbol.
  - Bypasses passing symbol swap when partner has already emptied hand.
  - Resolves Wild Team Play: passes turn to partner when partner has playable card.
  - Resolves Wild Team Play: active player draws 2 cards penalty when partner cannot play.
  - Resolves Wild Team Draw Four: next player draws 2 and skips, partner also draws 2.
  - Resolves Wild Team Draw Four: tags out player back into game when drawn.
  - Splits partner hand ($\lfloor n / 2 \rfloor$ cards) when active player empties hand.
  - Marks player `isOut = true` without splitting when partner holds exactly 1 card.
  - Triggers round victory when both teammates have 0 cards.
  - Allows teammate to call UNO on partner's behalf and prohibits partner challenges.
- All historical test suites (Classic, Flip, No Mercy, All Wild, Flex): **289 passed with 0 regressions**.

#### B. `@uno-ultimate/server` (103 tests across 15 test files)
- `tests/integration/game.teams.socket.test.ts`: **1 passed**
  - 4-player Socket.IO multiplayer match lifecycle: lobby join, ready toggle, match start, simultaneous initial pass, 112-card invariant verification, and turn execution.
- All historical server integration suites: **102 passed with 0 regressions**.

#### C. `@uno-ultimate/web` (86 tests across 20 test files)
- `src/features/game/components/__tests__/PlayingCard.teams.test.tsx`: **4 passed**
  - Renders Number card with Passing Symbol `⇄` badge (`data-testid="card-passing-symbol"`).
  - Renders Number card without Passing Symbol.
  - Renders Wild Team Play card with `TEAM PLAY` title and 50 pt badge.
  - Renders Wild Team Draw Four card with `TEAM DRAW 4` title and 50 pt badge.
- `src/features/game/components/__tests__/TeamPassModal.test.tsx`: **2 passed**
  - Renders Initial Pass modal with hand cards and disables confirm until 1 card is selected.
  - Renders Hand Split modal requiring multiple card selections before confirmation.
- All historical web component tests: **80 passed with 0 regressions**.

### 5.4 Playwright E2E Suite (`pnpm --filter @uno-ultimate/web test:e2e`)
Total: **8 tests across 6 test suites passed in 1.6m**.
1. `multiplayer-game.spec.ts`: Full 2-player Classic match lifecycle (9.9s).
2. `multiplayer-game.spec.ts`: Direct invitation link join flow (4.8s).
3. `uno-all-wild-game.spec.ts`: 112-card All Wild, Targeted Draw Two modal, reload resilience (11.6s).
4. `uno-flex-game.spec.ts`: 112-card Flex, 8 Power Cards, Power Card status update, reload resilience (9.6s).
5. `uno-flip-game.spec.ts`: 112-card Flip, Dark Side transition, Light Side transition, reload resilience (16.0s).
6. `uno-flip-game.spec.ts`: Starting Wild card designated player color selection (9.9s).
7. `uno-no-mercy-game.spec.ts`: 168-card No Mercy, Stacking, 7s hand swap, 25-card Mercy Rule elimination (13.0s).
8. `uno-teams-game.spec.ts`: 4-player UNO Teams, Lobby team badges, start match, initial team pass modal, 112-card invariant verification, and page reload resilience (16.8s).

---

## 6. Commit Metadata & Chronology

| Milestone | Action | Commit SHA |
|---|---|---|
| **Baseline** | Published baseline HEAD | `b19374c14baf26d3def2e0140e79dff346338ee1` |
| **Phase 9B** | Primary Rules Research & Verification | Recorded in `PHASE_9_UNO_TEAMS_RULES_RESEARCH.md` |
| **Phase 9D** | Engine, Protocol, Server, Web Implementation | Implemented across all monorepo packages |
| **Phase 9E** | Unit, Fixture, Socket, Component & E2E Tests | 508 tests passing, 0 regressions |
| **Phase 9F** | Final Publication Commit | `7d6763fdb63e5c4d2e6abe790d85d4f5282e1d2a` |

---

## 7. Conclusion

UNO Teams is fully implemented, verified against the primary Mattel HXT58 rules authority, and integrated into the UNO Ultimate multiplayer platform. All physical invariants (112 cards strictly conserved), partnership dynamics (alternating seating, partner passing, team splits, and tag-ins), and UI indicators function reliably under server authority.
