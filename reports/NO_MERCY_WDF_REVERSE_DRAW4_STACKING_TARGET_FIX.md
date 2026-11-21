# UNO Ultimate — Fix Wild Draw 4 + Wild Reverse Draw 4 Stacking for 2 vs 3+ Players Verification Report

**Author**: Google DeepMind Agent  
**Repository**: `https://github.com/afrid995/uno`  
**Date**: November 21, 2026  
**Status**: COMPLETE & VERIFIED  

---

## 1. Executive Summary

This report documents the root-cause diagnosis, implementation, and multi-tier verification of the penalty-target resolution for **UNO Show 'em No Mercy** when stacking a **Wild Reverse Draw 4** (`wild_reverse_draw_four`) card onto an incoming **Draw 4** / **Wild Draw 4** (`draw_four` / `wild_draw_four`) penalty.

### Problem Statement
In previous iterations, when Player A played a Draw 4 / Wild Draw 4 (+4) targeting Player B, and Player B stacked a Wild Reverse Draw 4 (+4), the game engine accumulated an 8-card penalty and reversed the game direction, but unconditionally assigned the penalty target (`targetPlayerId` and `currentPlayerIndex`) to Player B (the player who stacked the card).
- In a **2-player match**, this behavior was intended under custom 2-player rebound rules (Reverse rebounds to the player).
- In a **3+ player match**, this was incorrect. Reversing the play direction must pass the accumulated penalty back to the active player preceding Player B in the original play direction (Player A), and Player B must NOT receive the penalty.

---

## 2. Formal Specification & Target Behavior

### Case 1: Exactly 2 Active Players
```
Turn 1: Player A plays Wild Draw 4 (+4) -> targets Player B
Turn 2: Player B stacks Wild Reverse Draw 4 (+4)
```
- **Accumulated Penalty**: 8 cards (`4 + 4`).
- **Turn Direction**: Reverses (e.g. `clockwise` &rarr; `counter_clockwise`).
- **Target Player**: **Player B** (`targetPlayerId: Player B.id`, `currentPlayerIndex: Player B index`).
- **After Penalty Acceptance**: Player B receives 8 cards; turn progression follows the reversed direction to Player A.

### Case 2: 3 or More Active Players
```
Turn 1: Player A plays Wild Draw 4 (+4) -> targets Player B
Turn 2: Player B stacks Wild Reverse Draw 4 (+4)
```
- **Accumulated Penalty**: 8 cards (`4 + 4`).
- **Turn Direction**: Reverses (e.g. `clockwise` &rarr; `counter_clockwise`).
- **Target Player**: **Player A** (`targetPlayerId: Player A.id`, `currentPlayerIndex: Player A index`).
- **Player B**: Must **NOT** receive the penalty.
- **After Penalty Acceptance**: Player A receives 8 cards (unless eliminated under Mercy Rule > 25); turn progression follows the reversed direction to the next active player after Player A (e.g. Player C in a 3-player match, Player D in a 4-player match, dynamically skipping eliminated players).

---

## 3. Architecture & Root Cause Analysis

### Stacking Execution Flow in `NoMercyActionProcessor` (`packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`)
In `processStackPlay`:
1. When any card is played during `AWAITING_STACK_RESOLUTION`, the engine adds the card penalty to `pending.accumulatedPenalty`.
2. If `card.value === 'wild_reverse_draw_four'`, `turnDirection = reverseDirection(turnDirection)`.
3. Previously, lines 701-711 contained:
   ```typescript
   if (
     card.value === 'wild_reverse_draw_four' &&
     (pending.lastCardValue === 'draw_four' || pending.lastCardValue === 'wild_draw_four')
   ) {
     nextTargetIndex = playerIndex; // Hardcoded to Player B regardless of active player count!
   } else {
     nextTargetIndex = this.getNextActivePlayerIndex(playerIndex, state.players, turnDirection, 1);
   }
   ```
4. This hardcoded assignment caused Player B to receive the penalty even in 3-player, 4-player, 5-player, and 6-player matches.

---

## 4. Implementation Details

### Clean Separation of Concepts
1. **Active Players Computation**:
   Active players are dynamically computed, strictly accounting for eliminated players (`p.isEliminated` and `state.eliminatedPlayerIds`):
   ```typescript
   const activePlayers = state.players.filter(
     (p) => !p.isEliminated && !state.eliminatedPlayerIds?.includes(p.id)
   );
   const activeCount = activePlayers.length;
   ```
2. **Target Player Resolution**:
   ```typescript
   if (
     card.value === 'wild_reverse_draw_four' &&
     (pending.lastCardValue === 'draw_four' || pending.lastCardValue === 'wild_draw_four') &&
     activeCount === 2
   ) {
     // In exactly 2 active players, stacking Wild Reverse Draw 4 onto Draw 4 / Wild Draw 4
     // reverses direction and rebounds the accumulated 8-card penalty onto Player B.
     nextTargetIndex = playerIndex;
   } else {
     // In 3+ active players (or when non-reverse card is played), the penalty passes
     // to the next active player in turnDirection (which was reversed if WRD4 was played).
     nextTargetIndex = this.getNextActivePlayerIndex(playerIndex, state.players, turnDirection, 1);
   }
   ```
3. **Turn Progression After Penalty Acceptance**:
   In `processStackAccept`:
   ```typescript
   const targetIdx = state.players.findIndex((p) => p.id === pending.targetPlayerId);
   const playerIndex = targetIdx !== -1 ? targetIdx : state.currentPlayerIndex;
   // ... draws cards ...
   const nextPlayerIndex = this.getNextActivePlayerIndex(
     playerIndex,
     updatedPlayers,
     state.turnDirection,
     1
   );
   ```
   When Player A accepts the penalty in Case 2, `playerIndex` is Player A, and `nextPlayerIndex` advances in the reversed `turnDirection` to the next active player.

### Cross-Variant Isolation
This modification is strictly confined to `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`. None of the other 6 UNO variants (Classic, Flip, All Wild, Flex, Teams, Attack) were touched or affected.

---

## 5. Verification Results

### 5.1 Unit Tests (`packages/game-engine`)
- **Total Test Files**: 31 passed
- **Total Tests**: 425 passed (0 failed)
- **Specific Scenarios Tested in `tests/no-mercy.rules.test.ts`**:
  - `Edge case 1`: 3-player match &mdash; Player A plays Draw 4 &rarr; Player B stacks Wild Reverse Draw 4 &rarr; Direction reverses (`counter_clockwise`), Player A receives 8 cards, Player B is NOT penalized, Player A accepts, turn advances to Player C.
  - `Edge case 1b`: 2-player match &mdash; Player A plays Draw 4 &rarr; Player B stacks Wild Reverse Draw 4 &rarr; Direction reverses (`counter_clockwise`), Player B receives 8 cards, Player B accepts, turn advances to Player A.
  - `Edge cases 3 & 4`: Multi-card stack sequence &mdash; Draw 4 (+4) &rarr; Wild Reverse Draw 4 (+4, targets Alice with 8) &rarr; Wild Draw 6 (+6, passes 14 to Charlie) &rarr; Wild Draw 10 (+10, passes 24 to Bob) &rarr; Bob accepts 24 cards and is eliminated (> 25 cards).
  - `Edge cases 5, 6, 7`: Matrix test for 2-player, 3-player, and 4-player matches validating correct penalty target selection and turn advancement.
  - `Edge cases 8 & 9`: Recipient reaching exactly 25 cards (active) vs exceeding 25 cards (eliminated) in both 2-player and 3-player scenarios.

### 5.2 Server Integration Tests (`apps/server`)
- **File**: `tests/integration/game.no-mercy.wild-reverse-draw4.test.ts` (2 tests, 100% pass)
  - 3+ player match test: Full Socket.IO flow verifying that when Bob stacks Wild Reverse Draw 4 onto Draw 4, Alice receives the +8 penalty via WebSocket broadcast, Bob is not targeted, Alice accepts via `GAME_ACCEPT_STACK_PENALTY`, and the turn advances to Charlie.
  - 2-player match test: Full Socket.IO flow verifying that in a 2-player match, Bob is targeted with 8 cards, accepts, and turn advances to Alice in reversed direction.
- **File**: `tests/integration/game.no-mercy.socket.test.ts` (5 tests, 100% pass)
- **File**: `tests/integration/penalty-acceptance.socket.test.ts` (18 tests, 100% pass)

### 5.3 Web Frontend Unit Tests (`apps/web`)
- **Total Test Files**: 29 passed
- **Total Tests**: 170 passed (0 failed)

### 5.4 Typecheck, Lint & Build
- `pnpm -r typecheck`: 0 errors across all workspaces
- `pnpm -r lint`: 0 errors
- `pnpm build`: Clean production build across all packages and apps

---

## 6. Commit Summary

- **File Modified**: `packages/game-engine/src/variants/no-mercy/no-mercy.actions.ts`
- **Tests Updated**:
  - `packages/game-engine/tests/no-mercy.rules.test.ts`
  - `apps/server/tests/integration/game.no-mercy.wild-reverse-draw4.test.ts`
- **Documentation**: `reports/NO_MERCY_WDF_REVERSE_DRAW4_STACKING_TARGET_FIX.md`
