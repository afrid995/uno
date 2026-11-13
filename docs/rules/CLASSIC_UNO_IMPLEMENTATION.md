# Classic UNO Rules Implementation Specification

This document details the exact rule mechanics, card definitions, scoring formulas, and edge-case behaviors implemented in `@uno-ultimate/game-engine`, verified against the official Mattel UNO rulesheet.

> **Source of Truth**: Mattel UNO Classic Rulesheet (Standard 108-Card Edition, Reference 42001 / BJV44).

---

## 1. Canonical 108-Card Deck Composition

The deck consists of exactly **108 cards** partitioned across 4 distinct colors (**Red**, **Yellow**, **Green**, **Blue**) and neutral Wild cards.

```
Total Deck (108 cards)
├── Red (25 cards)
│   ├── Number 0 (1 card)
│   ├── Numbers 1–9 (2 of each = 18 cards)
│   ├── Skip (2 cards)
│   ├── Reverse (2 cards)
│   └── Draw Two (2 cards)
├── Yellow (25 cards)
│   └── [Same composition as Red = 25 cards]
├── Green (25 cards)
│   └── [Same composition as Red = 25 cards]
├── Blue (25 cards)
│   └── [Same composition as Red = 25 cards]
└── Wild Cards (8 cards)
    ├── Wild (4 cards)
    └── Wild Draw Four (4 cards)
```

### Exact Breakdown Table

| Classification | Values / Symbols | Quantities | Points per Card |
| :--- | :--- | :--- | :--- |
| **Number 0** | 0 | 1 per color (4 total) | 0 points |
| **Numbers 1–9** | 1, 2, 3, 4, 5, 6, 7, 8, 9 | 2 per number per color (72 total) | Face value (1–9 points) |
| **Skip** | Skip symbol | 2 per color (8 total) | 20 points |
| **Reverse** | Reverse arrows | 2 per color (8 total) | 20 points |
| **Draw Two** | +2 symbol | 2 per color (8 total) | 20 points |
| **Wild** | Multi-color symbol | 4 neutral cards | 50 points |
| **Wild Draw Four** | +4 symbol | 4 neutral cards | 50 points |
| **Total** | | **108 cards** | |

---

## 2. Setup & Initial Discard Pile Resolution

### Dealing
1. Every player receives **7 cards** face down.
2. The remaining cards become the **Draw Pile** (face down).
3. The top card of the draw pile is turned face up to start the **Discard Pile**.

### Starting Card Edge Cases (Mattel Rules)
When the initial card turned over is an action or wild card, official Mattel rules prescribe the following immediate resolutions:

- **Wild Draw Four**: *Illegal start card*. It must be returned to the draw pile, the deck reshuffled, and a new card flipped. In `@uno-ultimate/game-engine`, this is executed iteratively in `GameFactory.createGame` until a non-Wild-Draw-Four card is turned over.
- **Wild**: The starting player (Player 0 / Host) chooses which color begins play before playing their first card.
- **Draw Two**: The starting player must immediately draw **2 cards** (starting with 9 cards in hand) and loses their turn. The next player in sequence takes the first move.
- **Reverse**: The direction of play is reversed immediately (from clockwise to counter-clockwise). The starting player remains Player 0, but the next turn proceeds counter-clockwise.
- **Skip**: The starting player is skipped. The player to their left (Player 1 in clockwise order) plays first.
- **Number Card (0–9)**: Standard gameplay begins with Player 0. The active color is the color of the card.

---

## 3. Legal Moves & Card Play

On their turn, a player may play one card that matches:
1. The **active color** of the top discard card (e.g., Red on Red).
2. The **number** or **symbol** of the top discard card (e.g., Yellow 7 on Blue 7, or Blue Skip on Green Skip).
3. A neutral **Wild** card (legal on any card regardless of color).
4. A neutral **Wild Draw Four** card (legal on any card).

### Drawing When Unable or Unwilling to Play
- If a player has no matching card, they **must draw one card** from the draw pile.
- If the card drawn is playable under standard matching rules, the player may **optionally play it immediately**.
- If the player cannot or chooses not to play the drawn card, their turn ends (`PASS_TURN`).
- Players draw **exactly one card** per turn when drawing; there is no drawing repeatedly until a playable card is found.

---

## 4. Action Card Semantics

- **Skip**: The next player in sequence loses their turn.
- **Reverse**: Inverts play direction (`CLOCKWISE` $\leftrightarrow$ `COUNTER_CLOCKWISE`).
- **Draw Two (+2)**: The next player draws 2 cards from the draw pile and loses their turn.
- **Wild**: Allows the player to designate the new active color (`red`, `yellow`, `green`, `blue`).
- **Wild Draw Four (+4)**: Allows the player to designate the new active color, and forces the next player to draw 4 cards and forfeit their turn.

### Official 2-Player Match Adaptations
When only 2 players are in the match ($N = 2$), Mattel rules specify:
1. **Reverse behaves as a Skip**: Playing a Reverse skips the opponent, immediately granting the current player another turn.
2. **Skip**: Skips the opponent, granting the player another turn.
3. **Draw Two**: Opponent draws 2 cards and forfeits turn; player takes another turn.
4. **Wild Draw Four**: Opponent draws 4 cards and forfeits turn; player takes another turn.

---

## 5. Reshuffling & Card Conservation

The total number of cards in play must always equal 108:

$$|\text{DrawPile}| + |\text{DiscardPile}| + \sum_{p \in \text{Players}} |\text{Hand}_p| = 108$$

When the draw pile is depleted:
1. The active top discard card remains in the discard pile.
2. All remaining cards in the discard pile ($|\text{DiscardPile}| - 1$) are collected.
3. Any temporary chosen colors on wild cards are cleared.
4. The collected cards are shuffled and placed face down as the new draw pile.
5. If the discard pile contains only 1 card (all cards are in players' hands), the draw pile remains empty and players cannot draw cards.

---

## 6. The "UNO" Rule & Penalties

### Calling UNO
When a player plays a card that reduces their hand to **one card**, they must announce **"UNO"**.
- Action: `CALL_UNO`
- If called promptly, the player's `hasDeclaredUno` flag is set to `true`.

### Penalty for Failure to Call
If a player has 1 card remaining and fails to call UNO before the next player takes their turn:
- Any player may issue a challenge (`CHALLENGE_UNO_FAILURE`).
- If the challenge is valid (player holds 1 card and `hasDeclaredUno` is false), the challenged player must immediately draw **2 penalty cards** from the draw pile.

---

## 7. Round Completion & Scoring

### Winning a Round
The round terminates immediately when a player plays their final card and their hand count reaches zero (`cardsRemaining === 0`).
- If the final card played is a **Draw Two** or **Wild Draw Four**, the next player **must still draw the penalty cards** before the final scores are calculated.

### Official Mattel Scoring
The round winner receives points for all cards remaining in all opponents' hands:
- **Number Cards (0–9)**: Face value (0 to 9 points).
- **Draw Two**: 20 points.
- **Reverse**: 20 points.
- **Skip**: 20 points.
- **Wild**: 50 points.
- **Wild Draw Four**: 50 points.

### Winning the Match
The first player whose accumulated score across rounds reaches **500 points** wins the match.

---

## 8. Explicit Non-Goals & House Rules Excluded

In strict adherence to Mattel's official rules, the following common "house rules" are **NOT** implemented in Classic UNO:
- ❌ **No Stacking (+2 on +2, +4 on +4)**: A player facing a Draw Two or Wild Draw Four cannot play another draw card to pass the penalty to the next player.
- ❌ **No Draw-Until-Playable**: Players draw at most one card when they cannot or choose not to play.
- ❌ **No 7-0 Rule**: Playing a 7 does not swap hands with another player; playing a 0 does not rotate everyone's hands.
- ❌ **No Jump-Ins**: Players cannot interrupt the turn sequence even if they hold an identical card.
- ❌ **No Forced Play**: A player may choose to draw even if they hold a playable card in hand.
