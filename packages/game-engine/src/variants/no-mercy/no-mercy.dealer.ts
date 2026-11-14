import { Card } from '../../cards/card.types';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { NoMercyDeckFactory } from './no-mercy.deck';
import { DealerDeterminationResult, DealerDeterminationRound, DealerDrawRecord } from '../../game/game.factory';
import { UNO_NO_MERCY_RULES } from './no-mercy.constants';

export class NoMercyDealerSelector {
  static readonly DEFAULT_MAX_TIE_ROUNDS = 20;

  static getDealerScoreForCard(card: Card): number {
    if (card.type === 'number') {
      const num = parseInt(card.value, 10);
      return isNaN(num) ? 0 : num;
    }
    if (card.type === 'action') {
      return UNO_NO_MERCY_RULES.COLORED_ACTION_POINTS; // 20
    }
    if (card.type === 'wild') {
      return UNO_NO_MERCY_RULES.WILD_ACTION_POINTS; // 50
    }
    return 0;
  }

  static determineDealerDetailed(
    playerCount: number,
    rng: RandomNumberGenerator = defaultCryptoRng,
    maxTieRounds: number = NoMercyDealerSelector.DEFAULT_MAX_TIE_ROUNDS
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
        deck = shuffleDeck(NoMercyDeckFactory.createDeck(), rng);
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
