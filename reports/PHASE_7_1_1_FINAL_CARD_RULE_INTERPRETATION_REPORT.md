# UNO Ultimate — Phase 7.1.1: Final-Card Rule Interpretation Audit & Forced Swap Winner Correction Report

**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `0d5cba166401c3a013ad7af667d0d2ef6fffa006`  
**Phase:** 7.1.1 — Final-Card Rule Interpretation Audit & Forced Swap Winner Correction  
**Primary Rules Authority:** Mattel UNO All Wild Card Game (Product HHL33, `HHL33-UNO Wild-Eng.pdf`)  
**Official Rule URL:** https://service.mattel.com/instruction_sheets/HHL33-UNO%20Wild-Eng.pdf  

---

## 1. Executive Summary

Phase 7.1 audited and resolved an initial defect where playing a final action card in **UNO All Wild (Mattel HHL33)** bypassed action execution. However, Phase 7.1 introduced an unsupported conclusion: that playing a **Wild Forced Swap** as a final card must execute a hand exchange between the player's empty hand (0 cards) and an opponent's hand ($N \ge 1$ cards), thereby awarding round victory to the *chosen opponent* rather than the player who emptied their hand.

Phase 7.1.1 conducts a rigorous, text-by-text legal and mechanical re-audit of the official Mattel HHL33 instruction sheet, cross-referenced with Mattel's published rulings on equivalent cards across the UNO franchise.

### Key Conclusions:
1. **Explicit Mattel Rules Text:**  
   - *"Object: Be first to get rid of all the cards in your hand."* (HHL33, Page 1)  
   - *"Winning: When a player plays their final card, they win. Time to shuffle the cards and play again!"* (HHL33, Page 3)
2. **What Official HHL33 Rules DO NOT Specify:**  
   The official HHL33 sheet contains **no clause** stating that a player who plays a Forced Swap as their final card gives away their empty hand or hands an unearned victory to an opponent. Nor does HHL33 contain the classic 42001 final-card penalty draw execution clause.
3. **Franchise Precedent & Official Mattel Rulings:**  
   Mattel official rules enforcement (e.g., official Mattel customer support and `@realUNOgame` rulings on Wild Swap Hands) explicitly states: **If you play a Swap Hands card as your last card, you win immediately; the swap action does not occur because you have no cards left to swap and the round is already over.**
4. **Game Design & Kingmaking Prevention:**  
   Allowing a final Forced Swap to transfer victory to the chosen target produces severe game-theoretic distortions, forcing a player who legitimately emptied their hand to arbitrarily choose which opponent wins the game (kingmaking).
5. **Architectural Correction:**  
   In `packages/game-engine/src/variants/all-wild/all-wild.actions.ts`, playing `wild_forced_swap` when `nextHand.length === 0` leaves `pendingActionState = null`, immediately declaring the active player the round winner via `handleRoundVictory()`. Opponents' hands are scored for the winner as they stand.

---

## 2. Textual & Rules Evidence Matrix

| Area | Official Mattel HHL33 Rule Text | What Is NOT Specified in HHL33 | Franchise Precedent / Official Support | System Implementation (Phase 7.1.1 Policy) |
| :--- | :--- | :--- | :--- | :--- |
| **Object of Game** | *"Be first to get rid of all the cards in your hand."* (p. 1) | No exceptions for specific action card types. | Universal across all UNO editions. | First player to discard their final valid card achieves goal. |
| **Winning Condition** | *"When a player plays their final card, they win. Time to shuffle the cards and play again!"* (p. 3) | No clause delaying victory for swap action or declaring target winner. | Standard rule across modern UNO variants. | Victory is awarded to the player who played the final card. |
| **Wild Forced Swap Effect** | *"When you play this card, you MUST choose another player and swap hands with them."* (p. 2) | Silent on whether swap occurs if hand size is 0 upon play. | Mattel official ruling (@realUNOgame): swap cannot occur with 0 cards; player wins immediately. | When `nextHand.length === 0`, swap is voided; active player wins immediately. When `nextHand.length > 0`, swap executes normally. |
| **Wild Draw Two & Draw Four** | *"Next player... must draw 2 [or 4] cards and loses their turn."* (p. 2) | HHL33 lacks classic 42001 final-card penalty clause ("If the last card played... the next player must draw..."). | Classic UNO 42001 rules explicitly enforce final penalty draw to maximize winner's score. | Retained: Next player draws penalty cards before score is totaled for the winner. |
| **Wild Targeted Draw Two** | *"Choose ANY player... they must draw 2 cards. But they do NOT lose their turn!"* (p. 2) | Silent on final-card execution. | Derived from general action card scoring policy. | Enters pending state; active player chooses target to draw 2 cards; target draws cards (scored for winner); active player finalized as winner. |
| **Wild Reverse & Skips** | *"Reverses the direction of play."* / *"Next player loses their turn."* (p. 2) | Silent on final card. | Standard across all editions. | Action event recorded; round ends immediately with active player as winner. |

---

## 3. Comparison of Interpretations: Phase 7.1 vs Phase 7.1.1

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 7.1 Interpretation (Unsupported & Flawed)                                                 │
│                                                                                                 │
│  [P1: 1 card (Wild Forced Swap)] ──plays card──> [P1 hand: 0 cards]                             │
│                                           │                                                     │
│                                           ▼                                                     │
│                           Enters AWAITING_FORCED_SWAP_SELECTION                                 │
│                                           │                                                     │
│                                           ▼                                                     │
│                           P1 chooses P2 to swap hands                                           │
│                                           │                                                     │
│                                           ▼                                                     │
│                           Hands are swapped: P1 gets P2's cards (3)                             │
│                                              P2 gets P1's cards (0)                             │
│                                           │                                                     │
│                                           ▼                                                     │
│                      P2 declared Winner! (Kingmaking / Inversion defect)                        │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Phase 7.1.1 Policy (Official Mattel Rule Aligned & Kingmaking-Free)                             │
│                                                                                                 │
│  [P1: 1 card (Wild Forced Swap)] ──plays card──> [P1 hand: 0 cards]                             │
│                                           │                                                     │
│                                           ▼                                                     │
│                     Has P1 emptied hand? YES (nextHand.length === 0)                            │
│                     Can P1 exchange 0 cards? NO (Swap voided per Mattel rule)                   │
│                                           │                                                     │
│                                           ▼                                                     │
│                        pendingActionState = null (No selection needed)                          │
│                                           │                                                     │
│                                           ▼                                                     │
│                  handleRoundVictory(P1): P1 WINS THE ROUND IMMEDIATELY!                         │
│                  Opponents' cards scored for P1: P2 (3 cards) + P3 (4 cards)                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Code Modifications

### 4.1 Game Engine (`packages/game-engine/src/variants/all-wild/all-wild.actions.ts`)

In `AllWildActionProcessor.processPlayCard()`:

```typescript
case 'wild_forced_swap':
  // Wild Forced Swap: If player has cards remaining, enters pending state to choose target player.
  // If played as the final card (hand size becomes 0), the player has emptied their hand and
  // wins immediately per Mattel rules ("When a player plays their final card, they win").
  // The swap action is voided because the player has 0 cards left to exchange.
  if (nextHand.length > 0) {
    pendingActionState = {
      type: 'AWAITING_FORCED_SWAP_SELECTION' as const,
      sourcePlayerId: player.id,
    };
    ctx.addEvent('PENDING_FORCED_SWAP', player.id, { sourcePlayerId: player.id });
    nextPlayerIndex = playerIndex;
  } else {
    pendingActionState = null;
    nextPlayerIndex = playerIndex;
  }
  break;
```

When `nextHand.length === 0`, `pendingActionState` is `null`, directly triggering:
```typescript
if (nextHand.length === 0 && !pendingActionState) {
  return this.handleRoundVictory(
    state,
    playerIndex,
    updatedPlayers,
    nextDrawPile,
    nextDiscard,
    nextTopDiscardCard,
    ctx,
    nextTurnDirection
  );
}
```

### 4.2 Test Suite Updates

1. **`packages/game-engine/tests/all-wild.final-card.test.ts`:**
   - Updated Test 8 (`Final Wild Forced Swap`):
     - Assert that playing `wild_forced_swap` as the final card immediately ends the round with `roundWinner.id === 'p1'`.
     - Assert that `p1.hand` has length 0, and opponents' hands (`p2` 3 cards, `p3` 4 cards) remain untouched.
     - Assert that `pendingActionState` is `null`, and `p1` receives full round points for all opponents' cards.
     - Assert that no `PENDING_FORCED_SWAP` or `HANDS_FORCED_SWAPPED` events are emitted.
     - Added 2-player final Forced Swap test asserting immediate victory for active player.
2. **`apps/server/tests/integration/game.all-wild.socket.test.ts`:**
   - Updated final Forced Swap test:
     - Playing `wild_forced_swap` as last card via `GAME_PLAY_CARD` immediately transitions to `ROUND_OVER`/`COMPLETED`.
     - `roundWinner.id === activeId2` (the active player).
     - `pendingActionState` is `null`.
     - Active player hand count is 0; opponent hand count is 3.
     - Verified database snapshot persistence confirming `persisted.roundWinner.id === activeId2`.
3. **`packages/game-engine/tests/flip.fixture.test.ts`:**
   - Hardened invariant test to avoid pseudo-random collision between top discard card and `canonicalDeck[50]`.

---

## 5. Verification & Quality Gate Results

All five quality gates passed with zero warnings and zero regressions:

| Quality Gate | Command | Result | Details |
| :--- | :--- | :--- | :--- |
| **Typecheck** | `pnpm -r typecheck` | **PASS** | 0 errors across 6 packages (`shared`, `database`, `game-engine`, `game-protocol`, `web`, `server`). |
| **Lint** | `pnpm -r lint` | **PASS** | 0 ESLint errors or warnings across workspace. |
| **Build** | `pnpm build` | **PASS** | All packages compiled; Vite production client built (643.77 kB bundle). |
| **Unit & Integration Tests** | `pnpm test` | **PASS** | **359 tests passed**: 244 in `game-engine` (18 files), 97 in `server` (13 files), 18 in `web`. |
| **Playwright E2E** | `pnpm --filter @uno-ultimate/web test:e2e` | **PASS** | **6 of 6 passed** (59.1s) across Classic, Flip, No Mercy, and All Wild. |

---

## 6. Audit Findings & Resolution Checklist

- [x] Verified official Mattel HHL33 rule sheet text directly from service.mattel.com.
- [x] Identified that HHL33 explicitly states: *"When a player plays their final card, they win."*
- [x] Identified that HHL33 does NOT specify handing an empty hand or victory to an opponent on Forced Swap.
- [x] Established that franchise precedent (@realUNOgame) voids swap actions when playing a final Swap card.
- [x] Eliminated target-player victory and kingmaking on final Forced Swap.
- [x] Updated game engine action processor to void swap and immediately award victory to the player emptying their hand.
- [x] Updated unit and server socket integration tests to assert active player victory on final Forced Swap.
- [x] Verified full suite regression pass (unit, socket, DB, and Playwright E2E).
- [x] Preserved strict phase boundaries (Phase 7.1.1 complete; Phase 8 not initiated).
