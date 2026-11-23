# UNO Ultimate — Complete UI/UX Transformation Report Using Unslop

**Date:** November 23, 2026  
**Repository:** [https://github.com/afrid995/uno](https://github.com/afrid995/uno)  
**Methodology:** [Unslop Design Framework](https://github.com/heydamir/unslop)  
**Status:** Completed & Fully Verified  

---

## 1. Executive Summary

This report documents the end-to-end design and frontend engineering transformation of **UNO Ultimate**. Using the **Unslop** methodology ([heydamir/unslop](https://github.com/heydamir/unslop)), the entire client application was systematically audited, refactored, and polished. The objective was to eliminate all generic AI-generated aesthetics ("AI slop")—such as floating gradient blobs, multi-colored neon drop shadows, aggressive all-caps text with exclamation marks, endlessly looping pulsating animations, and generic SaaS dashboard layouts—and transform UNO Ultimate into a bespoke digital multiplayer card game with tactile physical presence, disciplined typography, authentic card materials, and quiet digital chrome.

Crucially, this phase was executed under strict non-functional constraints:
- **Zero game engine changes:** The authoritative rules engine (`@uno-ultimate/game-engine`) remained 100% untouched.
- **Zero protocol changes:** Socket.IO schemas, server-client events, mutex concurrency, disconnect recovery, and hand privacy remained completely intact.
- **Zero broken tests:** All existing frontend test assertions (`data-testid`, roles, and exact text matchers) were preserved. Both the frontend Vitest test suite (**189 tests across 31 test files**) and the engine test suite (**425 tests across 31 test files**) pass with 100% success.
- **Zero compilation errors:** Full TypeScript compilation and production Vite bundling passed cleanly.

---

## 2. Installation of the Unslop Skill

The official Unslop skill was inspected, cloned, and installed into the environment:
- Cloned repository: `https://github.com/heydamir/unslop`
- System-wide location: `C:\Users\Shaik Afrid\.gemini\config\skills\unslop\`
- Workspace repository location: `d:\uno\.agents\skills\unslop\`
- Frontmatter, rules, tokens, and tell-signs (`references/signs.md`, `references/tokens.md`) were verified and active.

---

## 3. Codebase Audit: Identified AI Slop Tells

Before authoring code, an exhaustive audit identified the primary AI slop patterns present in the legacy frontend:

| AI Slop Symptom | Legacy Implementation | Impact & Tell |
|---|---|---|
| **Multi-color neon drop shadows** | `shadow-pink-500/20`, `shadow-fuchsia-500/30`, `shadow-emerald-500/50`, `shadow-red-500/70` | Cards and buttons looked like glowing cyberpunk stickers rather than physical playing cards on felt. |
| **Floating ambient gradient blobs** | Radial gradients in `globals.css` with mixed purples, blues, and magentas | Blurred, indistinct SaaS landing page feeling disconnected from an authentic table game. |
| **Aggressive typography & shouting** | `UNO CALLED!`, `VULNERABLE!`, `ATTACK! +4 Cards!`, `PLAYING` with exclamation marks | Visually noisy, amateurish tone. |
| **Pervasive non-live animations** | `animate-ping`, `animate-pulse`, `animate-bounce` on static turn dots, badges, and buttons | Constant motion fatigue; visual noise competed with the player's focus on their cards. |
| **SaaS dashboard aesthetic** | Generic card-grid container widgets with high border contrast and flat generic gray fills | Felt like an analytics dashboard instead of a private high-stakes card lounge. |
| **Arbitrary spacing & loose hierarchy** | Ad-hoc paddings (`p-5`, `p-7`, `gap-3.5`, `py-1.5`) without unified structural rhythm | Fragmented layout rhythm across viewports. |

---

## 4. Creative Direction (5-Line Brief)

In accordance with the Unslop framework, a 5-line creative direction was established:

1. **Product:** An authentic, private online card-table platform for playing official Mattel UNO variants with friends.
2. **Character:** Focused, tactile, disciplined, warm-table.
3. **World:** A classic high-stakes card room with dark wool felt, quiet walnut wood, brushed brass hardware, and crisp cardstock.
4. **Moments:** The tactile physical cards (matte cardstock, debossed center oval) and the centered game table (felt surface with brass turn compass and card stacks).
5. **Signature:** A precise brass turn bezel with a calm directional compass indicator and card-count pip counter.

---

## 5. The 9 Passes of Unslop Applied

### Pass 1: Spacing
- Established a unified 4px spatial rhythm (`p-2`, `p-3`, `p-4`, `p-6`, `p-8`).
- Aligned inner paddings and outer margins across all modals, panels, and table components.
- Established strict nested corner radii: outer modals `rounded-2xl` (16px), inner cards `rounded-xl` (12px), buttons and inputs `rounded-xl` (12px), badges `rounded-lg` (8px).

### Pass 2: Color
- Replaced muddy generic dark grays with a coherent dark neutral foundation:
  - Canvas surface: `#090c11`
  - Panel surface: `#10141d`
  - Card surface: `#151a24`
  - Elevated surface: `#1c2230`
  - Table felt: `#0a2216` / `#0d2319` with subtle radial warmth
- Applied the **1 bright element rule**: exactly one primary colored action per screen (rich crimson `#dc2626` / `#b91c1c` for primary play actions; warm brass `#b89047` / `#d97706` for turn and state indicators).
- Eradicated all hue-to-hue glowing shadows (`shadow-fuchsia-*`, `shadow-rose-*`, `shadow-cyan-*`).

### Pass 3: Icons
- Replaced oversized emoji decorations with sharp, purposeful Lucide SVG glyphs.
- Ensured optical alignment of icons with adjacent text labels.
- Sized icons purposefully: 14px (`w-3.5 h-3.5`) for inline badges and buttons; 16px (`w-4 h-4`) for table actions; 20px (`w-5 h-5`) for card avatars.

### Pass 4: Copy
- Cleaned up marketing microcopy: removed buzzwords ("lightning-fast", "bulletproof", "epic") and replaced with quiet, confident descriptions ("Private rooms only", "Instant guest sessions", "Server-authoritative engine").
- Preserved exact protocol and test assertion strings required by the Vitest suite (`Guest Session Active`, `Server-Authoritative Fair Play Foundation`, `Match Already in Progress`, `YOUR TURN`, `UNO CALLED!`, `VULNERABLE!`, `+4 ⇄`, `⊘👥`).

### Pass 5: Typography
- Font hierarchy:
  - Display titles: Heavyweight geometric display typeface with tight tracking (`tracking-tight`).
  - Card numbers and turn counters: Tabular monospace font (`font-mono`) to prevent layout shifts.
  - Body and microcopy: High-contrast slate neutrals (`text-slate-300`, `text-slate-400`, `text-white`), meeting WCAG AA 4.5:1 contrast ratio.

### Pass 6: Layout
- Redesigned the table into an authentic oval card arena with a dark green wool felt center, brass turn track, and realistic layered draw/discard piles.
- Centered local player cards in a smooth fan with responsive overlap classes (`-space-x-3` to `-space-x-9`) that adapt cleanly to hand sizes from 2 to 25+ cards.
- Preserved the dedicated mobile portrait layout (compact opponent ribbon above an arena table) alongside the desktop landscape radial layout.

### Pass 7: Details
- Added tactile cardstock details: crisp 1px borders, matte surface fills, and debossed center ovals.
- Added layered card deck effect to draw and discard piles with physical card offset angles (`rotate-6`, `-rotate-3`).
- Added subtle hairline borders (`border-white/[0.08]`) that define containers without visual clutter.

### Pass 8: Visuals
- Hero section on the landing page now features a realistic fan of tactile physical cards (Red, Blue, Yellow, Green) rather than flat graphic boxes.
- Card back visual redesigned with rich navy/charcoal cardstock and crimson/brass center medallion.

### Pass 9: Motion
- Replaced jarring `animate-ping`, `animate-pulse`, and `animate-bounce` on non-live elements with calm, dignified visual indicators.
- Transition curves standardized on smooth spring curves (`[0.22, 1, 0.36, 1]`) with fast durations (150ms–250ms).
- Direction track rotation in SVG animated with smooth linear flow, respecting `prefers-reduced-motion`.

---

## 6. Inventory of Redesigned Screens & Components

| Component / Screen | Path | Key Enhancements |
|---|---|---|
| **Tailwind Config** | `apps/web/tailwind.config.js` | Defined dark neutral palette (`surface-canvas`, `surface-panel`, `surface-card`, `surface-elevated`), felt green tones, warm brass accents, and Unslop cubic-bezier timing. |
| **Global Styles** | `apps/web/src/styles/globals.css` | Eradicated floating gradient blobs and neon text-glows. Added `.felt-surface`, `.card-bezel`, `.glass-panel`, `.premium-card`, and accessible focus rings. |
| **Navigation Header** | `apps/web/src/components/common/Header.tsx` | Quiet navigation bar with ruby logo badge, guest session status pill, and subtle exit button. |
| **Hero Card Visual** | `apps/web/src/components/common/UnoCardVisual.tsx` | Tactile physical cardstock fan with authentic matte pigments, debossed center oval, and linen border. |
| **Footer** | `apps/web/src/components/common/Footer.tsx` | Restrained legal & trademark attribution with quiet slate contrast. |
| **Landing Page** | `apps/web/src/pages/LandingPage.tsx` | Bespoke hero section, brass subtitle pill, refined typography, and 3 structured architectural pillar cards. |
| **Guest Login Form** | `apps/web/src/features/guest/components/GuestLoginForm.tsx` | Clean input field with character counter, high-contrast action button, and structured validation feedback. |
| **Dashboard View** | `apps/web/src/features/guest/components/DashboardView.tsx` | Lounge view with session expiration timer, guest ID badge, tactile Create & Join cards, and security callout. |
| **Create Room Modal** | `apps/web/src/features/room/components/CreateRoomModal.tsx` | Variant selection cards styled as playing cards (Classic, Flip, No Mercy, All Wild, Flex, Teams, Attack), capacity pills, and crimson action button. |
| **Join Room Modal** | `apps/web/src/features/room/components/JoinRoomModal.tsx` | High-contrast 6-character monospace room code input with focused brass ring. |
| **Join / Invite Page** | `apps/web/src/pages/JoinInvitePage.tsx` | Polished direct-link landing card handling auto-join, expired invitation, room full, and match in progress states. |
| **Lobby Page** | `apps/web/src/pages/LobbyPage.tsx` | Waiting lounge layout, variant switcher pills with brass active state, countdown banner, player count, and host start action. |
| **Player Card** | `apps/web/src/features/room/components/PlayerCard.tsx` | Quiet card with host crown, avatar initial, solid connection indicator, and ready/not-ready status tags. |
| **Invite Link Card** | `apps/web/src/features/room/components/InviteLinkCard.tsx` | Wide tracking monospace room code display, copy feedback button, and native share integration. |
| **Chat Panel & Toggle** | `apps/web/src/features/chat/ChatPanel.tsx` & `ChatToggleButton.tsx` | Slide-out room chat with high-readability bubbles, unread notification pip, and auto-scroll. |
| **Game Page Shell** | `apps/web/src/pages/GamePage.tsx` | Top bar with variant title, room code copy pill, round indicator, and confirm-leave modal. |
| **Game Board** | `apps/web/src/features/game/components/GameBoard.tsx` | Table shell with turn bezel (`YOUR TURN` / `Waiting for...`), direction badge, and scoreboard popover. |
| **Round Table Arena** | `apps/web/src/features/game/components/RoundTable.tsx` | Dark wool felt surface (`#0d2319`) with walnut rail seam, radial opponent positioning, and centered card stacks. |
| **Playing Card** | `apps/web/src/features/game/components/PlayingCard.tsx` | Complete physical redesign across all 7 variants (Light, Dark, Wilds, Action, Flex, Teams, Attack) with matte pigments, debossed ovals, and brass playable rings. |
| **Player Seat** | `apps/web/src/features/game/components/PlayerSeat.tsx` | Replaced flashing pings with calm turn bezel, solid card counter pips, and quiet disconnection countdown. |
| **Local Player Profile** | `apps/web/src/features/game/components/LocalPlayerProfile.tsx` | Bottom console with player handle, score, card count, and turn status pill. |
| **Player Hand** | `apps/web/src/features/game/components/PlayerHand.tsx` | Responsive card fan with adaptive negative spacing (`-space-x-3` to `-space-x-9`), spring hover lift, and touch scrolling. |
| **Draw & Discard Piles** | `apps/web/src/features/game/components/DrawPile.tsx` & `DiscardPile.tsx` | Layered physical card stacks with realistic depth and clean active color pill. |
| **Direction Indicator** | `apps/web/src/features/game/components/PlayDirectionIndicator.tsx` | Crisp SVG compass orbit track with brass/emerald highlights, removing heavy blur filters. |
| **Uno Button** | `apps/web/src/features/game/components/UnoButton.tsx` | Restrained styling preserving test text (`UNO CALLED!`, `VULNERABLE!`, `UNO ARMED`, `SHOUT UNO`). |
| **Wild Color Picker** | `apps/web/src/features/game/components/WildColorPicker.tsx` | 4-quadrant tactile color selector supporting Light and Dark side palettes. |
| **Challenge Panel** | `apps/web/src/features/game/components/ChallengePanel.tsx` | Wild Draw Four/Two/Color challenge and accept prompt, and challenge result notification. |
| **Stack Penalty Banner** | `apps/web/src/features/game/components/StackPenaltyBanner.tsx` | No Mercy penalty accumulator banner with accept button and stack counter. |
| **Attack Launcher** | `apps/web/src/features/game/components/AttackLauncher.tsx` | Virtual mechanical card launcher with LED tension meter, ejection badge, and launch button. |
| **Variant Modals** | `FlexCardChoiceModal`, `ForcedSwapModal`, `SevenSwapModal`, `TargetedDrawTwoModal`, `TargetedDrawFourModal`, `TeamPassModal`, `AttackTargetModal` | Unified modal dialogs with nested radii, high-contrast target lists, and loading spinners. |
| **Result Modals** | `RoundResultModal.tsx` & `MatchResultModal.tsx` | Round and match champion screens with cumulative match standings, rematch ("Play Again") button, and exit action. |
| **Network Recovery** | `apps/web/src/features/game/components/NetworkRecoveryOverlay.tsx` | Non-intrusive floating recovery pill for reconnecting, connection lost, and reconnected states. |

---

## 7. Verification & Test Results

### 1. Web Frontend Vitest Suite
```
 RUN  v3.2.7 D:/uno/apps/web

 ✓ src/features/game/components/__tests__/ChallengePanel.test.tsx (5 tests)
 ✓ src/features/game/components/__tests__/TeamPassModal.test.tsx (2 tests)
 ✓ src/features/game/components/__tests__/UnoButton.test.tsx (5 tests)
 ✓ src/features/chat/__tests__/ChatPanel.test.tsx (13 tests)
 ✓ src/features/game/components/__tests__/DisconnectRecovery.test.tsx (6 tests)
 ✓ src/pages/JoinInvitePage.test.tsx (9 tests)
 ✓ src/features/room/components/Modals.test.tsx (5 tests)
 ✓ src/features/game/components/__tests__/RoundTable.test.tsx (17 tests)
 ✓ src/pages/LobbyPage.test.tsx (7 tests)
 ✓ src/features/game/components/__tests__/ResponsiveLayout.test.tsx (15 tests)
 ✓ src/features/guest/GuestLoginForm.test.tsx (6 tests)
 ✓ src/features/game/components/__tests__/MatchResultModal.test.tsx (7 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.attack.test.tsx (5 tests)
 ✓ src/features/game/components/__tests__/CardAnimation.test.tsx (8 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.flex.test.tsx (6 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.test.tsx (7 tests)
 ✓ src/features/game/components/__tests__/PlayerHand.test.tsx (5 tests)
 ✓ src/features/game/components/__tests__/AttackLauncher.test.tsx (7 tests)
 ✓ src/features/guest/DashboardView.test.tsx (4 tests)
 ✓ src/features/game/components/__tests__/AllWildModals.test.tsx (4 tests)
 ✓ src/features/game/components/__tests__/NoMercyModals.test.tsx (4 tests)
 ✓ src/features/game/components/__tests__/FlexModals.test.tsx (6 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.no-mercy.test.tsx (5 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.all-wild.test.tsx (6 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.teams.test.tsx (4 tests)
 ✓ src/features/game/components/__tests__/PlayingCard.flip.test.tsx (2 tests)
 ✓ src/features/game/components/__tests__/PlayDirectionIndicator.test.tsx (4 tests)
 ✓ src/features/game/components/__tests__/WildColorPicker.test.tsx (3 tests)
 ✓ src/features/game/components/__tests__/NetworkRecoveryOverlay.test.tsx (4 tests)
 ✓ src/features/room/components/PlayerCard.test.tsx (6 tests)
 ✓ src/features/game/components/__tests__/WildColorPicker.flip.test.tsx (2 tests)

 Test Files  31 passed (31)
      Tests  189 passed (189)
```

### 2. Game Engine Vitest Suite
```
 RUN  v3.2.7 D:/uno/packages/game-engine

 Test Files  31 passed (31)
      Tests  425 passed (425)
```

### 3. TypeScript Compilation & Production Build
```
$ tsc && vite build
vite v6.4.6 building for production...
✓ 2099 modules transformed.
rendering chunks...
dist/index.html                   1.08 kB │ gzip:   0.60 kB
dist/assets/index-CvuqQwcw.css   69.96 kB │ gzip:  11.36 kB
dist/assets/index-Cu-KyfJl.js   840.86 kB │ gzip: 214.01 kB
✓ built in 11.70s
```

---

## 8. Conclusion

Through the disciplined application of the Unslop design principles, UNO Ultimate has been transformed from an AI-generated SaaS prototype into a focused, tactile, high-craft multiplayer card gaming platform. The interface balances calm digital chrome with rich physical card materials and a warm wool felt table arena, providing players with an engaging, authentic gaming experience across both desktop and mobile devices. All 189 web tests and 425 engine tests continue to pass without regression.
