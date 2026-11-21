# UNO Ultimate — Mobile Portrait & Landscape Adaptive Gameplay Verification Report

## Executive Summary

This report documents the design, implementation, and automated verification of the responsive, adaptive mobile gameplay layout system for **UNO Ultimate**. The implementation addresses seamless screen rotation between portrait and landscape orientations, dynamic viewport units, mobile safe-area insets, and compact card hand adaptations across all seven supported UNO variants.

---

## 1. Architectural Overview & Design Decisions

### 1.1 Viewport Isolation & Screen Real Estate Maximization
- **Meta Viewport Enhancement**: Added `viewport-fit=cover` to `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />` in `apps/web/index.html`. This enables CSS environment variables (`env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, etc.) on iOS and Android devices equipped with notches, Dynamic Islands, and curved screen corners.
- **Header & Footer Route Isolation (`App.tsx`)**:
  - Previously, the global marketing header (64px) and footer (~100px) rendered unconditionally across all routes, consuming over 160px of vertical space during active gameplay.
  - In mobile portrait (667px–844px height) and especially mobile landscape (375px–420px height), this severely compressed the gameplay felt and forced vertical scrolling.
  - On `/game/:roomCode` routes, the global marketing header and footer are now suppressed (`{!isGameRoute && <Header />}`, `{!isGameRoute && <Footer />}`).
  - `GamePage` retains its own compact, dedicated gameplay bar (room code copy badge, variant indicator, active round, chat toggle, leave match modal).
  - The game container now utilizes `h-[100dvh] max-h-[100dvh] overflow-hidden` to completely prevent document-level jitter and browser bar jumping.

### 1.2 Reactive Orientation Detection (`useOrientation` Hook)
- Located at `apps/web/src/features/game/hooks/useOrientation.ts`.
- **Capabilities**:
  - Dynamically calculates:
    - `isPortrait`: `boolean` (via `window.matchMedia('(orientation: portrait)')` and fallback aspect ratio `height > width`)
    - `isLandscape`: `boolean` (`!isPortrait`)
    - `orientation`: `'portrait' | 'landscape'`
    - `width`, `height`: number (window viewport dimensions)
    - `isMobile`: `boolean` (`width < 768 || height < 500`)
    - `isSmallMobile`: `boolean` (`width <= 375`)
    - `isCompactHeight`: `boolean` (`height < 520`, e.g., mobile phones in landscape mode)
  - Subscribes reactively to `window.addEventListener('resize')`, `window.addEventListener('orientationchange')`, `screen.orientation?.addEventListener('change')`, and `MediaQueryList.addEventListener('change')`.
  - **Zero Disruption Guarantee**: Rotating the device dynamically updates the React state and CSS layout instantly without triggering full page reloads, WebSocket reconnections, match restarts, or state loss.

---

## 2. Layout Implementations

### 2.1 Dedicated Portrait Mode Layout (`RoundTable.tsx`)
In portrait mode (`isPortrait === true`), the gameplay layout transitions into a vertically structured, non-overlapping design:

1. **Top Opponents Ribbon (`data-testid="portrait-opponents-ribbon"`)**:
   - Opponents are displayed in a compact horizontal bar across the top of the table.
   - For 1 opponent (2 players): Centered compact player seat.
   - For 2–4 opponents: Centered flex row with responsive gap.
   - For 5+ opponents (6–8 players): Smooth horizontal scrolling ribbon with `touch-pan-x` and `no-scrollbar`.
   - Each compact `PlayerSeat` displays:
     - Avatar with active turn pulsing ring and ping indicator.
     - Username (truncated) and score.
     - Card count pill (`🎴 count`).
     - Turn badge (`TURN` / `PLAYING`).
     - Disconnect countdown timer and elimination indicator.
     - Variant-specific badges (UNO Flex Power status `⚡`, UNO Teams team badge).
     - Prominent "CATCH" button when opponent is vulnerable to an UNO call.
2. **Center Arena (Felt Table)**:
   - Sized at `h-[210px] xs:h-[230px] sm:h-[270px]` with rounded border, radial felt glow, and inner seam line.
   - Circular `PlayDirectionIndicator` orbit scaled to fit portrait width.
   - Center Piles: Draw pile (or `AttackLauncher` in UNO Attack) and Discard pile with active color badge.
   - Status Overlays: Turn recovery banner, Starting wild choice banner, Stack penalty banner, Challenge panel.
3. **Local Player Profile**:
   - Positioned cleanly at the bottom rail of the table area, displaying avatar, username, "(You)", score, hand card count, and animated "YOUR TURN" badge.
4. **Action Controls Row**:
   - Positioned right above the player hand:
     - `UnoButton` (Shout UNO, UNO Armed, UNO Called, Vulnerable)
     - Drawn card action buttons (`Play Drawn Card` / `Keep Card / End Turn` / `Pass Turn`)
     - Hand card count badge
     - Dynamic touch targets with responsive scaling (`text-[11px] sm:text-xs py-1.5 sm:py-2 px-3 sm:px-4`).
5. **Private Player Hand (`PlayerHand.tsx`)**:
   - Passes `cardSize="sm"` in portrait and mobile modes.
   - Implements dynamic overlap calculation based on hand size:
     - $\le 4$ cards: `-space-x-2 sm:-space-x-3`
     - $5 - 7$ cards: `-space-x-4 sm:-space-x-5`
     - $8 - 13$ cards: `-space-x-6 sm:-space-x-7`
     - $\ge 14$ cards (e.g., 25+ cards in No Mercy): `-space-x-7 sm:-space-x-9`
   - Smooth horizontal scrolling container (`overflow-x-auto no-scrollbar overscroll-contain touch-pan-x`) guarantees that cards never horizontally stretch or break the viewport.

### 2.2 Preserved Landscape Mode Layout (`RoundTable.tsx`)
In landscape mode (`isPortrait === false`), the classic oval table layout is preserved:
- Opponents seated along the upper elliptical table perimeter via `getOpponentPosition`.
- Direction indicator orbit track and center piles.
- Local player profile centered along the bottom table rail.
- **Mobile Landscape Optimization**:
  - On phones held in landscape mode (height 375px–420px), table height is constrained to `h-[230px] xs:h-[270px] sm:h-[380px] md:h-[460px] lg:h-[500px]` with `max-h-[55vh] sm:max-h-[62vh] md:max-h-none`.
  - Opponents scale down smoothly (`scale-75 xs:scale-80 sm:scale-95 md:scale-100`).
  - Completely prevents vertical overflow and clipping on mobile landscape viewports.

---

## 3. Seven Variant Compatibility Matrix

| Variant | Landscape Adaptation | Portrait Adaptation |
|---|---|---|
| **Classic UNO** | Standard oval table, clockwise/counter-clockwise orbit, active color indicator | Compact top ribbon, centered compact felt, scaled orbit |
| **UNO Flip** | Light/Dark side theme & active side indicator in header bar | Compact side badge (`🌙 DARK SIDE` / `☀️ LIGHT SIDE`), dynamic card contrast |
| **UNO Show 'em No Mercy** | Stack penalty banner, 25+ elimination spectator banner | Stack attack penalty banner fits in center arena; 20+ card hands use compact overlap (`-space-x-7 sm:-space-x-9`) |
| **UNO All Wild** | Wild actions, All Wild variant banner | Compact variant badge, wild target modals render centered |
| **UNO Flex** | Flex power card status (`✓ POWER ACTIVE` / `✗ POWER USED`) | Compact power indicator (`⚡` / `✗`) in opponent seats and top header |
| **UNO Teams** | Team badges (`TEAM A` / `TEAM B`), partner passing modals | Compact team pills (`T1` / `T2`) on seats; passing modal responsive |
| **UNO Attack** | Virtual `AttackLauncher` replaces draw pile with LED lights | `AttackLauncher` scaled neatly inside portrait center arena |

---

## 4. Test Verification Results

### 4.1 Automated Web Tests (`vitest run`)
- **Total Test Files**: 30 passed (30)
- **Total Tests**: 185 passed (185)
- **New Test Suite**: `apps/web/src/features/game/components/__tests__/ResponsiveLayout.test.tsx` (15 dedicated tests covering orientation detection, rotation, ribbon rendering, turn highlighting, catch uno, hand overlap, and variant compatibility).

```
Test Files  30 passed (30)
     Tests  185 passed (185)
  Duration  34.11s
```

### 4.2 Game Engine Tests (`packages/game-engine`)
- **Total Test Files**: 31 passed (31)
- **Total Tests**: 425 passed (425)

### 4.3 Static Type Checking & Linting
- `pnpm -r typecheck`: **0 errors across all 6 packages and apps** (`database`, `packages/shared`, `packages/game-engine`, `packages/game-protocol`, `apps/server`, `apps/web`).
- `pnpm -r lint`: **0 errors** across all packages and apps.
- `pnpm build`: Production build succeeded with all bundles compiled and minified.
