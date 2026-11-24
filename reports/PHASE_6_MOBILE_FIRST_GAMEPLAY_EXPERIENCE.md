# UNO Ultimate — Phase 6: Mobile-First Gameplay Experience, Touch Interactions, Adaptive Card Hands, Immersive Layouts & PWA Readiness

---

## 1. Executive Summary

Phase 6 delivers a complete, production-grade **Mobile-First Gameplay Experience** for **UNO Ultimate**. Building directly upon the Unslop dark felt aesthetic and Phase 5 motion/audio architecture, this phase solves critical touch-screen ergonomic challenges and elevates mobile play to the same standard of craftsmanship enjoyed on desktop:

1. **Touch vs. Scroll Discrimination in Card Hands:** Implemented precise pointer discrimination in [PlayerHand.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayerHand.tsx). Horizontal swiping through a large hand (tested up to 25+ cards in UNO Show 'em No Mercy) tracks total pointer displacement (> 8px movement marks a drag); synthetic clicks following a drag gesture are suppressed for 60ms, ensuring accidental card plays never occur while navigating a dense hand. Stationary taps play cards immediately.
2. **Touch vs. Hover Discrimination:** Eliminated "sticky hover" elevation on mobile devices in [PlayingCard.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayingCard.tsx) by checking `window.matchMedia('(hover: hover) and (pointer: fine)')`. Hover elevation (`y: -8px`) is strictly reserved for fine pointer devices (mice, trackpads), while touch devices receive instantaneous tactile compression (`scale: 0.96`), light haptic feedback (10ms vibration), and high-contrast brushed brass playable indicators (`ring-2 ring-amber-400`).
3. **Adaptive Mobile Layouts (Portrait & Landscape):** Preserved the dedicated compact mobile portrait view (compact opponent ribbon at top, centered felt arena, bottom local hand) and preserved the authentic elliptical round table in landscape mode (`844x390`). The entire interface utilizes modern dynamic viewport units (`h-dvh`, `max-h-dvh`) and safe-area insets (`viewport-fit=cover`, `safe-bottom`) to prevent clipping under notches, dynamic islands, or virtual home bars.
4. **Responsive Mobile Chat Bottom Sheet:** Refactored [ChatPanel.tsx](file:///d:/uno/apps/web/src/features/chat/ChatPanel.tsx) from a desktop-only popover into a responsive bottom sheet on mobile (`fixed inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-20 sm:right-6 w-full sm:w-96 h-[70dvh] sm:h-[460px] safe-bottom`). Added a tactile pill grab handle and mobile-optimized keyboard attributes (`inputMode="text"`, `enterKeyHint="send"`).
5. **Audio Deduplication & Server Synchronization:** Eliminated duplicate reverse audio playback by removing the redundant trigger from [PlayDirectionIndicator.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayDirectionIndicator.tsx) (centralizing reverse audio strictly in `cardAnimationStore.ts`). Synced the UNO shout fanfare and haptic pulse in [UnoButton.tsx](file:///d:/uno/apps/web/src/features/game/components/UnoButton.tsx) directly to authoritative server confirmation (`hasDeclaredUno` transition).
6. **Safe PWA Readiness:** Configured [manifest.webmanifest](file:///d:/uno/apps/web/public/manifest.webmanifest) with theme color `#090c11`, standalone display, and vector icons; maintained a strict architectural boundary that live multiplayer games require authoritative server connection and never falsely claim offline play.
7. **Comprehensive Verification:** 
   - **Frontend Test Suite:** 213 tests passed across 33 test suites (100% pass rate).
   - **Game Engine Test Suite:** 425 tests passed across 31 test suites (100% pass rate).
   - **Total Tests:** 638 automated tests passing.
   - **TypeScript & Build:** Zero TypeScript compiler diagnostics (`tsc --noEmit`); clean production build in 9.46s (main entry chunk: 74.43 kB).
   - **Real-Browser Visual QA:** Executed automated Playwright test across mobile portrait (390x844), landscape (844x390), and tablet viewports, generating 7 visual evidence screenshots in `reports/screenshots/phase-6/`.

---

## 2. Codebase Audit of Existing Mobile & Gameplay Architecture

Before writing Phase 6 code, a full audit of mobile styling, touch listeners, and gesture handling was conducted:

| Component / Subsystem | Initial Status | Mobile Limitation Identified | Phase 6 Resolution |
| :--- | :--- | :--- | :--- |
| `index.html` viewport | `viewport-fit=cover` absent | Notch and home indicator encroached on player hand and top bar | Added `viewport-fit=cover`, `apple-mobile-web-app-capable`, `theme-color: #090c11`, and PWA links |
| `globals.css` | Standard `h-screen` / `min-h-screen` | Mobile address bar caused 100vh jumping and bottom clipping | Added `.h-dvh`, `.max-h-dvh`, and `.touch-tap` (`touch-action: manipulation`) utilities |
| `PlayingCard.tsx` | Fixed `whileHover={{ y: -8 }}` | Touch taps left cards elevated ("sticky hover") on iOS Safari / Chrome Mobile | Added `canHover` check via `(hover: hover) and (pointer: fine)` matchMedia |
| `PlayerHand.tsx` | Native click handler on card container | Swiping horizontally across hand triggered unintentional card plays | Added pointer-tracking gesture detector: > 8px drag suppresses click for 60ms |
| `PlayDirectionIndicator.tsx` | Called `soundService.play('reverse')` | Fired concurrently with `cardAnimationStore`, causing jarring double audio | Removed duplicate audio call; central audio authority retained in animation store |
| `UnoButton.tsx` | Fired audio on local click | Click could fail or get rejected by server, yet play celebratory sound | Re-anchored sound and haptic pulse strictly to server-confirmed `hasDeclaredUno` state |
| `ChatPanel.tsx` | Floating box (`bottom-20 right-6 w-96`) | Cluttered screen and clipped off-edge on portrait viewports < 400px | Redesigned into responsive bottom sheet (`70dvh`, rounded top, grab handle, safe area) |
| Web App Manifest | Missing | No installable metadata or theme color synchronization | Added `manifest.webmanifest` and configured standalone display parameters |

---

## 3. Mobile Viewport & Safe-Area Ergonomics

### Viewport Configuration ([index.html](file:///d:/uno/apps/web/index.html))

The HTML entry point was upgraded with complete viewport and PWA metadata:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<meta name="theme-color" content="#090c11" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="UNO Ultimate" />
<link rel="apple-touch-icon" href="/card-icon.svg" />
<link rel="manifest" href="/manifest.webmanifest" />
```

### CSS Safe-Area & Touch Utility Classes ([globals.css](file:///d:/uno/apps/web/src/styles/globals.css))

Modern mobile CSS rules were introduced to eliminate mobile layout instability:

```css
/* Touch interaction optimization: prevents 300ms delay and gray highlight tap box */
.touch-tap {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

/* Dynamic Viewport Height utilities for iOS Safari / Android Chrome */
.h-dvh {
  height: 100vh;
  height: 100dvh;
}

.max-h-dvh {
  max-height: 100vh;
  max-height: 100dvh;
}

/* Safe area padding utilities for notches, dynamic islands, and home indicators */
.safe-top {
  padding-top: max(env(safe-area-inset-top, 0px), 12px);
}

.safe-bottom {
  padding-bottom: max(env(safe-area-inset-bottom, 0px), 12px);
}
```

---

## 4. Touch vs. Scroll Discrimination & Tactile Card Interactions

### Drag vs. Tap Discrimination ([PlayerHand.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayerHand.tsx))

A significant problem in mobile card games is accidental card plays occurring when a user drags their thumb horizontally to inspect their cards. In Phase 6, a pointer-tracking discrimination state machine was engineered:

```tsx
const pointerStartXRef = useRef<number | null>(null);
const pointerStartYRef = useRef<number | null>(null);
const isDraggingRef = useRef<boolean>(false);
const dragTimeoutRef = useRef<NodeJS.Timeout | null>(null);

const handlePointerDown = (e: React.PointerEvent) => {
  pointerStartXRef.current = e.clientX;
  pointerStartYRef.current = e.clientY;
  isDraggingRef.current = false;
};

const handlePointerMove = (e: React.PointerEvent) => {
  if (pointerStartXRef.current !== null && pointerStartYRef.current !== null) {
    const deltaX = Math.abs(e.clientX - pointerStartXRef.current);
    const deltaY = Math.abs(e.clientY - pointerStartYRef.current);
    // If movement exceeds 8px in any direction, mark as a scroll drag
    if (deltaX > 8 || deltaY > 8) {
      isDraggingRef.current = true;
    }
  }
};

const handlePointerUp = () => {
  pointerStartXRef.current = null;
  pointerStartYRef.current = null;
  // Hold dragging flag for 60ms to absorb the subsequent synthetic click event
  if (dragTimeoutRef.current) clearTimeout(dragTimeoutRef.current);
  dragTimeoutRef.current = setTimeout(() => {
    isDraggingRef.current = false;
  }, 60);
};

const handleCardClick = (card: Card, isPlayable: boolean) => {
  if (isDraggingRef.current) return; // Suppress play during scroll
  if (!isPlayable || !isCurrentTurn) return;
  onPlayCard(card);
};
```

### Pointer Hover vs. Touch Tap Handling ([PlayingCard.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayingCard.tsx))

To prevent sticky hover on touch devices, cards dynamically inspect media capabilities:

```tsx
const [canHover, setCanHover] = useState(false);

useEffect(() => {
  const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  setCanHover(mediaQuery.matches);
  const listener = (e: MediaQueryListEvent) => setCanHover(e.matches);
  mediaQuery.addEventListener('change', listener);
  return () => mediaQuery.removeEventListener('change', listener);
}, []);

// Hover is applied only if pointer device supports fine hovering
const interactionVariants = {
  hover: canHover ? { y: -8, scale: 1.02 } : {},
  tap: { scale: 0.96 },
};
```

When tapped on a touch screen, cards trigger `triggerHaptic('light')` (10ms vibration on Android/supported devices) and immediately animate with tactile spring compression (`scale: 0.96`).

---

## 5. Audio Deduplication & Event Synchronization

### Elimination of Duplicate Reverse Audio

In Phase 5, `cardAnimationStore.ts` dispatched `soundService.play('reverse')` whenever a reverse card animation triggered. Concurrently, `PlayDirectionIndicator.tsx` listened to game state direction changes and also triggered `soundService.play('reverse')`, resulting in an echo / duplicate sound.

In Phase 6, the redundant audio trigger was excised from [PlayDirectionIndicator.tsx](file:///d:/uno/apps/web/src/features/game/components/PlayDirectionIndicator.tsx):
- `cardAnimationStore` remains the sole, synchronized authority for reverse card audio playback.
- `PlayDirectionIndicator` focuses purely on high-performance SVG track rotation and visual cues.

### Server-Confirmed UNO Shout

[UnoButton.tsx](file:///d:/uno/apps/web/src/features/game/components/UnoButton.tsx) was refactored so that `soundService.play('uno_shout')` and `triggerHaptic('success')` are strictly bound to server confirmation:
- When the button is clicked, it emits `callUno()` across the socket.
- A reactive `useEffect` monitors the local player's `hasDeclaredUno` boolean in the game state.
- When `hasDeclaredUno` transitions from `false` to `true`, the fanfare audio and success haptic pulse trigger simultaneously.
- If the call is rejected by the server (e.g. player called too early or was already caught), no misleading celebratory sound is played.

---

## 6. Mobile Chat Panel Transformation

[ChatPanel.tsx](file:///d:/uno/apps/web/src/features/chat/ChatPanel.tsx) was redesigned with an adaptive layout:
- **Mobile (< 640px):** Formats as a native bottom sheet pinned to `bottom-0`, spanning 100% width, `70dvh` height (with `max-h-[85dvh]` boundary), with `rounded-t-3xl` and `safe-bottom` padding.
- **Grab Handle:** Features a centered rounded pill grab handle (`w-12 h-1.5 rounded-full bg-slate-700/80 mb-2`) signaling bottom sheet ergonomics.
- **Virtual Keyboard Optimization:** Textarea attributes include `inputMode="text"`, `enterKeyHint="send"`, and `rows={1}`, ensuring mobile keyboards display a clean action key and do not obscure the conversation stream.
- **Desktop (>= 640px):** Retains the floating card room popover (`bottom-20 right-6 w-96 h-[460px]`).

---

## 7. Safe PWA Readiness & Offline Boundary

A valid web application manifest was deployed at [apps/web/public/manifest.webmanifest](file:///d:/uno/apps/web/public/manifest.webmanifest):

```json
{
  "name": "UNO Ultimate",
  "short_name": "UNO",
  "description": "Real-time multiplayer UNO card game with authentic rules and elegant tactile design.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#090c11",
  "background_color": "#090c11",
  "categories": ["games", "entertainment"],
  "icons": [
    {
      "src": "/card-icon.svg",
      "sizes": "any",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}
```

### Architectural Policy on Offline Gameplay
UNO Ultimate is an authoritative multiplayer game driven by real-time Socket.IO events and PostgreSQL state persistence. To maintain absolute integrity:
- PWA metadata allows clean home-screen installation and chrome-free standalone display.
- Caching service workers are intentionally **not** configured to intercept dynamic game traffic or simulate fake offline multiplayer, preventing desynchronization, stale client caching, and socket reconnection deadlocks.

---

## 8. Real-Browser Mobile Verification & Screenshot Inventory

Automated end-to-end browser testing was executed via [apps/web/scripts/phase-6-verification.mjs](file:///d:/uno/apps/web/scripts/phase-6-verification.mjs) utilizing Playwright and Chromium. All 7 visual verification screenshots were generated in `reports/screenshots/phase-6/`:

| Screenshot File | Viewport & Device Profile | Description & Visual Evidence |
| :--- | :--- | :--- |
| `mobile-portrait-gameplay.png` | 390x844 (iPhone 14 Portrait) | Compact opponent ribbon at top with avatars and card counters; dark wool felt center arena with discard and draw piles; local player profile with turn timer; horizontally scrollable card hand with tactile brass border. |
| `mobile-landscape-gameplay.png` | 844x390 (Mobile Landscape) | Preserved elliptical round table layout; radial opponent placement with dynamic perspective; centered discard arena and play direction indicator; bottom-docked card hand. |
| `mobile-chat-bottom-sheet.png` | 390x844 (iPhone 14 Portrait) | Responsive bottom sheet open at 70dvh height; centered grab handle; unslop slate palette; chat messages container; virtual keyboard text input with "send" hint. |
| `mobile-audio-popover.png` | 390x844 (iPhone 14 Portrait) | Audio settings popover open from top mobile navigation header; Radix/shadcn volume slider with brass thumb; mute toggle switch; sound preview trigger. |
| `mobile-touch-interaction.png` | 390x844 (Touch Simulation) | Active card tap compression (`scale: 0.96`); brass focus ring; absence of sticky hover elevation; immediate tactile responsiveness. |
| `mobile-hand-scroll.png` | 390x844 (Touch Simulation) | Horizontal scroll state of card hand; smooth card overlap reflow; suppression of accidental card play clicks during swipe. |
| `mobile-tablet-gameplay.png` | 768x1024 (iPad Portrait) | Adaptive responsive scaling between phone and desktop; balanced felt table proportions; comfortable thumb targets for all interactive actions. |

---

## 9. Automated Test Matrix & Build Verification

### Web Frontend Test Suite (`@uno-ultimate/web`)

Ran `pnpm --filter @uno-ultimate/web test -- --run`:

```
Test Files  33 passed (33)
     Tests  213 passed (213)
  Duration  59.37s
```

### Game Engine Test Suite (`@uno-ultimate/game-engine`)

Ran `pnpm --filter @uno-ultimate/game-engine test`:

```
Test Files  31 passed (31)
     Tests  425 passed (425)
  Duration  3.72s
```

### Combined Verification Summary

- **Total Test Suites:** 64
- **Total Passing Tests:** 638
- **TypeScript Compilation:** Zero errors (`tsc --noEmit` exited with code 0).
- **Production Build:** Succeeded in 9.46s with optimized bundle chunks:
  - `dist/assets/index-BKot36jP.js`: 74.43 kB (gzip: 21.73 kB)
  - `dist/assets/GamePage-CdQ-YQVG.js`: 104.15 kB (gzip: 22.66 kB)
  - `dist/assets/vendor-radix-oPHEwi2h.js`: 116.70 kB (gzip: 36.16 kB)
  - `dist/assets/vendor-motion-BdJahUCs.js`: 128.97 kB (gzip: 42.40 kB)

---

## 10. Performance, Accessibility & Touch Usability Verification

1. **Touch Target Sizing:** All mobile action buttons (Draw Pile, Uno Button, Chat Toggle, Audio Settings, Color Pickers) strictly exceed the 44x44px minimum touch target recommendation (WCAG 2.5.5 / Apple HIG).
2. **Gesture Collision Prevention:** Horizontal swipe gestures in the player hand are isolated from browser back/forward history navigation via `touch-action: pan-x`.
3. **Double-Tap Zoom Elimination:** All interactive card elements carry `.touch-tap` (`touch-action: manipulation`), completely eliminating the 300ms mobile browser tap delay and preventing double-tap zoom interference.
4. **Contrast & Aesthetics:** Preserved the Unslop dark wool felt (`#0a2216`), deep background (`#090c11`), brushed brass (`#b89047`), and rich card colors across all viewport dimensions.
5. **No Engine Rule Changes:** Zero changes were made to authoritative game engine rules (`packages/game-engine`) or network protocol schemas (`packages/game-protocol`).

---

## 11. Git Publication & Deployment Verification

1. **Repository:** https://github.com/afrid995/uno
2. **Branch:** `main`
3. **Commit Subject:** `feat(web): enhance mobile gameplay and adaptive touch interactions`
4. **Artifacts Published:**
   - [haptics.ts](file:///d:/uno/apps/web/src/lib/haptics.ts)
   - [manifest.webmanifest](file:///d:/uno/apps/web/public/manifest.webmanifest)
   - [phase-6-verification.mjs](file:///d:/uno/apps/web/scripts/phase-6-verification.mjs)
   - [PHASE_6_MOBILE_FIRST_GAMEPLAY_EXPERIENCE.md](file:///d:/uno/reports/PHASE_6_MOBILE_FIRST_GAMEPLAY_EXPERIENCE.md)
   - Screenshots in [reports/screenshots/phase-6/](file:///d:/uno/reports/screenshots/phase-6/)
