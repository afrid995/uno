import { RandomNumberGenerator, defaultCryptoRng } from '../../deck/deck.shuffle';
import { ATTACK_LAUNCHER_CONFIG } from './attack.constants';

export interface LauncherEvaluationResult {
  readonly totalCardsToDispense: number;
  readonly finalTension: number;
  readonly pressResults: readonly {
    readonly pressIndex: number;
    readonly cardsDispensed: number;
    readonly tensionBefore: number;
    readonly tensionAfter: number;
  }[];
}

export class AttackLauncher {
  private static overrideDispenseCount: number | null = null;

  /**
   * Injects a deterministic card count override for testing purposes.
   * When set to non-null, any launcher activation will dispense exactly this count.
   */
  static setDeterministicOverride(count: number | null): void {
    this.overrideDispenseCount = count;
  }

  static getDeterministicOverride(): number | null {
    return this.overrideDispenseCount;
  }

  /**
   * Simulates the electronic motorized launcher mechanism across `pressCount` button presses.
   *
   * @param pressCount Number of times the launch button is pressed (1 to 4)
   * @param initialTension Starting tension / pulse level (0 to 4)
   * @param availableCardCount Remaining cards available in the draw pile
   * @param rng Random number generator (server-authoritative)
   */
  static evaluatePresses(
    pressCount: number,
    initialTension: number = 0,
    availableCardCount: number = 112,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): LauncherEvaluationResult {
    // If deterministic test override is active, respect it
    if (this.overrideDispenseCount !== null) {
      const count = Math.min(this.overrideDispenseCount, availableCardCount);
      return {
        totalCardsToDispense: count,
        finalTension: count > 0 ? 0 : Math.min(initialTension + pressCount, ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL),
        pressResults: [
          {
            pressIndex: 1,
            cardsDispensed: count,
            tensionBefore: initialTension,
            tensionAfter: count > 0 ? 0 : Math.min(initialTension + pressCount, ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL),
          },
        ],
      };
    }

    let currentTension = Math.max(0, Math.min(initialTension, ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL));
    let remainingCards = availableCardCount;
    let totalDispensed = 0;
    const pressResults: {
      pressIndex: number;
      cardsDispensed: number;
      tensionBefore: number;
      tensionAfter: number;
    }[] = [];

    for (let press = 1; press <= pressCount; press++) {
      const tensionBefore = currentTension;
      const launchChance =
        ATTACK_LAUNCHER_CONFIG.TENSION_PROBABILITIES[currentTension] ??
        ATTACK_LAUNCHER_CONFIG.TENSION_PROBABILITIES[0];

      const roll = rng();
      if (roll < launchChance && remainingCards > 0) {
        // Cards shoot out!
        const countRoll = rng();
        // Burst calculation: base 1 to 4 cards, plus tension scaling (up to max 12)
        const maxPossibleBurst = Math.min(
          ATTACK_LAUNCHER_CONFIG.MAX_BURST_CAPACITY,
          1 + Math.floor(countRoll * (3 + currentTension * 2))
        );
        const cardsDispensed = Math.min(maxPossibleBurst, remainingCards);

        totalDispensed += cardsDispensed;
        remainingCards -= cardsDispensed;
        currentTension = 0; // Tension resets on launch!

        pressResults.push({
          pressIndex: press,
          cardsDispensed,
          tensionBefore,
          tensionAfter: currentTension,
        });
      } else {
        // No cards shoot out (silent press); tension builds up!
        currentTension = Math.min(currentTension + 1, ATTACK_LAUNCHER_CONFIG.MAX_TENSION_LEVEL);

        pressResults.push({
          pressIndex: press,
          cardsDispensed: 0,
          tensionBefore,
          tensionAfter: currentTension,
        });
      }
    }

    return {
      totalCardsToDispense: totalDispensed,
      finalTension: currentTension,
      pressResults,
    };
  }
}
