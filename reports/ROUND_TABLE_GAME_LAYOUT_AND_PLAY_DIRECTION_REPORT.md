# Round-Table Game Layout and Play Direction Report

**Project:** UNO Ultimate  
**Repository:** `https://github.com/afrid995/uno`  
**Branch:** `main`  
**Date:** November 16, 2026  
**Status:** Completed, Fully Verified, and Pushed to Main

---

## 1. Executive Summary

As part of the UI/UX enhancement phase, the in-game player arrangement in UNO Ultimate was completely redesigned from a linear flex arrangement into an immersive **Round-Table Layout** with an integrated **Play Direction Indicator** and **Synchronized Player Turn Highlighting**.

The round-table arena provides:
1. **Oval Table Topology:** Local player seated at the bottom near their card hand; opponent profiles arranged naturally around the upper perimeter according to total player count ($N \in [2, 10]$).
2. **Circular Play Direction Indicator:** A prominent animated circular/elliptical orbit track with directional chevrons that immediately reflects server-authoritative `turnDirection` (Clockwise vs. Counter-Clockwise) and updates instantaneously upon playing Reverse cards.
3. **Synchronized Active Turn Highlighting:** Exactly one player is active at any time. The local player's profile displays a prominent `"YOUR TURN"` banner with a glowing gold ring, while active opponents display a `"PLAYING"` badge with an energetic accent ring.
4. **Accessible & Responsive:** Non-intrusive pointer-events-none directional indicator, full `useReducedMotion()` support, and adaptive coordinate geometry that prevents overlap across desktop, tablet, and mobile displays.

---

## 2. Architecture & Implementation

### 2.1 Round-Table Layout Geometry

The new round-table interface is implemented in `apps/web/src/features/game/components/RoundTable.tsx`.

#### Oval Felt Table Anatomy
- **Outer Rail:** Rounded stadium/oval border (`rounded-[50px] sm:rounded-[80px] md:rounded-[120px]`) with a metallic slate finish (`border-4 border-slate-700/70`) and deep ambient table shadows (`shadow-[0_12px_45px_rgba(0,0,0,0.85),inset_0_0_60px_rgba(0,0,0,0.8)]`).
- **Felt Texture:** Radial gradient with subtle emerald casino felt undertones (`bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-950/20 via-slate-900/60 to-slate-950/95`).
- **Inner Rail Seam:** Embedded inset boundary line (`border border-emerald-500/15`).

#### Authoritative Clockwise Seating Cycle (`getSeatedOpponents`)
The game engine maintains an authoritative `gameState.playerOrder: string[]` sequence representing the physical order of players around the table.
The `getSeatedOpponents` algorithm shifts the cycle relative to the local player:
$$\text{opponent}_i = \text{playerOrder}[(\text{selfIndex} + i) \pmod N] \quad \text{for } i \in [1, N-1]$$
This guarantees that visual turn progression always moves in clockwise screen order (Bottom $\rightarrow$ Left $\rightarrow$ Top $\rightarrow$ Right $\rightarrow$ Bottom), maintaining complete geometric fidelity with the server's turn manager.

#### Adaptive Perimeter Coordinate Mapping (`getOpponentPosition`)
Opponent seats are distributed dynamically along the table's perimeter:
- **2-Player Match ($M = 1$ Opponent):**
  - Opponent: Top-Center (`top: 5%, left: 50%`)
- **3-Player Match ($M = 2$ Opponents):**
  - Opponent 1: Upper-Left (`top: 8%, left: 26%`)
  - Opponent 2: Upper-Right (`top: 8%, left: 74%`)
- **4-Player Match ($M = 3$ Opponents):**
  - Opponent 1: Mid-Left (`top: 38%, left: 8%`)
  - Opponent 2: Top-Center (`top: 5%, left: 50%`) — opposite partner in UNO Teams!
  - Opponent 3: Mid-Right (`top: 38%, left: 92%`)
- **5-Player Match ($M = 4$ Opponents):**
  - Opponent 1: Lower-Left (`top: 44%, left: 7%`)
  - Opponent 2: Upper-Left (`top: 7%, left: 26%`)
  - Opponent 3: Upper-Right (`top: 7%, left: 74%`)
  - Opponent 4: Lower-Right (`top: 44%, left: 93%`)
- **6-Player Match ($M = 5$ Opponents):**
  - Opponent 1: Lower-Left (`top: 48%, left: 7%`)
  - Opponent 2: Upper-Left (`top: 14%, left: 18%`)
  - Opponent 3: Top-Center (`top: 5%, left: 50%`)
  - Opponent 4: Upper-Right (`top: 14%, left: 82%`)
  - Opponent 5: Lower-Right (`top: 48%, left: 93%`)
- **7+ Player Match ($M \ge 6$ Opponents):**
  - Parametric elliptical arc mapping for index $i \in [0, M-1]$:
    $$t = \frac{i}{M - 1}, \quad \theta = \pi \cdot (0.92 - 0.84 \cdot t)$$
    $$\text{left} = 50\% + 43\% \cdot \cos(\theta), \quad \text{top} = 48\% - 41\% \cdot \sin(\theta)$$

---

### 2.2 Play Direction Indicator (`PlayDirectionIndicator.tsx`)

#### Visual Orbit & Directional Chevrons
- **Orbit Track:** SVG `<ellipse cx="300" cy="180" rx="250" ry="140" />` encircling the central card piles.
- **Directional Modes:**
  - **Clockwise (`turnDirection === 'clockwise'`):**
    - Vibrant Cyan/Emerald theme (`#06b6d4` $\rightarrow$ `#10b981`).
    - Animated clockwise dash flow (`strokeDashoffset: [0, -64]`).
    - Four tangential directional chevrons positioned at $12$ o'clock ($\rightarrow$), $3$ o'clock ($\downarrow$), $6$ o'clock ($\leftarrow$), and $9$ o'clock ($\uparrow$).
    - Pill badge: `↻ Clockwise`.
  - **Counter-Clockwise (`turnDirection === 'counter_clockwise'`):**
    - Vibrant Rose/Amber theme (`#f43f5e` $\rightarrow$ `#f59e0b`).
    - Animated counter-clockwise dash flow (`strokeDashoffset: [0, 64]`).
    - Four reversed tangential directional chevrons at $12$ o'clock ($\leftarrow$), $9$ o'clock ($\downarrow$), $6$ o'clock ($\rightarrow$), and $3$ o'clock ($\uparrow$).
    - Pill badge: `↺ Counter-Clockwise`.
- **Zero Card Interaction Obstruction:** Styled with `pointer-events-none` so drawing, playing, or inspecting cards is never blocked.
- **Reduced Motion Accessibility:** Inspects `useReducedMotion()`. When active, continuous dash animation is replaced with static chevrons and gentle ambient glow.

---

### 2.3 Player Turn Highlighting

#### Local Player Prominent Profile (`LocalPlayerProfile.tsx`)
- Positioned prominently at the bottom rail of the round table directly adjacent to the interactive player hand.
- Displays:
  - User avatar with active pulsing turn indicator.
  - Username and `(You)` identifier.
  - Current match score and live hand card count.
  - Active `"YOUR TURN"` gold gradient pill (`data-testid="local-turn-badge"`) when active; `"WAITING"` pill when inactive.
  - UNO! declaration badge, UNO Teams badge, and UNO Flex power card status.

#### Opponent Profiles (`PlayerSeat.tsx`)
- Active opponent has gold glowing ring, elevated scale, and a dedicated `"PLAYING"` badge (`data-testid="playing-badge"`).
- Inactive opponents display clean score, card count, and variant status without visual clutter.
- Exactly one player exhibits the active turn highlight at any given moment.

---

## 3. Seating Layout Topologies

### 2-Player Layout (Head-to-Head)
```
          ┌───────────────────────────────┐
          │     [ Opponent (Top) ]        │
          │                               │
          │   ↻  [Draw]   [Discard]   ↻   │
          │                               │
          │     [ Local Player (You) ]    │
          └───────────────────────────────┘
            [ Player Hand & UNO Controls ]
```

### 3-Player Layout (Triangle)
```
          ┌───────────────────────────────┐
          │  [ Opponent 1 ]  [ Opponent 2]│
          │                               │
          │   ↻  [Draw]   [Discard]   ↻   │
          │                               │
          │     [ Local Player (You) ]    │
          └───────────────────────────────┘
            [ Player Hand & UNO Controls ]
```

### 4-Player Layout (Classic Diamond)
```
          ┌───────────────────────────────┐
          │         [ Opponent 2 ]        │
          │ [ Opp 1 ] [Center] [ Opp 3 ]  │
          │                               │
          │     [ Local Player (You) ]    │
          └───────────────────────────────┘
            [ Player Hand & UNO Controls ]
```

### 6-Player Layout (Hexagon / Teams)
```
          ┌───────────────────────────────┐
          │         [ Opponent 3 ]        │
          │  [ Opp 2 ]              [ Opp 4 ]
          │ [ Opp 1 ]   [Center]   [ Opp 5 ]
          │     [ Local Player (You) ]    │
          └───────────────────────────────┘
            [ Player Hand & UNO Controls ]
```

---

## 4. Full Variant Compatibility

All seven UNO Ultimate variants inherit the round-table layout seamlessly:
1. **Classic UNO:** Standard draw/discard piles, wild color selection, card play animations.
2. **UNO Flip:** Dynamic Dark Side / Light Side theme adjustments and Flip card triggers.
3. **UNO Show 'em No Mercy:** Stacking penalty banners, 25-card mercy elimination spectator banners, and Wild Reverse Draw 4 stacking.
4. **UNO All Wild:** Direct play without color pickers, Targeted Draw Two/Four modals, and Forced Swap modals.
5. **UNO Flex:** Power card status indicators (Green Check vs. Red X) rendered on local profile and opponent seats.
6. **UNO Teams:** Team membership badges (Team 1, Team 2, etc.) rendered on player profiles with partners seated opposite.
7. **UNO Attack:** Virtual Attack Launcher rendered in table center with motorized tension sound simulation and card burst animations.

---

## 5. Automated Verification Results

### 5.1 New Component Test Suites
- **`RoundTable.test.tsx` (17 tests, 100% passing):**
  - Clockwise opponent cycle ordering from local player.
  - Coordinate calculations across 1, 2, 3, 4, 5, and 6+ opponents.
  - Layout rendering across 2, 3, 4, and 6 player counts.
  - Local player turn highlighting (`YOUR TURN`).
  - Opponent turn highlighting (`PLAYING`).
  - Play direction indicator synchronization (Clockwise vs. Counter-Clockwise).
  - UNO Attack launcher integration.
  - UNO Teams team badges.
  - UNO Flex power card status badges.
- **`PlayDirectionIndicator.test.tsx` (4 tests, 100% passing):**
  - Clockwise direction rendering with cyan/emerald theme.
  - Counter-clockwise direction rendering with rose/amber theme.
  - Dynamic direction updates upon Reverse card play.
  - SVG elliptical orbit track rendering.

### 5.2 Monorepo Quality Gates
- **`apps/web` Tests:** 27 test files, **145 tests passed** (0 failed).
- **`packages/game-engine` Tests:** 29 test files, **386 tests passed** (0 failed).
- **`apps/server` Tests:** 22 test files, **153 tests passed** (0 failed).
- **Typecheck (`pnpm -r typecheck`):** Clean across all 6 packages (0 TypeScript errors).
- **Lint (`pnpm -r lint`):** Clean across all packages (0 errors, 0 warnings).
- **Production Build (`pnpm -r build`):** Clean builds for `@uno-ultimate/web` (Vite), `@uno-ultimate/server` (tsup), and all workspace packages.

---

## 6. Files Changed & Created

| File | Action | Purpose |
|---|---|---|
| `apps/web/src/features/game/components/PlayDirectionIndicator.tsx` | Created | Circular animated direction indicator with SVG orbit track and chevrons |
| `apps/web/src/features/game/components/LocalPlayerProfile.tsx` | Created | Prominent local player profile with "YOUR TURN" badge and status indicators |
| `apps/web/src/features/game/components/RoundTable.tsx` | Created | Oval table arena with dynamic perimeter seating and center piles |
| `apps/web/src/features/game/components/PlayerSeat.tsx` | Modified | Added `"PLAYING"` badge for active opponent highlight |
| `apps/web/src/features/game/components/GameBoard.tsx` | Modified | Integrated `RoundTable` into the main game board |
| `apps/web/src/features/game/components/__tests__/PlayDirectionIndicator.test.tsx` | Created | Unit tests for direction indicator and direction flipping |
| `apps/web/src/features/game/components/__tests__/RoundTable.test.tsx` | Created | 17 integration and seating geometry tests |
