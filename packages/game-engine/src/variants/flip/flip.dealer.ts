import { Card } from '../../cards/card.types';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { FlipDeckFactory } from './flip.deck';
import { DealerDeterminationResult, DealerDeterminationRound, DealerDrawRecord } from '../../game/game.factory';

export class FlipDealerSelector {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  /**
   * Calculates dealer card score under Mattel GDR44 rules:
   * - Light Side comparison
   * - Number cards 1-9 count as their face value (1 to 9 points)
   * - Any card with a symbol or action (draw_one, reverse, skip, flip, wild, wild_draw_two) counts as ZERO.
   */
  static getDealerScoreForCard(card: Card): number {
    // Reveal Light Side
    const face = card.lightFace ?? card;
    if (face.type === 'number') {
      const num = parseInt(face.value, 10);
      return isNaN(num) ? 0 : num;
    }
    // Any card with a symbol counts as zero per GDR44 Setup
    return 0;
  }

  /**
   * Official Mattel GDR44 UNO Flip dealer determination with documented application-level tie-resolution policy.
   *
   * 1. Official Mattel GDR44 Rule:
   *    - Each player draws a card from the deck and reveals the Light Side.
   *    - The player drawing the highest number deals.
   *    - Any card with a symbol counts as zero.
   *
   * 2. Application-Level Tie-Resolution Policy:
   *    - If multiple players tie for highest number (or tie with symbol cards scoring 0), tied players redraw.
   *    - Fresh 112-card deck reshuffled if deck has fewer cards than remaining candidates.
   *    - Safety ceiling of maxTieRounds = 20 rounds prevents infinite loops.
   *    - Deterministic lowest seat index fallback Math.min(...candidates) ensures termination.
   */
  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = FlipDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): DealerDeterminationResult {
    if (playerCount <= 1) {
      return {
        dealerIndex: 0,
        tieRounds: 0,
        resolvedByFallback: false,
        roundHistory: [],
      };
    }

    let candidates = Array.from({ length: playerCount }, (_, i) => i);
    let deck: Card[] = [];
    let tieRounds = 0;
    const roundHistory: DealerDeterminationRound[] = [];

    while (candidates.length > 1 && tieRounds < maxTieRounds) {
      tieRounds++;

      if (deck.length < candidates.length) {
        deck = shuffleDeck(FlipDeckFactory.createFlipDeck(), rng);
      }

      const draws: DealerDrawRecord[] = [];
      for (const candidate of candidates) {
        const card = deck.pop()!;
        draws.push({
          candidateIndex: candidate,
          card,
          score: this.getDealerScoreForCard(card),
        });
      }

      const highestScore = Math.max(...draws.map((d) => d.score));

      candidates = draws
        .filter((d) => d.score === highestScore)
        .map((d) => d.candidateIndex);

      roundHistory.push({
        round: tieRounds,
        draws,
        highestScore,
        remainingCandidates: [...candidates],
      });
    }

    const resolvedByFallback = candidates.length > 1;
    const dealerIndex = resolvedByFallback ? Math.min(...candidates) : candidates[0];

    return {
      dealerIndex,
      tieRounds,
      resolvedByFallback,
      roundHistory,
    };
  }

  static determineDealer(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = FlipDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): number {
    return this.determineDealerDetailed(playerCount, rng, maxTieRounds).dealerIndex;
  }
}
