import { Card } from '../../cards/card.types';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { AttackDeckFactory } from './attack.deck';
import {
  DealerDeterminationResult,
  DealerDeterminationRound,
  DealerDrawRecord,
} from '../../game/game.factory';

export class AttackDealerSelector {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  /**
   * Under standard UNO Attack rules:
   * Number cards score face value (1-9). Action and Wild cards count as 0.
   */
  static getDealerScoreForCard(card: Card): number {
    if (card.type === 'number') {
      const num = parseInt(card.value, 10);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = AttackDealerSelector.DEFAULT_MAX_TIE_ROUNDS
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
        deck = shuffleDeck(AttackDeckFactory.createDeck(), rng);
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
      const winners = draws.filter((d) => d.score === highestScore).map((d) => d.candidateIndex);

      roundHistory.push({
        round: tieRounds,
        draws,
        highestScore,
        remainingCandidates: winners,
      });

      candidates = winners;
    }

    if (candidates.length === 1) {
      return {
        dealerIndex: candidates[0],
        tieRounds,
        resolvedByFallback: false,
        roundHistory,
      };
    }

    return {
      dealerIndex: Math.min(...candidates),
      tieRounds,
      resolvedByFallback: true,
      roundHistory,
    };
  }

  static determineDealer(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = AttackDealerSelector.DEFAULT_MAX_TIE_ROUNDS
  ): number {
    return this.determineDealerDetailed(playerCount, rng, maxTieRounds).dealerIndex;
  }
}
