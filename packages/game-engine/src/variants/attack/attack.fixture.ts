import { Card, CardColor } from '../../cards/card.types';
import { GameState } from '../../game/game.types';
import { AttackDeckFactory } from './attack.deck';
import { VariantRegistry } from '../variant.types';
import { assertValidAttackGameState } from './attack.invariants';
import './attack.adapter';

export class AttackFixtureBuilder {
  static createInitialGameFixture(playerCount: number = 4): GameState {
    const adapter = VariantRegistry.get('uno_attack');
    const players = Array.from({ length: playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      username: `Player ${i + 1}`,
    }));

    return adapter.createGame({
      roomId: 'room_attack_test',
      variant: 'uno_attack',
      players,
      dealerIndex: playerCount - 1, // Ensures p1 (index 0) is starting player
    });
  }

  /**
   * Constructs a strictly invariant-preserving custom state for testing.
   * Every card not in the specified hands or top discard card is collected into the draw pile.
   */
  static setCustomState(
    baseState: GameState,
    hands: Record<string, Card[]>,
    topCard: Card,
    activeColor?: CardColor,
    currentPlayerIndex: number = 0
  ): GameState {
    const fullDeck = AttackDeckFactory.createDeck();
    const usedCardIds = new Set<string>();

    usedCardIds.add(topCard.id);
    for (const h of Object.values(hands)) {
      for (const c of h) {
        if (usedCardIds.has(c.id)) {
          throw new Error(`Duplicate card ${c.id} assigned in custom hands.`);
        }
        usedCardIds.add(c.id);
      }
    }

    const remainingDeck = fullDeck.filter((c) => !usedCardIds.has(c.id));

    const updatedPlayers = baseState.players.map((p) => ({
      ...p,
      hand: hands[p.id] ? [...hands[p.id]] : [],
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
    }));

    const nextState: GameState = {
      ...baseState,
      players: updatedPlayers,
      currentPlayerIndex,
      drawPile: remainingDeck,
      discardPile: [topCard],
      topDiscardCard: topCard,
      activeColor: activeColor ?? topCard.color ?? 'red',
      pendingActionState: null,
      unoVulnerablePlayerId: null,
      attackLauncherState: { tension: 0 },
      updatedAt: new Date().toISOString(),
    };

    assertValidAttackGameState(nextState);
    return nextState;
  }

  /**
   * Sets up a deterministic round-end state:
   * Current player has 1 winning card matching the top discard,
   * Opponents hold standard number/action cards,
   * 112 cards strictly conserved.
   */
  static setupRoundEndState(state: GameState, targetWinnerId?: string): GameState {
    const fullDeck = AttackDeckFactory.createDeck();
    const winnerId = targetWinnerId ?? state.players[0].id;
    const winnerIndex = state.players.findIndex((p) => p.id === winnerId);

    // Pick top discard red 5, winner hand red 7
    const topCard = fullDeck.find((c) => c.color === 'red' && c.value === '5')!;
    const winningCard = fullDeck.find((c) => c.color === 'red' && c.value === '7')!;

    const hands: Record<string, Card[]> = {};
    hands[winnerId] = [winningCard];

    const opponents = state.players.filter((p) => p.id !== winnerId);
    let cardIdx = 0;
    const opponentCardsPool = fullDeck.filter(
      (c) => c.id !== topCard.id && c.id !== winningCard.id && c.type === 'number'
    );

    for (const opp of opponents) {
      hands[opp.id] = [opponentCardsPool[cardIdx++], opponentCardsPool[cardIdx++]];
    }

    const customState = this.setCustomState(state, hands, topCard, 'red');

    const finalState: GameState = {
      ...customState,
      currentPlayerIndex: winnerIndex,
      pendingActionState: null,
      status: 'IN_PROGRESS',
    };

    assertValidAttackGameState(finalState);
    return finalState;
  }
}
