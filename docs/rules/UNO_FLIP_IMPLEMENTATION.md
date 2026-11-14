# UNO Ultimate — UNO Flip Official Rules & Variant Architecture Specification

## 1. Overview & Source Heritage

**UNO Flip!** is the first official variant integrated into the UNO Ultimate platform. It is modeled strictly on the official **Mattel UNO Flip GDR44** instruction sheet (English and Spanish editions).

UNO Flip transforms standard UNO gameplay by introducing double-sided cards:
- **Light Side**: Plays similarly to classic UNO with lighter action penalties (Draw One, Skip, Reverse, Wild, Wild Draw Two, and Flip).
- **Dark Side**: High-stakes side with severe penalties (Draw Five, Skip Everyone, Reverse, Wild, Wild Draw Color, and Flip).
- **Flip Mechanic**: Whenever a Flip card is played, the active side switches between Light and Dark across all cards in the game (draw pile, discard pile, and all player hands).

UNO Ultimate enforces a decoupled **GameVariantAdapter** architecture to ensure Classic UNO (Mattel 42001) and UNO Flip (Mattel GDR44) maintain complete rule isolation without mixing logic or corrupting state.

---

## 2. 112 Double-Sided Physical Card Deck Architecture

### 2.1 Dual-Faced Representation
Unlike Classic UNO, where a card has a single face, every UNO Flip card represents a single physical entity with two distinct faces:
- `lightFace`: The face visible during Light Side gameplay.
- `darkFace`: The face visible during Dark Side gameplay.
- `currentSide`: Either `'LIGHT'` or `'DARK'`.
- `id`: Stable unique identifier preserved across flips (`flip_c_001` through `flip_c_112`).

```typescript
export interface CardFace {
  readonly color: CardColor | null;
  readonly value: CardValue;
  readonly type: CardType;
  readonly scoreValue: number;
}

export interface PhysicalFlipCard extends Card {
  readonly lightFace: CardFace;
  readonly darkFace: CardFace;
  readonly currentSide: FlipSide; // 'LIGHT' | 'DARK'
}
```

### 2.2 Authoritative Mattel GDR44 112-Card Inventory
In the official Mattel GDR44 multi-language instruction sheet, both the English section (*"8 Flip cards - 2 each in blue, green, red and yellow"*) and the Spanish section (*"8 cartas de Giro - 2 de cada color en azul, verde, rojo y amarillo"*) explicitly and consistently specify 8 Flip cards per side (2 per color), totaling exactly **112 cards**:
- 72 Number cards (1–9 in 4 colors, 2 of each; no 0s)
- 8 Draw One cards (2 per color)
- 8 Reverse cards (2 per color)
- 8 Skip cards (2 per color)
- 8 Flip cards (2 per color)
- 4 Wild cards
- 4 Wild Draw Two cards
- **Total: $72 + 8 + 8 + 8 + 8 + 4 + 4 = 112$ cards.**

*(Note: Prior Phase 5 documentation mistakenly claimed the English instructions stated "4 Flip cards"; a direct inspection of the official Mattel GDR44 sheet confirms both languages specify 8 Flip cards).*

UNO Ultimate implements the authoritative 112-card deck with 8 Flip cards per side.

---

## 3. Official Mattel GDR44 Dealer Selection

### 3.1 Rules
1. Every player draws one card from the deck and reveals the **Light Side**.
2. **Number cards 1–9** count as their face value (1 to 9 points).
3. **Any symbol card** (Draw One, Reverse, Skip, Flip, Wild, Wild Draw Two) counts as **ZERO**.
4. The player drawing the highest number deals.

### 3.2 Application-Level Tie-Resolution Policy
1. If multiple candidates tie for the highest number (or tie with symbol cards scoring 0), tied players redraw.
2. If the remaining draw pile has fewer cards than tied candidates, a fresh 112-card deck is reshuffled.
3. To prevent infinite loops, an application-level safety limit of `maxTieRounds = 20` is enforced.
4. If candidates remain tied after 20 rounds, a deterministic fallback chooses the lowest seat index `Math.min(...candidates)`.

---

## 4. Starting Card Effects (Mattel GDR44)

The top card of the draw pile is turned over to form the discard pile on the **Light Side**:

| Starting Card | Mattel GDR44 Official Effect |
| :--- | :--- |
| **Number (1–9)** | Normal play. Player to dealer's left plays first in clockwise direction. |
| **Draw One (+1)** | Player to dealer's left must draw 1 card and loses their turn. Player to their left plays next. |
| **Reverse** | Dealer plays first, and play proceeds to the right (counter-clockwise). |
| **Skip** | Player to dealer's left is skipped; player to their left begins play. |
| **Flip** | Dealer immediately flips the entire deck to the **Dark Side**! Play begins with player to dealer's left on the Dark Side. |
| **Wild** | Player to dealer's left chooses the starting Light color (activeColor starts `null`, normal play and drawing are blocked until color is chosen) and plays the first card. |
| **Wild Draw Two** | Returned to the draw pile, deck is reshuffled, and a new card is turned over. |

---

## 5. Light Side Gameplay & Actions

Light Side colors: `red`, `yellow`, `green`, `blue`.

- **Draw One (+1)**: Next player draws 1 card and their turn is skipped. (In 2-player games, player plays again).
- **Reverse**: Reverses turn direction. (In 2-player games, acts as Skip).
- **Skip**: Next player loses their turn.
- **Flip**: Flips entire game to Dark Side.
- **Wild**: Player chooses the active Light color.
- **Wild Draw Two (+2)**:
  - Can only be played legally when the player does **NOT** hold a card matching the current active color.
  - Victim may **Accept** (draws 2 cards and turn skipped) or **Challenge**.
  - **Challenge Won (Attacker Guilty)**: Attacker held a matching color card; attacker draws 2 penalty cards. Challenger is unpenalized and continues play.
  - **Challenge Lost (Attacker Innocent)**: Attacker held no matching color; challenger draws 4 cards (2 + 2 penalty) and loses their turn.

---

## 6. Dark Side Gameplay & Actions

Dark Side colors: `pink`, `teal`, `orange`, `purple`.

- **Draw Five (+5)**: Next player draws 5 cards and their turn is skipped.
- **Reverse**: Reverses turn direction.
- **Skip Everyone**: All other players lose their turn; active player immediately plays again!
- **Flip**: Flips entire game to Light Side.
- **Wild**: Player chooses the active Dark color.
- **Wild Draw Color**:
  - Player chooses a Dark color.
  - Can only be played legally when player does **NOT** hold a card matching current active color.
  - Victim may **Accept** (draws from draw pile until drawing the chosen color, adds all drawn cards to hand, and loses turn) or **Challenge**.
  - **Challenge Won (Attacker Guilty)**: Attacker must draw until drawing the chosen color; challenger is unpenalized.
  - **Challenge Lost (Attacker Innocent)**: Challenger must draw until drawing the chosen color plus 2 extra penalty cards, and loses their turn!
  - **Infinite Draw Safety**: If draw pile and discard pile are exhausted without finding the color, drawing terminates safely without crashing.

---

## 7. Atomic Flip Transition Protocol

When a Flip card is played:
1. Active side toggles: `LIGHT` $\leftrightarrow$ `DARK`.
2. **Discard Pile Inversion**:
   - The played Flip card moves to the **bottom** of the flipped discard pile.
   - All cards in the discard pile flip to their opposite face.
   - The card that was immediately underneath the Flip card becomes the **new top discard card** on its opposite face!
   - `activeColor` updates to the new top discard card's color.
3. **Draw Pile Flipping**:
   - The draw pile is reversed and all cards flipped to their opposite face.
4. **Player Hand Flipping**:
   - Every card in every player's hand flips to its opposite face.
5. **Card Conservation Invariant**:
   - The total number of cards across all hands, draw pile, and discard pile remains strictly **112 cards** at all times ($0$ lost, $0$ duplicated).

---

## 8. UNO Declaration & Penalty Policy

- **Shouting UNO**: When playing a card that leaves a player with exactly 1 card, the player must declare UNO.
- **Missed UNO Challenge**: If a player with 1 card has not declared UNO before the next player takes their turn, any opponent may challenge them.
- **Penalty**: Under official Mattel GDR44 rules, the penalty is **2 cards** (unlike Classic UNO's 4 cards).

---

## 9. Scoring & Match Termination

Points are accumulated by the winner of each round from the cards remaining in all opponents' hands.
Scoring is evaluated according to the side active when the round finishes:

### Light Side Scoring Table (Official GDR44)
- Number cards (1–9): Face value (1 to 9 points)
- Draw One (+1): **10 points** (Mattel GDR44 official value)
- Reverse: 20 points
- Skip: 20 points
- Flip: 20 points
- Wild: **40 points** (Mattel GDR44 official value)
- Wild Draw Two: 50 points

### Dark Side Scoring Table (Official GDR44)
- Number cards (1–9): Face value (1 to 9 points)
- Draw Five (+5): 20 points
- Reverse: 20 points
- Skip Everyone: **30 points** (Mattel GDR44 official value)
- Flip: 20 points
- Wild: **40 points** (Mattel GDR44 official value)
- Wild Draw Color: 60 points

**Target Score**: The first player to accumulate **500 points** wins the match.

---

## 10. Variant Registry & Decoupled Architecture

The game engine utilizes a runtime `VariantRegistry` pattern:
- `packages/game-engine/src/variants/variant.types.ts`: Defines `GameVariantAdapter` interface.
- `classic.adapter.ts`: Implements Mattel 42001 Classic UNO.
- `flip.adapter.ts`: Implements Mattel GDR44 UNO Flip.

Both variants operate with zero leaky abstractions, allowing future variants (e.g., Show 'em No Mercy, All Wild) to plug into the platform seamlessly without regressing existing games.

---

## 11. Test Fixture Architecture & Physical Card Invariant Verification

To maintain deterministic end-to-end testing without compromising state validity or generating impossible game states, UNO Ultimate implements a formal test fixture infrastructure under `packages/game-engine/src/variants/flip/`:

### 11.1 Physical Card Conservation Invariant
In UNO Flip, a game consists of exactly 112 canonical physical cards. At all times during gameplay:
$$\sum_{p \in \text{Players}} |\text{Hand}_p| + |\text{DrawPile}| + |\text{DiscardPile}| = 112$$
Every physical card ID (`flip_c_001` through `flip_c_112`) must appear exactly once across all zones. Cards may never be created from outside the deck or destroyed.

### 11.2 Atomic Card Swapping (`FlipFixtureBuilder`)
When a test scenario requires injecting a specific card (such as a playable Flip card or a starting Wild card) into a player's hand or the discard pile:
1. `FlipFixtureBuilder.injectPlayableFlipCard`: Locates an existing physical Flip card matching the required playability criteria within the game state (draw pile, opponent hand, or deep discard). It swaps that card with a non-Flip card in the target player's hand. If no matching color Flip card exists, the top discard is atomically swapped with a matching number card from the draw pile. This strictly preserves all hand sizes, total deck count, and discard history.
2. `FlipFixtureBuilder.injectStartingWild`: Locates a physical Wild card in the existing draw pile and swaps it with the current top discard card, setting `activeColor = null` and designating the player to the left of the dealer.

### 11.3 Invariant Checker (`FlipInvariantValidator`)
The `validateFlipGameStateInvariants` engine method verifies:
- Variant is strictly `'uno_flip'`.
- `activeSide` is `'LIGHT'` or `'DARK'`.
- Exact 112 physical cards across all zones with 112 unique IDs.
- Dual faces match the canonical Mattel GDR44 deck factory.
- Active card faces match `activeSide`.
- Discard pile top card matches `topDiscardCard`.
- `activeColor` matches top discard when non-wild, or is null when awaiting starting Wild selection.

### 11.4 Invariant Verification Endpoint
During automated E2E tests, `GET /api/test/verify-invariants/:roomCode` inspects the active game state on the server, guaranteeing that no test helper ever introduces card duplication, card loss, or corrupted state.

### 11.5 Test Helper Access Security & Authentication Gate
To eliminate unauthorized tampering with matches in environments where test helpers are enabled, all test endpoints enforce a strict four-condition authentication and enablement gate:
1. `NODE_ENV !== 'production'`: Endpoints are completely unmounted in production, responding with HTTP 404.
2. `ENABLE_TEST_HELPERS === 'true'`: Explicit flag required in the server environment.
3. `TEST_HELPER_SECRET`: High-entropy server secret ($\ge 16$ characters) must be configured; missing or weak secrets fail closed with HTTP 403.
4. `X-Test-Helper-Secret`: Every request must present the matching secret in this header. The server compares secrets in constant time using `timingSafeSecretCompare` with SHA-256 digests to prevent timing attacks. Missing or mismatched headers are rejected with HTTP 401 Unauthorized.


