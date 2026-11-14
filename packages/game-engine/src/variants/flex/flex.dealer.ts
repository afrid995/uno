import { Card } from '../../cards/card.types';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { FlexDeckFactory } from './flex.deck';
import {
  DealerDeterminationResult,
  DealerDeterminationRound,
  DealerDrawRecord,
} from '../../game/game.factory';

export class FlexDealerSelector {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  /**
   * Card score for dealer determination in UNO Flex (Mattel Product HNB00):
   * Number cards (1-8) = face value (1-8).
   * Action cards = 20 points.
   * Wild cards = 50 points.
   */
  static getDealerScoreForCard(card: Card): number {
    return card.scoreValue;
  }

  /**
   * Deterministic dealer determination with documented tie-resolution policy.
   * Each player picks a card from a shuffled 104-card Flex deck. Highest point value deals.
   * Ties are resolved through tie-break redraw rounds up to maxTieRounds. Fallback to lowest seat index.
   */
  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = FlexDealerSelector.DEFAULT_MAX_TIE_ROUNDS
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
        deck = shuffleDeck(FlexDeckFactory.createDeck(), rng);
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
    rng: RandomNumberGenerator = defaultCryptoRng
  ): number {
    return this.determineDealerDetailed(playerCount, rng).dealerIndex;
  }
}
