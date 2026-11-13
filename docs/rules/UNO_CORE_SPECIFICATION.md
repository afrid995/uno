# UNO Core Rules Specification

This document defines the official Mattel UNO rules specification that will govern the game engine starting from Phase 3. 

> [!IMPORTANT]
> UNO Ultimate strictly implements official Mattel rules. No unvetted house rules (such as stacking +2 on +4, or playing multiple cards of the same number in one turn) are enabled by default.

---

## 1. Deck Composition (108 Cards)

The canonical UNO deck consists of exactly 108 cards:

| Card Type | Colors | Counts per Color | Total Cards | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Number 0** | Red, Yellow, Green, Blue | 1 per color | 4 | Numbered 0 |
| **Numbers 1–9** | Red, Yellow, Green, Blue | 2 of each number per color | 72 | Numbers 1 through 9 (18 per color) |
| **Skip** | Red, Yellow, Green, Blue | 2 per color | 8 | Next player in sequence loses their turn |
| **Reverse** | Red, Yellow, Green, Blue | 2 per color | 8 | Reverses the direction of play (clockwise $\leftrightarrow$ counter-clockwise) |
| **Draw Two (+2)** | Red, Yellow, Green, Blue | 2 per color | 8 | Next player draws 2 cards and forfeits their turn |
| **Wild** | Neutral | 4 total | 4 | Player chooses active color; can be played on any card |
| **Wild Draw Four (+4)**| Neutral | 4 total | 4 | Player chooses color; next player draws 4 cards and loses turn |
| **Total** | | | **108** | |

---

## 2. Gameplay Mechanics

### Setup & Dealing
1. Each player is dealt **7 cards** face down.
2. The remaining cards form the **Draw Pile** (face down).
3. The top card of the Draw Pile is flipped to begin the **Discard Pile**.
   - If the first card flipped is an Action card:
     - **Wild Draw Four**: Return to deck, shuffle, and draw another card.
     - **Wild**: First player to play chooses the starting color.
     - **Draw Two**: First player draws 2 cards and skips turn.
     - **Reverse**: Play direction begins counter-clockwise; dealer plays first.
     - **Skip**: First player skips turn; next player proceeds.

### Legal Moves
A player on their turn may play one card from their hand if it matches:
1. The **color** of the top card on the Discard Pile.
2. The **number** or **symbol** of the top card on the Discard Pile.
3. Any **Wild** or **Wild Draw Four** card.

If a player has no matching card, they must draw one card from the Draw Pile. If the drawn card is playable, the player may optionally play it immediately.

### Action Card Semantics
- **Skip**: Next player in order is skipped. In a 2-player game, playing a Skip grants the current player another immediate turn.
- **Reverse**: Changes turn progression. In a 2-player game, Reverse acts identically to a Skip.
- **Draw Two (+2)**: Next player draws 2 cards and forfeits their turn. They cannot "stack" another Draw Two to pass the penalty (official rule).
- **Wild Draw Four (+4)**: Can only be played when the player holds **no cards of the current active color**. A challenged +4 requires the player to reveal their hand to the challenger. If guilty, the player draws 4; if innocent, the challenger draws 6 (4 + 2 penalty).

---

## 3. Calling "UNO"

When a player has only **one card remaining in hand**, they must call **"UNO"**.
- If another player catches them before the next player takes their turn, the player who failed to call UNO must draw **2 penalty cards**.
- In UNO Ultimate, this will be implemented via an authoritative server button timer window.

---

## 4. End of Round & Scoring

The round ends when a player plays their final card.
Scores are calculated based on cards remaining in opponents' hands:
- Number cards (0–9): Face value
- Draw Two, Reverse, Skip: 20 points each
- Wild, Wild Draw Four: 50 points each

First player to reach 500 points wins the match.
