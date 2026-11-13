# Classic UNO Rules Implementation Specification

This document details the exact rule mechanics, card definitions, scoring formulas, and edge-case behaviors implemented in `@uno-ultimate/game-engine`, verified strictly against the official Mattel UNO instructions for Product Reference **42001**.

> **Source of Truth**: Mattel UNO Instructions (Product Reference 42001). Zero house rules permitted.

---

## 1. Canonical 108-Card Playable Deck Composition

The official playable deck consists of exactly **108 cards** partitioned across 4 distinct colors (**Red**, **Yellow**, **Green**, **Blue**) and neutral Wild cards. (Note: Some physical 42001 boxes include 4 blank customizable cards; these are omitted from gameplay per official tournament and digital Classic UNO rules).

```
Total Deck (108 playable cards)
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

## 2. Setup & Initial Discard Pile Resolution (Mattel 42001)

### Dealer Determination & Dealing
1. **Dealer Selection**: Prior to Round 1, each player draws a card; highest number card deals (action cards count as 0). Dealer index rotates clockwise by 1 for each subsequent round.
2. Every player receives **7 cards** face down.
3. The remaining cards form the **Draw Pile** (face down).
4. Play begins with the player to the left of the dealer (`(dealerIndex + 1) % playerCount`).

### Starting Card Edge Cases (Mattel 42001)
When the top card of the draw pile is turned face up to start the discard pile:
- **Wild Draw Four**: *Illegal start card*. It is returned to the draw pile, the deck is reshuffled, and another card is turned over.
- **Wild**: *Illegal start card per Mattel 42001*. It is returned to the draw pile, the deck is reshuffled, and another card is turned over until a non-Wild card is revealed.
- **Draw Two**: Player to the left of the dealer must draw **2 cards** and loses their turn. The next player takes the first turn.
- **Reverse**: The dealer plays first, and the direction of play reverses counter-clockwise.
- **Skip**: The player to the left of the dealer is skipped. The next player begins play.
- **Number Card (0–9)**: Standard play begins with the player to the left of the dealer matching the card by number, color, or symbol.

---

## 3. Official Turn Progression & Move Legality

### Legal Plays
A player may play a card from their hand if it matches:
1. The **active color** of the discard pile.
2. The **number** of the top discard card (if number card).
3. The **action symbol** of the top discard card (Skip, Reverse, Draw Two).
4. A **Wild card** (may be played on any card regardless of color or symbol).
5. A **Wild Draw Four** card (see legality restriction below).

### Drawing & Optional Play
- If a player cannot or chooses not to play a card, they must draw **one card** from the draw pile.
- After drawing, if the drawn card is legal to play, the player may optionally play that drawn card immediately. They cannot play any other card from their hand on that turn.
- If the player chooses not to play the drawn card, or if it is unplayable, they may pass their turn to the next player.

---

## 4. Wild Draw Four: Legality, Acceptance & Challenge Lifecycle

### Official Legality Restriction
Per Mattel 42001 rules:
> "You may only play this card when you DO NOT have another card in your hand that matches the COLOR on the discard pile (although it is acceptable to play this card if you have matching number or Action cards)."

### Resolution Lifecycle: Accept vs Challenge
When a player plays a Wild Draw Four:
1. They must declare the chosen active color (Red, Yellow, Green, or Blue).
2. The match enters `AWAITING_WILD_DRAW_FOUR_RESOLUTION`. All other actions are suspended.
3. The victim (next player in sequence) has two choices:
   - **Accept**: The victim accepts the play. They draw **4 cards** from the draw pile and their turn is skipped.
   - **Challenge**: The victim challenges the legality of the play.
4. **Challenge Outcome**:
   - **Challenger inspects offender's hand**: The server projects the offender's hand *exclusively* to the challenger (`inspectedChallengedHand`).
   - **Guilty (Illegal Play)**: The offender held a card matching the active color prior to playing the +4.
     - **Penalty**: The offender must draw **4 cards**.
     - The challenger does **not** draw and gets to take their regular turn!
   - **Innocent (Legal Play)**: The offender held no matching color cards.
     - **Penalty**: The challenger must draw **6 cards** (4 for the Wild Draw Four + 2 penalty cards) and their turn is skipped!

---

## 5. UNO Declaration & The 4-Card Penalty (Mattel 42001)

### Shouting "UNO"
When a player plays their second-to-last card and is about to hold only **1 card**, they must declare **UNO**.

### Vulnerability Window
- If a player fails to call UNO before playing down to 1 card, they become **vulnerable to being caught**.
- **Catch Window**: An opponent must catch them before the next player takes a turn (draws from the pile or plays a card).
- If the vulnerable player declares UNO before anyone catches them, they successfully save themselves.

### Missed UNO Penalty
Per official Mattel 42001 instructions:
- If a player is caught before the next player takes an action, they must draw **4 cards** from the draw pile as penalty! (Zero house-rule 2-card penalties).

---

## 6. Multi-Round Scoring & Winning the Match

### Round Termination
A round ends the instant a player plays their final card and holds 0 cards in hand.

### Action Card Exception on Winning Play
- If the last card played is a **Draw Two**, the next player must draw **2 cards** before scores are tallied.
- If the last card played is a **Wild Draw Four**, the resolution must complete (with appropriate draws) before scores are tallied.

### Point Accumulation
The winner of the round scores points for all cards remaining in opponents' hands:
- **Number cards (0–9)**: Face value (0–9 points)
- **Skip, Reverse, Draw Two**: 20 points each
- **Wild, Wild Draw Four**: 50 points each

### Match Victory Target (500 Points)
- Cumulative scores carry over across rounds.
- If no player reaches **500 points**, the round ends (`ROUND_OVER`), dealer rotates clockwise, and a new round is dealt.
- The first player to reach or exceed **500 points** wins the match (`COMPLETED`).
