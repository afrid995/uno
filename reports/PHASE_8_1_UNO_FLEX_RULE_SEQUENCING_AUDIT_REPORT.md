# UNO ULTIMATE — PHASE 8.1 AUDIT REPORT: UNO FLEX FINAL-ACTION & OPENING-CARD RULE RESOLUTION

**Repository:** `https://github.com/afrid995/uno.git`  
**Workspace:** `D:\uno`  
**Branch:** `main`  
**Baseline Commit:** `c854a6027b9e0244d057564225a379e6e6bc2190`  
**Official Rule Authorities:**
- Mattel UNO Flex Product HNB00 / HMY99 Instruction Sheet (`HNB00-Eng-2024.pdf`, identical to HMY99)
- Primary Mattel Rule 7: Setup and Opening Discard Pile
- Primary Mattel Winning & Scoring Rules (Page 2 & Page 4)

---

## 1. Executive Summary

Phase 8.1 conducts a comprehensive audit and architectural correction of two critical rule-sequencing defects identified in the published UNO Flex implementation (Phase 8):

1. **Issue A (Final-Card Action Resolution & Penalty Scoring):** In `packages/game-engine/src/variants/flex/flex.actions.ts`, an early round-victory check triggered immediately when `remainingHand.length === 0` *before* the action card resolution switch was executed. This caused rounds to end prematurely when a player played an action card as their final card, completely bypassing penalty card distribution (Draw Two, Flex Draw Two, Flex Wild All Draw, Flex Wild Target Draw Two, Flex Wild Draw Four, and Wild Draw Four challenge/accept flows) and resulting in inaccurate round scoring.
2. **Issue B (Opening Discard Card Selection):** In `packages/game-engine/src/variants/flex/flex.adapter.ts` and `flex.actions.ts`, the setup card-flip loop only skipped cards where `topCard.type === 'wild'`. Under official Mattel Rule 7, **all Action Cards** (both Classic Action cards and Flex Action cards, as well as Wild cards) must be ignored and placed faceup on the discard pile until a concrete Number Card (1–8) is revealed.
3. **Documentation Correction (Power Card Restriction Scope):** Clarified the rule in `reports/PHASE_8_UNO_FLEX_IMPLEMENTATION_REPORT.md` that a green Power Card is required *only* to play the **Flex side** of a card (`playMode === 'flex'`), never for standard/regular action card plays.

Both issues have been fully resolved with zero regressions across Classic UNO, UNO Flip, UNO Show 'em No Mercy, and UNO All Wild. The complete 471-unit/integration test suite and 7-suite Playwright E2E test battery pass with 100% success.

---

## 2. Official Mattel Rules Authority Analysis

### 2.1 Issue A: Final-Card Action Resolution and Scoring
From Mattel UNO Flex Instructions (`HNB00-Eng-2024.pdf`), Page 2 ("WINNING") and Page 4 ("SCORING"):
- **Official Text (Page 2):**  
  > *"When you play your next-to-last card, you must yell 'UNO' to indicate that you have only one card left... If a player plays a Draw Two, Flex Draw Two, Flex Wild All Draw, or Wild Draw Four card as their final card, the next player(s) must still draw those cards, and they count toward the winner's points."*
- **Official Text (Page 4):**  
  > *"When you are the first player to get rid of all of your cards, you get points for all the cards left in other players' hands:  
  > - All number cards (1-8): Face Value  
  > - Draw Two, Flex Draw Two, Reverse, Flex Reverse, Skip, Flex Skip: 20 Points  
  > - Wild All Flip, Flex Wild Target Draw 2, Flex Wild Draw Four, Flex Wild All Draw: 50 Points"*

**Finding:** An action card played as the final card must complete its full action effect—including drawing penalty cards into opponents' hands and resolving any pending interactive flows (such as target player selection or Wild Draw Four challenge/accept)—before round victory is declared and scores are calculated.

### 2.2 Issue B: Opening Discard Card Setup
From Mattel UNO Flex Instructions (`HNB00-Eng-2024.pdf`), Page 1 ("SET UP"), Rule 7:
- **Official Text (Rule 7):**  
  > *"Flip over the top card of the DRAW PILE and place it FACEUP to form the DISCARD PILE. If this card is an Action Card, ignore it and flip over the next card."*
- **Card Classification (Page 3):**  
  - **Action Cards:** Draw Two Card, Skip Card, Reverse Card, Wild All Flip Card.  
  - **Flex Action Cards:** Flex Draw Two Card, Flex Skip Card, Flex Reverse Card, Flex Wild Target Draw 2 Card, Flex Wild Draw Four Card, Flex Wild All Draw Card.

**Finding:** The phrase "Action Card" in Mattel Rule 7 encompasses all non-number cards (all Classic and Flex action cards, and all Wild cards). Only a Number Card (1–8) has a fixed color and numeric value capable of starting regular play. If any Action Card or Wild Card is flipped, it is ignored, added faceup to the discard pile, and successive cards are popped from the draw pile until a Number Card is reached.

### 2.3 Opening Card Flip Icon Invariance
From Mattel UNO Flex Instructions (`HNB00-Eng-2024.pdf`), Page 2 ("POWER CARDS"):
- **Official Text:**  
  > *"WHEN A CARD WITH A FLIP ICON IS PLAYED, ALL PLAYERS MUST FLIP THEIR POWER CARDS..."*

**Finding:** Rule 7 reveals/flips the card to start the discard pile; the card is *not played* by a player. Therefore, if a Classic Number card with a flip icon is revealed as the opening discard card, players do NOT flip their Power Cards. All players maintain their starting Green Checkmark ($\checkmark$) Power Card status per Setup Rule 5.

---

## 3. Root Cause Analysis & Technical Implementation

### 3.1 Issue A: Action Resolution Sequencing in `flex.actions.ts`

#### Root Cause
In `FlexActionProcessor.processPlayCard()`, lines 242–254 previously checked:
```ts
// Flawed implementation in Phase 8 baseline:
if (remainingHand.length === 0) {
  return this.handleRoundVictory(
    state,
    nextPlayers,
    playerIndex,
    nextDiscardPile,
    card,
    nextActiveColor,
    unoVulnerablePlayerId,
    ctx
  );
}
```
Because this check sat before the action resolution `switch (card.value)`, playing any action card with 1 card in hand bypassed the entire action handler. Furthermore, `handleRoundVictory` did not accept `drawPile`, which meant that any penalty cards drawn into opponents' hands would fail 104-card conservation by duplicating cards remaining in `state.drawPile`.

#### Implemented Fix
1. **Removed premature victory check:** Lines 242–254 were removed from before the action resolution block.
2. **Post-Action Victory Evaluation:** At the end of `processPlayCard`:
   ```ts
   // If the active player played their last card and no pending action is awaiting resolution
   if (remainingHand.length === 0 && !nextPendingState) {
     return this.handleRoundVictory(
       state,
       nextPlayers,
       playerIndex,
       currentDiscardPile,
       currentDrawPile,
       card,
       nextActiveColor,
       null,
       ctx
     );
   }
   ```
   If `nextPendingState !== null` (such as `AWAITING_TARGETED_DRAW_TWO_SELECTION`, `AWAITING_TARGETED_DRAW_FOUR_SELECTION`, or `AWAITING_WILD_DRAW_FOUR_RESOLUTION`), the match status remains `IN_PROGRESS` with the active pending state, allowing the target selection or challenge flow to proceed over Socket.IO / REST.
3. **Pending Resolution Handlers:** In `processTargetedDrawTwo`, `processTargetedDrawFour`, `processAcceptWildDrawFour`, and `processChallengeWildDrawFour`:
   - After penalty cards are drawn into the target/victim/challenger's hand, the engine checks if the card player's hand length is 0.
   - If 0, `handleRoundVictory` is invoked using the updated player hands, `currentDiscardPile`, and `currentDrawPile`.
   - If the player bluffed on Wild Draw Four and was challenged successfully, the offender draws 4 penalty cards (hand size becomes 4); the round does *not* end, and play continues.
4. **Card Conservation Update in `handleRoundVictory`:**
   - Updated signature to accept `drawPile: readonly Card[]` and `inspectionHand: InspectionHand | null = null`.
   - In `nextState`: explicitly sets `drawPile: [...drawPile]`, `discardPile: [...discardPile]`, `pendingActionState: null`, and `inspectionHand`.
   - Strictly satisfies the 104-card invariant across draw pile, discard pile, and player hands.

---

### 3.2 Issue B: Opening Discard Selection in `flex.adapter.ts` and `flex.actions.ts`

#### Root Cause
In `UnoFlexAdapter.createGame` (lines 76–80) and `FlexActionProcessor.processStartNextRound` (lines 1045–1050), the opening loop previously did:
```ts
// Flawed implementation in Phase 8 baseline:
let topCard = drawPile.pop()!;
while (topCard.type === 'wild') {
  drawPile = shuffleDeck([...drawPile, topCard], rng);
  topCard = drawPile.pop()!;
}
const discardPile: Card[] = [topCard];
```
This allowed Classic Action cards (`draw_two`, `skip`, `reverse`) and Flex Action cards (`flex_draw_two`, `flex_skip`, `flex_reverse`) to become the opening card, directly violating Mattel Rule 7.

#### Implemented Fix
Replaced the loop in both `flex.adapter.ts` and `flex.actions.ts` with:
```ts
// Mattel Product HNB00 Setup Rule 7:
// All Action Cards (Classic & Flex) and Wild Cards are ignored; keep flipping until a Number Card is reached.
const discardPile: Card[] = [];
let topCard = drawPile.pop()!;
while (topCard.type !== 'number') {
  discardPile.push(topCard);
  topCard = drawPile.pop()!;
}
discardPile.push(topCard);
```
- Conserves all 104 cards: skipped action cards are retained faceup in `discardPile` in their exact flip order.
- Guarantees `topDiscardCard.type === 'number'` and `activeColor === topCard.color` (concrete color).
- Invariants verified by `assertValidFlexGameState`.

---

### 3.3 Documentation Correction: Power Card Scope

In `reports/PHASE_8_UNO_FLEX_IMPLEMENTATION_REPORT.md`, Section 1 and Section 2 were updated to explicitly clarify:
> **Power Card Scope Clarification:** A green Power Card is required *only* to play the **Flex side** of a card (`playMode === 'flex'`). Regular-side action cards (Draw Two, Skip, Reverse, regular side of Flex cards, Wild All Flip) can always be played when matching regardless of whether the player's Power Card is Green or Red.

---

## 4. Verification & Test Evidence

### 4.1 Unit & Mechanics Tests (`packages/game-engine/tests/flex.rules.test.ts`)
Added 12 comprehensive unit tests covering all final-card action categories and opening discard setups:
1. `ignores Action Cards and Wild Cards on opening flip until a Number Card is reached`: Initialized 20 randomized games; verified `topDiscardCard.type === 'number'`, `activeColor === topDiscardCard.color`, and 104-card invariant across every initialization.
2. `does not flip power cards if opening card has flip icon`: Verified all players start with `green_check` Power Cards even if the opening number card contains a flip icon.
3. `resolves regular Draw Two as final card`: Victim draws 2 cards, counted in round score, round ends.
4. `resolves Flex Draw Two (flex side) as final card`: All opponents draw 1 card each, counted in round score, round ends.
5. `resolves Flex Wild All Draw (flex side) as final card`: All opponents draw 2 cards each, counted in round score, round ends.
6. `resolves Flex Wild Target Draw Two with immediate targetPlayerId`: Selected target draws 2 cards, counted in round score, round ends.
7. `handles Flex Wild Target Draw Two pending target selection on final card`: Play without `targetPlayerId` leaves state in `IN_PROGRESS` with `AWAITING_TARGETED_DRAW_TWO_SELECTION`; round ends upon `CHOOSE_TARGETED_DRAW_TWO_TARGET`.
8. `handles Flex Wild Draw Four (flex side) pending target selection on final card`: Leaves state in `IN_PROGRESS` with `AWAITING_TARGETED_DRAW_FOUR_SELECTION`; round ends upon `CHOOSE_TARGETED_DRAW_FOUR_TARGET` with 4 penalty cards scored.
9. `handles regular Wild Draw Four as final card with ACCEPT`: Victim accepts and draws 4 cards; offender wins round; victim's 4 cards scored.
10. `handles regular Wild Draw Four as final card with CHALLENGE (innocent)`: Challenger challenges an innocent offender; challenger draws 6 cards (4 + 2); offender wins round; challenger's 6 cards scored.
11. `handles regular Wild Draw Four with CHALLENGE when offender bluffed`: Offender bluffed holding matching color; challenger wins challenge; offender draws 4 cards (hand length becomes 5); round does *not* end; match remains `IN_PROGRESS`.
12. `resolves final-card Skip, Reverse, and Wild All Flip`: Actions resolve immediately and round ends.

### 4.2 Server Socket Integration Tests (`apps/server/tests/integration/game.flex.socket.test.ts`)
Added 2 new integration tests over live Socket.IO:
1. `handles final-card pending Targeted Draw Two over Socket.IO and finishes round on selection`: Verified active player plays card without target, state remains `IN_PROGRESS` with `AWAITING_TARGETED_DRAW_TWO_SELECTION`, emits `GAME_CHOOSE_TARGETED_DRAW_TWO`, session transitions to `ROUND_OVER`, and `GAME_ROUND_FINISHED` event is broadcast with updated scores.
2. `handles final-card Wild Draw Four challenge flow over Socket.IO and finishes round on accept`: Verified active player plays Wild Draw Four, game awaits resolution, opponent emits `GAME_ACCEPT_WILD_DRAW_FOUR`, victim draws 4 cards, and session transitions to `ROUND_OVER`.

### 4.3 Monorepo Test Results Summary

| Package / Scope | Test Files | Total Tests | Status |
| :--- | :---: | :---: | :---: |
| `@uno-ultimate/game-engine` | 21 | 289 | **PASSED (100%)** |
| `@uno-ultimate/server` | 14 | 102 | **PASSED (100%)** |
| `@uno-ultimate/web` (Unit/Component) | 18 | 80 | **PASSED (100%)** |
| `@uno-ultimate/web` (Playwright E2E) | 1 | 7 | **PASSED (100%)** |
| **Workspace Total** | **54** | **478** | **PASSED (100%)** |

Quality gates passed cleanly:
- `pnpm -r typecheck`: 0 errors
- `pnpm -r lint`: 0 errors
- `pnpm build`: 100% build success across shared, game-engine, game-protocol, database, server, and web.

---

## 5. Modified Files & Git Inventory

| File Path | Description of Changes |
| :--- | :--- |
| `packages/game-engine/src/variants/flex/flex.adapter.ts` | Updated opening discard loop to ignore all Action and Wild cards per Rule 7; changed `let drawPile` to `const drawPile`. |
| `packages/game-engine/src/variants/flex/flex.actions.ts` | Removed early victory check before action resolution; added victory checks in action resolution and pending resolution handlers; updated `handleRoundVictory` to accept `drawPile`; changed `let drawPile` to `const drawPile`. |
| `packages/game-engine/tests/flex.fixture.test.ts` | Updated fixture assertions to test for top discard being a Number card (`topDiscardCard.type === 'number'`) and invariant card conservation rather than hardcoding discard pile length to 1. |
| `packages/game-engine/tests/flex.rules.test.ts` | Added 12 comprehensive unit tests covering opening discard selection (Rule 7), flip icon non-activation, and all final-card action/penalty resolution scenarios. |
| `apps/server/tests/integration/game.flex.socket.test.ts` | Added 2 real-time Socket.IO integration tests verifying final-card pending targeted draw two and wild draw four challenge/accept flows. |
| `reports/PHASE_8_UNO_FLEX_IMPLEMENTATION_REPORT.md` | Corrected Power Card rule scope wording; added Rule 7 and final-card action resolution rules. |
| `reports/PHASE_8_1_UNO_FLEX_RULE_SEQUENCING_AUDIT_REPORT.md` | Authoritative Phase 8.1 audit report. |

---

## 6. Commit Metadata & Chronology

| Milestone | Commit SHA | Status |
| :--- | :--- | :--- |
| **Phase 8 Baseline** | `c854a6027b9e0244d057564225a379e6e6bc2190` | Published on `origin/main` |
| **Phase 8.1 Rule Audit & Correction** | *(Recorded upon git push)* | Fully verified & ready for publication |
