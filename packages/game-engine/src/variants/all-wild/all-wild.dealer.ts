import { Card } from '../../cards/card.types';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { AllWildDeckFactory } from './all-wild.deck';
import { DealerDeterminationResult, DealerDeterminationRound, DealerDrawRecord } from '../../game/game.factory';

export class AllWildDealerSelector {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  /**
   * Dealer card score for UNO All Wild:
   * Action cards score 50 points, standard wild cards score 20 points.
   */
  static getDealerScoreForCard(card: Card): number {
    return card.scoreValue;
  }

  /**
   * Deterministic dealer selection for UNO All Wild with documented tie-resolution policy.
   * Players draw a card from a shuffled All Wild deck. Highest score deals (Actions > Standard Wild).
   * In the event of a tie, tied candidates redraw up to maxTieRounds. Fallback to lowest seat index.
   */
  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = AllWildDealerSelector.DEFAULT_MAX_TIE_ROUNDS
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
        deck = shuffleDeck(AllWildDeckFactory.createDeck(), rng);
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

  static determineDealer(playerCount: number, rng: RandomNumberGenerator = defaultCryptoRng): number {
    return this.determineDealerDetailed(playerCount, rng).dealerIndex;
  }
}
