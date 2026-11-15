# UNO ULTIMATE — PHASE 9B & 9C: UNO TEAMS OFFICIAL RULES RESEARCH & ARCHITECTURE ASSESSMENT

**Project:** UNO Ultimate — Private Online Multiplayer Card Game  
**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `b19374c14baf26d3def2e0140e79dff346338ee1`  
**Phase:** 9B (Rules Research) & 9C (Architecture Assessment)  
**Date:** November 15, 2026  

---

## 1. OFFICIAL PRODUCT & PRIMARY RULES AUTHORITY

### 1.1 Edition Identification
- **Product Name:** UNO Teams™ Card Game
- **Mattel Product Number / Toy No.:** `HXT58` / `JDM40`
- **Copyright:** ©2024 Mattel
- **Target Age:** 7+
- **Player Count:** 4, 6, or 8 players (2 to 4 teams of 2 players; standard partnership mode is 4 players in 2 teams of 2)
- **Deck Inventory:** Exactly 112 Cards

### 1.2 Primary Source Verification
- **Primary Source:** Official Mattel Customer Service Instruction Sheet PDF:
  - **URL:** `https://service.mattel.com/instruction-sheets/files/HXT58%20UNO%20TEAMS%20[English_%20French_German_Italian_Dutch_Spanish_Portuguese]%20[7LA].%20pdf.pdf`
  - **Part No. / EDM:** `HXT58_7LA_7A70G2`
  - **Verification Status:** Fully retrieved, analyzed, and extracted across English, French, German, Italian, Dutch, Spanish, and Portuguese instruction panels.

---

## 2. OFFICIAL RULES SPECIFICATION BY CATEGORY

### 2.1 Team Formation & Seating Arrangement
- Players play in fixed teams of 2 throughout the entire match.
- Teammates sit directly across from each other in the playing circle.
- Seating order alternates strictly by team:
  - **Seat 0:** Team 1, Player A
  - **Seat 1:** Team 2, Player A
  - **Seat 2:** Team 1, Player B (Teammate of Seat 0)
  - **Seat 3:** Team 2, Player B (Teammate of Seat 1)
- Turn sequence rotates clockwise: Seat 0 $\to$ Seat 1 $\to$ Seat 2 $\to$ Seat 3 $\to$ Seat 0.

### 2.2 Deck Composition (112 Cards Total)
The official Mattel HXT58 deck contains exactly 112 cards:
1. **76 Number Cards (Colors: Red, Blue, Green, Yellow):**
   - Per color: One `0` card, two copies of `1` through `9` ($1 + 2 \times 9 = 19$ cards per color $\times 4 = 76$ cards).
   - Select number cards feature the official **Passing Symbol** (a card-exchange icon printed below the corner number).
2. **24 Standard Action Cards (Colors: Red, Blue, Green, Yellow):**
   - 8 Draw Two cards (2 per color)
   - 8 Reverse cards (2 per color)
   - 8 Skip cards (2 per color)
   - Total Action cards: $24$
3. **12 Wild Cards:**
   - 4 Classic Wild cards (`wild`)
   - 4 Wild Team Play cards (`wild_team_play`)
   - 4 Wild Team Draw Four cards (`wild_team_draw_four`)
   - Total Wild cards: $12$
4. **Total Inventory:** $76 + 24 + 12 = 112$ cards.

### 2.3 Setup & Mandatory Initial Card Swap (Setup Step 6)
1. Deal 7 cards to each player (28 cards dealt).
2. Remaining cards form the facedown Draw Pile.
3. Top card of Draw Pile is flipped faceup to start the Discard Pile. If the card is an Action card (Draw Two, Skip, Reverse, Wild, Wild Team Play, or Wild Team Draw Four), it is ignored and subsequent cards are flipped until a Number card starts the discard pile.
4. **Mandatory Initial Pass:** Before the first turn begins, **every player secretly selects 1 card from their hand and simultaneously passes it to their partner**.
5. The player to the left of the dealer takes the first turn; play proceeds clockwise.

### 2.4 Turn Play & Card Matching
- Normal turn matching follows standard UNO rules: match color, number, or symbol, or play a Wild card.
- If a player does not have a matching card (or chooses not to play), they draw 1 card from the Draw Pile. If playable, they may play it immediately.
- When the Draw Pile is depleted, the Discard Pile (except top card) is reshuffled.

### 2.5 Action Card Mechanics
- **Draw Two:** Next player in rotation draws 2 cards and loses their turn.
- **Skip:** Next player in rotation loses their turn.
- **Reverse:** Play direction reverses.
- **Wild:** Matches any card; playing player chooses the active color.
- **Wild Team Play:**
  - Playing player chooses the active color.
  - Play **skips directly to their partner**, bypassing any opponents in between.
  - Partner's turn begins with the chosen color:
    - If partner has a playable card (matching color or wild), partner **must play it**, and play continues clockwise from partner.
    - If partner **cannot play** a card: the player who played the Wild Team Play must draw **2 penalty cards**; play continues from the partner with the chosen color.
- **Wild Team Draw Four:**
  - Wild card: playing player chooses the active color.
  - The next player in rotation must draw 2 cards and lose their turn.
  - **AND that player's teammate must also draw 2 cards** (total of 4 cards distributed to the opposing team).
  - Explicit rule: The teammate must draw 2 cards *even if they are currently out of the game*!

### 2.6 Passing Symbol Mechanic
- When an active player plays any Number card bearing the Passing Symbol:
  - Both teammates simultaneously and secretly pass 1 card of their choice to each other.
  - Both teammates must be active in the game (if a teammate is currently out with 0 cards, no pass occurs).

### 2.7 Going Out & Partner Hand-Off
- When an active player plays their final card and empties their hand:
  - **Case 1 (Partner has $> 1$ card):** Partner immediately passes **half of their cards** to the emptied player. If partner holds an odd number of cards, partner keeps the larger half (e.g., 9 cards $\to$ partner keeps 5, passes 4). The emptied player receives $\lfloor n / 2 \rfloor$ cards and continues active play!
  - **Case 2 (Partner has exactly 1 card):** Partner passes nothing; the emptied player stays out of the game (`isOut = true`).
  - **Case 3 (Partner has 0 cards):** Both players on the team have 0 cards $\to$ **Team Victory! Round ends immediately.**

### 2.8 Tagging Back In
- If a player is currently out of the game (`isOut = true`):
  - If their active partner draws cards for **any reason** (drawing from deck on their turn, penalty draw, Wild Team Draw Four, etc.), the partner immediately passes half of their cards ($\lfloor n / 2 \rfloor$) to the out player.
  - The out player receives the cards and is tagged back into active play (`isOut = false`)!
  - If the out player is directly targeted to draw cards (such as by Wild Team Draw Four), the out player receives those cards directly and is tagged back into active play.

### 2.9 Communication Restrictions
- Teammates may talk to one another, but cannot talk about or drop hints regarding the specific cards in their hands.
- When any Wild card is played, teammates cannot say anything that will influence the color chosen.

### 2.10 Calling "UNO!"
- When a player holds exactly 1 card, they must call "UNO!".
- **Teammate Privilege:** A player's partner may also yell "UNO!" on their teammate's behalf.
- If caught with 1 card before the next player begins their turn without either teammate calling "UNO!", the penalized player must draw 2 cards.

### 2.11 Scoring & Victory Conditions
- When a team empties both partners' hands, that team wins the round.
- The winning team scores points for all cards remaining in both opponents' hands:
  - **Number cards (0–9):** Face Value
  - **Action cards (Skip, Reverse, Draw Two):** 20 Points each
  - **Wild cards (Wild, Wild Team Play, Wild Team Draw Four):** 50 Points each
- Match Victory Target: First team to 500 points (or single round if configured).

---

## 3. PHASE 9C: ARCHITECTURE ASSESSMENT & COMPATIBILITY AUDIT

### 3.1 Variant Registry & Adapter Architecture
The existing UNO Ultimate architecture uses a modular variant registry:
- `VariantRegistry`: Registers `GameVariantAdapter` implementations (`classic`, `flip`, `no_mercy`, `all_wild`, `flex`).
- Adding `uno_teams` requires implementing `UnoTeamsAdapter` adhering to `GameVariantAdapter`.
- `GameVariant`: Adding `'uno_teams'` to variant union types in `packages/game-protocol` and `packages/game-engine`.

### 3.2 State Model Extensions
1. **Player State:**
   - `teamId?: string`: Assigned on game initialization (`'team_1'` or `'team_2'`).
   - `isOut?: boolean`: Tracks whether an emptied player is currently waiting for partner cards or tagged out.
2. **Pending Action States:**
   - `AWAITING_TEAM_INITIAL_PASS`: Active during setup step 6; requires all 4 players to submit 1 card to pass to their teammate.
   - `AWAITING_TEAM_CARD_PASS`: Triggered by playing a card with the Passing Symbol; requires the active player and their teammate to select 1 card to pass.
   - `AWAITING_TEAM_HAND_SPLIT`: Triggered when a player goes out and partner has $> 1$ card; partner selects $\lfloor n / 2 \rfloor$ cards to hand over.
   - `AWAITING_COLOR_CHOICE`: For Wild, Wild Team Play, and Wild Team Draw Four.
3. **Turn Manager:**
   - Skips players who have `isOut === true`.
   - Wild Team Play jumps turn directly to `partnerId` instead of next player in clockwise rotation.

### 3.3 Conservation of Cards Invariant
- The engine enforces strict conservation:
  $$\sum \text{Hands} + |\text{DrawPile}| + |\text{DiscardPile}| + |\text{PendingPasses}| = 112$$
- Card IDs, unique instances, and state immutability must be preserved across card passes and hand splits.

### 3.4 Room & Lobby System Compatibility
- In `apps/server`:
  - Room options include `variant: 'uno_teams'`.
  - Room seating: Seats 0 and 2 automatically form Team 1; Seats 1 and 3 form Team 2.
  - Team indicators and badges displayed in lobby and player seats.

---

## 4. DESIGN & IMPLEMENTATION ROADMAP

1. **Protocol (`packages/game-protocol`):**
   - Declare `'uno_teams'` in `GameVariant`.
   - Add `TeamsCard`, `TeamsCardValue` (`'wild_team_play'`, `'wild_team_draw_four'`), `hasPassingSymbol?: boolean`.
   - Add Teams-specific Socket.IO client-to-server events: `game:pass_card`, `game:initial_pass`, `game:split_hand_pass`.
2. **Engine (`packages/game-engine`):**
   - `teams.constants.ts`: Scoring values, card distributions.
   - `teams.types.ts`: Engine-specific action payloads and states.
   - `teams.deck.ts`: `TeamsDeckFactory` producing 112 cards.
   - `teams.invariants.ts`: `assertValidTeamsGameState` (112 cards conservation, team assignments).
   - `teams.validator.ts`: Move validation for Teams cards, wild team play, and passing.
   - `teams.actions.ts`: State machine transitions for initial pass, turn play, wild team play, wild team draw 4, passing symbol, hand-off splits, and tagging back in.
   - `teams.adapter.ts`: Full `GameVariantAdapter` implementation registered in `VariantRegistry`.
   - `teams.fixture.ts`: Testing helper for deterministic state generation.
3. **Server Integration (`apps/server`):**
   - Handle Teams room creation, seating assignments, and team socket event routing.
4. **Web Frontend (`apps/web`):**
   - Variant selector option, Team badges in player seats, card passing modals/prompts, and team win celebration screen.
5. **Quality Gates & Regression:**
   - Engine unit tests, server socket integration tests, Playwright E2E tests, and 100% pass across Classic, Flip, No Mercy, All Wild, and Flex variants.
