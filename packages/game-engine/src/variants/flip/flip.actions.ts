import { GameState, GameWinner } from '../../game/game.types';
import { GameAction, GameEventRecord } from '../../actions/action.types';
import { Card, CardColor, FlipSide } from '../../cards/card.types';
import { HandManager } from '../../players/hand.manager';
import { TurnManager } from '../../turns/turn.manager';
import { reverseDirection } from '../../turns/turn.direction';
import { ActionProcessResult } from '../../actions/action.processor';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { FlipDeckFactory } from './flip.deck';
import { FlipMoveValidator } from './flip.validator';
import { UNO_FLIP_RULES } from './flip.constants';

export class FlipActionProcessor {
  /**
   * Helper to draw `count` cards from draw pile, recycling discard pile (preserving top) if needed.
   */
  static drawCards(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    count: number,
    activeSide: FlipSide,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): { drawnCards: Card[]; newDrawPile: Card[]; newDiscardPile: Card[] } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    const drawn: Card[] = [];

    for (let i = 0; i < count; i++) {
      if (currentDraw.length === 0) {
        if (currentDiscard.length <= 1) {
          // No more cards available to recycle
          break;
        }
        // Recycle discard pile excluding top card
        const topCard = currentDiscard.pop()!;
        const recycled = shuffleDeck(currentDiscard, rng).map((c) =>
          FlipDeckFactory.flipCard(c, activeSide)
        );
        currentDraw = recycled;
        currentDiscard = [topCard];
      }

      if (currentDraw.length > 0) {
        drawn.push(currentDraw.pop()!);
      }
    }

    return {
      drawnCards: drawn,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
    };
  }

  /**
   * Draws cards until a card of the specified target color is drawn (for Wild Draw Color).
   * Includes infinite draw safety: stops if all remaining cards in deck are exhausted without finding the color.
   */
  static drawUntilColor(
    drawPile: readonly Card[],
    discardPile: readonly Card[],
    targetColor: CardColor,
    activeSide: FlipSide,
    additionalCardsCount: number = 0,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): { drawnCards: Card[]; newDrawPile: Card[]; newDiscardPile: Card[] } {
    let currentDraw = [...drawPile];
    let currentDiscard = [...discardPile];
    const drawn: Card[] = [];
    let found = false;

    // Safety loop: maximum draws bounded by total deck size (112)
    const maxDraws = 112;
    let iterations = 0;

    while (!found && iterations < maxDraws) {
      iterations++;

      if (currentDraw.length === 0) {
        if (currentDiscard.length <= 1) {
          // Deck exhausted, cannot draw more
          break;
        }
        const topCard = currentDiscard.pop()!;
        const recycled = shuffleDeck(currentDiscard, rng).map((c) =>
          FlipDeckFactory.flipCard(c, activeSide)
        );
        currentDraw = recycled;
        currentDiscard = [topCard];
      }

      if (currentDraw.length === 0) {
        break;
      }

      const card = currentDraw.pop()!;
      drawn.push(card);

      // Check if drawn card matches target color
      if (card.color === targetColor) {
        found = true;
      }
    }

    // If additional cards are required (e.g. +2 for innocent challenge)
    if (additionalCardsCount > 0) {
      const extra = this.drawCards(currentDraw, currentDiscard, additionalCardsCount, activeSide, rng);
      drawn.push(...extra.drawnCards);
      currentDraw = extra.newDrawPile;
      currentDiscard = extra.newDiscardPile;
    }

    return {
      drawnCards: drawn,
      newDrawPile: currentDraw,
      newDiscardPile: currentDiscard,
    };
  }

  /**
   * Scores all remaining cards in losers' hands according to the active side on round end.
   */
  static calculateHandScore(hand: readonly Card[], activeSide: FlipSide): number {
    return hand.reduce((total, card) => {
      const face = activeSide === 'LIGHT' ? (card.lightFace ?? card) : (card.darkFace ?? card);
      return total + face.scoreValue;
    }, 0);
  }

  static calculateRoundScore(loserHands: readonly (readonly Card[])[], activeSide: FlipSide = 'LIGHT'): number {
    return loserHands.reduce((acc, hand) => acc + this.calculateHandScore(hand, activeSide), 0);
  }

  /**
   * Pure state transition processor for UNO Flip.
   */
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Validate action legality
    const validation = FlipMoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    let intermediateState: GameState = { ...state };
    const generatedEvents: Omit<GameEventRecord, 'sequenceNumber'>[] = [];
    const timestamp = new Date().toISOString();
    const activeSide: FlipSide = state.activeSide ?? 'LIGHT';

    switch (action.type) {
      case 'PLAY_CARD': {
        const playerIndex = state.currentPlayerIndex;
        const player = state.players[playerIndex];
        const cardToPlay = HandManager.findCard(player.hand, action.cardId)!;
        const { updatedHand } = HandManager.removeCard(player.hand, action.cardId);

        // Check if player held matching active color before playing Wild
        const hadActiveColor = player.hand
          .filter((c) => c.id !== cardToPlay.id)
          .some((c) => c.color === state.activeColor);

        // Check missed UNO vulnerability
        let newUnoVulnerablePlayerId: string | null = null;
        let hasDeclared = false;
        if (updatedHand.length === 1) {
          if (player.hasDeclaredUno || action.declareUno) {
            hasDeclared = true;
            if (!player.hasDeclaredUno && action.declareUno) {
              generatedEvents.push({
                type: 'UNO_DECLARED',
                playerId: player.id,
                payload: { declared: true, declaredWithPlay: true },
                timestamp,
              });
            }
          } else {
            newUnoVulnerablePlayerId = player.id;
          }
        }

        generatedEvents.push({
          type: 'CARD_PLAYED',
          playerId: player.id,
          payload: {
            cardId: cardToPlay.id,
            color: cardToPlay.color,
            value: cardToPlay.value,
            chosenColor: action.chosenColor,
            remainingCardCount: updatedHand.length,
            activeSide,
          },
          timestamp,
        });

        // Update player's hand and reset turn flags
        let updatedPlayers = state.players.map((p, idx) =>
          idx === playerIndex
            ? {
                ...p,
                hand: updatedHand,
                hasDeclaredUno: hasDeclared,
                hasDrawnThisTurn: false,
                drawnCardId: null,
              }
            : p
        );

        let newActiveColor: CardColor = (cardToPlay.color ?? state.activeColor ?? 'blue') as CardColor;
        let newActiveSide: FlipSide = activeSide;
        let newDrawPile = [...state.drawPile];
        let newDiscardPile = [...state.discardPile, cardToPlay];
        let newTopDiscardCard = cardToPlay;
        let newTurnDirection = state.turnDirection;
        let nextPlayerIndex = playerIndex;
        let newPendingActionState = null;
        let isRoundOver = updatedHand.length === 0;

        // Resolve card effects based on active side
        if (cardToPlay.value === 'flip') {
          // --- FLIP CARD MECHANIC ---
          newActiveSide = activeSide === 'LIGHT' ? 'DARK' : 'LIGHT';

          // Flip Discard Pile:
          // Per Mattel GDR44: The Flip card just played moves to the bottom of the flipped discard pile,
          // and all cards are flipped to the opposite face. The previous cards underneath now show
          // their opposite faces, and the card that was underneath the Flip card is now on top!
          const flippedDiscardCards = [...newDiscardPile]
            .reverse()
            .map((c) => FlipDeckFactory.flipCard(c, newActiveSide));

          newDiscardPile = flippedDiscardCards;
          newTopDiscardCard = newDiscardPile[newDiscardPile.length - 1];
          newActiveColor = newTopDiscardCard.color ?? (newActiveSide === 'LIGHT' ? 'blue' : 'pink');

          // Flip Draw Pile:
          newDrawPile = [...newDrawPile]
            .reverse()
            .map((c) => FlipDeckFactory.flipCard(c, newActiveSide));

          // Flip every player's hand:
          updatedPlayers = updatedPlayers.map((p) => ({
            ...p,
            hand: p.hand.map((c) => FlipDeckFactory.flipCard(c, newActiveSide)),
          }));

          generatedEvents.push({
            type: 'SIDE_FLIPPED',
            playerId: player.id,
            payload: {
              previousSide: activeSide,
              newSide: newActiveSide,
              topDiscardCard: newTopDiscardCard,
              activeColor: newActiveColor,
            },
            timestamp,
          });

          // Turn advances to next player under existing direction
          nextPlayerIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
        } else if (cardToPlay.value === 'reverse') {
          newTurnDirection = reverseDirection(state.turnDirection);
          if (updatedPlayers.length === 2) {
            // In 2-player game: Reverse acts like a Skip (gives current player another turn)
            nextPlayerIndex = playerIndex;
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              playerIndex,
              updatedPlayers.length,
              newTurnDirection,
              1
            );
          }
        } else if (cardToPlay.value === 'skip') {
          // Light Side: Skip next player
          if (updatedPlayers.length === 2) {
            nextPlayerIndex = playerIndex;
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              playerIndex,
              updatedPlayers.length,
              newTurnDirection,
              2
            );
          }
        } else if (cardToPlay.value === 'skip_everyone') {
          // Dark Side: Skip Everyone! All other players lose turn; current player plays again
          nextPlayerIndex = playerIndex;
          generatedEvents.push({
            type: 'EVERYONE_SKIPPED',
            playerId: player.id,
            payload: { playerGetsAnotherTurn: true },
            timestamp,
          });
        } else if (cardToPlay.value === 'draw_one') {
          // Light Side: Next player draws 1 card and loses turn
          const victimIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
          const drawResult = this.drawCards(newDrawPile, newDiscardPile, 1, newActiveSide, rng);
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p, idx) =>
            idx === victimIndex ? { ...p, hand: [...p.hand, ...drawResult.drawnCards] } : p
          );

          generatedEvents.push({
            type: 'CARDS_DRAWN',
            playerId: updatedPlayers[victimIndex].id,
            payload: { count: drawResult.drawnCards.length, reason: 'DRAW_ONE' },
            timestamp,
          });

          if (updatedPlayers.length === 2) {
            nextPlayerIndex = playerIndex; // Current player plays again
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              victimIndex,
              updatedPlayers.length,
              newTurnDirection,
              1
            );
          }
        } else if (cardToPlay.value === 'draw_five') {
          // Dark Side: Next player draws 5 cards and loses turn
          const victimIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
          const drawResult = this.drawCards(newDrawPile, newDiscardPile, 5, newActiveSide, rng);
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p, idx) =>
            idx === victimIndex ? { ...p, hand: [...p.hand, ...drawResult.drawnCards] } : p
          );

          generatedEvents.push({
            type: 'CARDS_DRAWN',
            playerId: updatedPlayers[victimIndex].id,
            payload: { count: drawResult.drawnCards.length, reason: 'DRAW_FIVE' },
            timestamp,
          });

          if (updatedPlayers.length === 2) {
            nextPlayerIndex = playerIndex;
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              victimIndex,
              updatedPlayers.length,
              newTurnDirection,
              1
            );
          }
        } else if (cardToPlay.value === 'wild') {
          newActiveColor = action.chosenColor!;
          nextPlayerIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
        } else if (cardToPlay.value === 'wild_draw_two') {
          // Light Side: Wild Draw Two
          newActiveColor = action.chosenColor!;
          const victimIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
          const victim = updatedPlayers[victimIndex];

          newPendingActionState = {
            type: 'AWAITING_WILD_DRAW_TWO_RESOLUTION' as const,
            playedByPlayerId: player.id,
            victimPlayerId: victim.id,
            wasOfficiallyLegal: !hadActiveColor,
            chosenColor: action.chosenColor!,
            offenderHandSnapshot: [...updatedHand],
          };

          generatedEvents.push({
            type: 'WILD_DRAW_TWO_PENDING',
            playerId: player.id,
            payload: {
              victimPlayerId: victim.id,
              chosenColor: action.chosenColor,
            },
            timestamp,
          });

          // Even if this was the last card, the victim must accept or challenge before round ends!
          isRoundOver = false;
        } else if (cardToPlay.value === 'wild_draw_color') {
          // Dark Side: Wild Draw Color
          newActiveColor = action.chosenColor!;
          const victimIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
          const victim = updatedPlayers[victimIndex];

          newPendingActionState = {
            type: 'AWAITING_WILD_DRAW_COLOR_RESOLUTION' as const,
            playedByPlayerId: player.id,
            victimPlayerId: victim.id,
            wasOfficiallyLegal: !hadActiveColor,
            chosenColor: action.chosenColor!,
            offenderHandSnapshot: [...updatedHand],
          };

          generatedEvents.push({
            type: 'WILD_DRAW_COLOR_PENDING',
            playerId: player.id,
            payload: {
              victimPlayerId: victim.id,
              chosenColor: action.chosenColor,
            },
            timestamp,
          });

          isRoundOver = false;
        } else {
          // Standard number card
          nextPlayerIndex = TurnManager.getNextPlayerIndex(
            playerIndex,
            updatedPlayers.length,
            newTurnDirection,
            1
          );
        }

        // Check round end
        let newStatus = state.status;
        let roundWinner: GameWinner | null = null;
        let matchWinner: GameWinner | null = null;

        if (isRoundOver) {
          newStatus = 'ROUND_OVER';
          const loserHands = updatedPlayers.filter((_, idx) => idx !== playerIndex).map((p) => p.hand);
          const pointsScored = this.calculateRoundScore(loserHands, newActiveSide);

          updatedPlayers = updatedPlayers.map((p, idx) =>
            idx === playerIndex ? { ...p, score: p.score + pointsScored } : p
          );

          roundWinner = {
            id: player.id,
            username: player.username,
            score: updatedPlayers[playerIndex].score,
            roundScore: pointsScored,
          };

          generatedEvents.push({
            type: 'ROUND_WON',
            playerId: player.id,
            payload: {
              winnerId: player.id,
              pointsScored,
              cumulativeScore: updatedPlayers[playerIndex].score,
              activeSide: newActiveSide,
            },
            timestamp,
          });

          if (updatedPlayers[playerIndex].score >= state.targetScore) {
            newStatus = 'COMPLETED';
            matchWinner = roundWinner;
            generatedEvents.push({
              type: 'MATCH_WON',
              playerId: player.id,
              payload: {
                winnerId: player.id,
                finalScore: updatedPlayers[playerIndex].score,
              },
              timestamp,
            });
          }
        }

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: newDrawPile,
          discardPile: newDiscardPile,
          topDiscardCard: newTopDiscardCard,
          activeColor: newActiveColor,
          activeSide: newActiveSide,
          turnDirection: newTurnDirection,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          unoVulnerablePlayerId: newUnoVulnerablePlayerId,
          pendingActionState: newPendingActionState,
          status: newStatus,
          roundWinner,
          winner: matchWinner,
          updatedAt: timestamp,
        };
        break;
      }

      case 'DRAW_CARD': {
        const playerIndex = state.currentPlayerIndex;
        const player = state.players[playerIndex];

        const drawResult = this.drawCards(state.drawPile, state.discardPile, 1, activeSide, rng);
        if (drawResult.drawnCards.length === 0) {
          throw new Error('No cards available to draw.');
        }

        const drawnCard = drawResult.drawnCards[0];
        const isPlayable = FlipMoveValidator.isCardMatch(drawnCard, state.activeColor, state.topDiscardCard);

        if (isPlayable) {
          // Case A: Drawn card is playable -> turn stays with player
          const updatedPlayers = state.players.map((p, idx) =>
            idx === playerIndex
              ? {
                  ...p,
                  hand: [...p.hand, drawnCard],
                  hasDrawnThisTurn: true,
                  drawnCardId: drawnCard.id,
                }
              : p
          );

          generatedEvents.push({
            type: 'CARDS_DRAWN',
            playerId: player.id,
            payload: { count: 1, reason: 'PLAYER_DRAW', isPlayable: true, cardId: drawnCard.id },
            timestamp,
          });

          intermediateState = {
            ...state,
            players: updatedPlayers,
            drawPile: drawResult.newDrawPile,
            discardPile: drawResult.newDiscardPile,
            unoVulnerablePlayerId: null, // Drawing clears vulnerability
            updatedAt: timestamp,
          };
        } else {
          // Case B: Drawn card is not playable -> turn ends immediately and passes to next player
          const nextPlayerIndex = TurnManager.getNextPlayerIndex(
            state.currentPlayerIndex,
            state.players.length,
            state.turnDirection,
            1
          );

          const updatedPlayers = state.players.map((p, idx) =>
            idx === playerIndex
              ? {
                  ...p,
                  hand: [...p.hand, drawnCard],
                  hasDrawnThisTurn: false,
                  drawnCardId: null,
                }
              : p
          );

          generatedEvents.push({
            type: 'CARDS_DRAWN',
            playerId: player.id,
            payload: { count: 1, reason: 'PLAYER_DRAW', isPlayable: false, cardId: drawnCard.id },
            timestamp,
          });

          intermediateState = {
            ...state,
            players: updatedPlayers,
            currentPlayerIndex: nextPlayerIndex,
            turnNumber: state.turnNumber + 1,
            drawPile: drawResult.newDrawPile,
            discardPile: drawResult.newDiscardPile,
            unoVulnerablePlayerId: null,
            updatedAt: timestamp,
          };
        }
        break;
      }

      case 'PASS_TURN': {
        const nextPlayerIndex = TurnManager.getNextPlayerIndex(
          state.currentPlayerIndex,
          state.players.length,
          state.turnDirection,
          1
        );

        const updatedPlayers = state.players.map((p, idx) =>
          idx === state.currentPlayerIndex
            ? {
                ...p,
                hasDrawnThisTurn: false,
                drawnCardId: null,
              }
            : p
        );

        generatedEvents.push({
          type: 'TURN_ADVANCED',
          playerId: state.players[state.currentPlayerIndex].id,
          payload: { reason: 'PASS' },
          timestamp,
        });

        intermediateState = {
          ...state,
          players: updatedPlayers,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          unoVulnerablePlayerId: null,
          updatedAt: timestamp,
        };
        break;
      }

      case 'CALL_UNO': {
        const updatedPlayers = state.players.map((p) =>
          p.id === action.playerId ? { ...p, hasDeclaredUno: true } : p
        );

        generatedEvents.push({
          type: 'UNO_DECLARED',
          playerId: action.playerId,
          payload: { declared: true },
          timestamp,
        });

        intermediateState = {
          ...state,
          players: updatedPlayers,
          unoVulnerablePlayerId: state.unoVulnerablePlayerId,
          updatedAt: timestamp,
        };
        break;
      }

      case 'CHALLENGE_UNO_FAILURE': {
        const targetPlayer = state.players.find((p) => p.id === action.targetPlayerId)!;
        // Official Mattel GDR44 penalty: 2 cards (differs from Classic 4 cards)
        const penaltyCount = UNO_FLIP_RULES.MISSED_UNO_PENALTY_CARDS;
        const drawResult = this.drawCards(state.drawPile, state.discardPile, penaltyCount, activeSide, rng);

        const updatedPlayers = state.players.map((p) =>
          p.id === targetPlayer.id ? { ...p, hand: [...p.hand, ...drawResult.drawnCards] } : p
        );

        generatedEvents.push({
          type: 'UNO_CHALLENGE_SUCCESS',
          playerId: action.challengerPlayerId,
          payload: {
            caughtPlayerId: targetPlayer.id,
            penaltyCardsDrawn: drawResult.drawnCards.length,
          },
          timestamp,
        });

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: drawResult.newDrawPile,
          discardPile: drawResult.newDiscardPile,
          unoVulnerablePlayerId: null,
          updatedAt: timestamp,
        };
        break;
      }

      case 'CHALLENGE_WILD_DRAW_TWO': {
        const pending = state.pendingActionState;
        if (!pending || pending.type !== 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
          throw new Error('No pending Wild Draw Two to challenge.');
        }

        const offender = state.players.find((p) => p.id === pending.playedByPlayerId)!;
        const challenger = state.players.find((p) => p.id === action.challengerPlayerId)!;
        const challengerIndex = state.players.findIndex((p) => p.id === challenger.id);
        const isOffenderGuilty = !pending.wasOfficiallyLegal;

        let updatedPlayers = [...state.players];
        let newDrawPile = [...state.drawPile];
        let newDiscardPile = [...state.discardPile];
        let nextPlayerIndex = challengerIndex;

        if (isOffenderGuilty) {
          // Offender draws 2 cards as penalty; challenger draws 0
          const drawResult = this.drawCards(newDrawPile, newDiscardPile, 2, activeSide, rng);
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id
              ? {
                  ...p,
                  hand: [...p.hand, ...drawResult.drawnCards],
                  hasDeclaredUno: false,
                  hasDrawnThisTurn: false,
                  drawnCardId: null,
                }
              : p
          );

          generatedEvents.push({
            type: 'WILD_DRAW_TWO_CHALLENGE_WON',
            playerId: challenger.id,
            payload: {
              offenderId: offender.id,
              penaltyCardsDrawn: 2,
            },
            timestamp,
          });

          // Challenger plays next
          nextPlayerIndex = challengerIndex;
        } else {
          // Offender was innocent: challenger draws 4 cards (2 + 2 penalty) and loses turn!
          const drawResult = this.drawCards(newDrawPile, newDiscardPile, 4, activeSide, rng);
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === challenger.id
              ? {
                  ...p,
                  hand: [...p.hand, ...drawResult.drawnCards],
                  hasDeclaredUno: false,
                  hasDrawnThisTurn: false,
                  drawnCardId: null,
                }
              : p
          );

          generatedEvents.push({
            type: 'WILD_DRAW_TWO_CHALLENGE_LOST',
            playerId: challenger.id,
            payload: {
              offenderId: offender.id,
              penaltyCardsDrawn: 4,
            },
            timestamp,
          });

          if (updatedPlayers.length === 2) {
            nextPlayerIndex = state.players.findIndex((p) => p.id === offender.id);
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              challengerIndex,
              updatedPlayers.length,
              state.turnDirection,
              1
            );
          }
        }

        // Check if offender had 0 cards and round finishes after challenge resolution
        const offenderPlayer = updatedPlayers.find((p) => p.id === offender.id)!;
        let newStatus = state.status;
        let roundWinner: GameWinner | null = null;
        let matchWinner: GameWinner | null = null;

        if (offenderPlayer.hand.length === 0) {
          newStatus = 'ROUND_OVER';
          const loserHands = updatedPlayers.filter((p) => p.id !== offender.id).map((p) => p.hand);
          const pointsScored = this.calculateRoundScore(loserHands, activeSide);

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id ? { ...p, score: p.score + pointsScored } : p
          );

          roundWinner = {
            id: offender.id,
            username: offender.username,
            score: updatedPlayers.find((p) => p.id === offender.id)!.score,
            roundScore: pointsScored,
          };

          if (roundWinner.score >= state.targetScore) {
            newStatus = 'COMPLETED';
            matchWinner = roundWinner;
          }
        }

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: newDrawPile,
          discardPile: newDiscardPile,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          pendingActionState: null,
          inspectionHand: null,
          unoVulnerablePlayerId: null,
          status: newStatus,
          roundWinner,
          winner: matchWinner,
          updatedAt: timestamp,
        };
        break;
      }

      case 'ACCEPT_WILD_DRAW_TWO': {
        const pending = state.pendingActionState;
        if (!pending || pending.type !== 'AWAITING_WILD_DRAW_TWO_RESOLUTION') {
          throw new Error('No pending Wild Draw Two to accept.');
        }

        const victim = state.players.find((p) => p.id === action.playerId)!;
        const victimIndex = state.players.findIndex((p) => p.id === victim.id);
        const offender = state.players.find((p) => p.id === pending.playedByPlayerId)!;

        // Victim draws 2 cards and loses turn
        const drawResult = this.drawCards(state.drawPile, state.discardPile, 2, activeSide, rng);

        let updatedPlayers = state.players.map((p) =>
          p.id === victim.id
            ? {
                ...p,
                hand: [...p.hand, ...drawResult.drawnCards],
                hasDeclaredUno: false,
                hasDrawnThisTurn: false,
                drawnCardId: null,
              }
            : p
        );

        generatedEvents.push({
          type: 'WILD_DRAW_TWO_ACCEPTED',
          playerId: victim.id,
          payload: { cardsDrawn: 2 },
          timestamp,
        });

        let nextPlayerIndex: number;
        if (updatedPlayers.length === 2) {
          nextPlayerIndex = state.players.findIndex((p) => p.id === offender.id);
        } else {
          nextPlayerIndex = TurnManager.getNextPlayerIndex(
            victimIndex,
            updatedPlayers.length,
            state.turnDirection,
            1
          );
        }

        // Check if offender had 0 cards
        let newStatus = state.status;
        let roundWinner: GameWinner | null = null;
        let matchWinner: GameWinner | null = null;

        if (offender.hand.length === 0) {
          newStatus = 'ROUND_OVER';
          const loserHands = updatedPlayers.filter((p) => p.id !== offender.id).map((p) => p.hand);
          const pointsScored = this.calculateRoundScore(loserHands, activeSide);

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id ? { ...p, score: p.score + pointsScored } : p
          );

          roundWinner = {
            id: offender.id,
            username: offender.username,
            score: updatedPlayers.find((p) => p.id === offender.id)!.score,
            roundScore: pointsScored,
          };

          if (roundWinner.score >= state.targetScore) {
            newStatus = 'COMPLETED';
            matchWinner = roundWinner;
          }
        }

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: drawResult.newDrawPile,
          discardPile: drawResult.newDiscardPile,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          pendingActionState: null,
          inspectionHand: null,
          unoVulnerablePlayerId: null,
          status: newStatus,
          roundWinner,
          winner: matchWinner,
          updatedAt: timestamp,
        };
        break;
      }

      case 'CHALLENGE_WILD_DRAW_COLOR': {
        const pending = state.pendingActionState;
        if (!pending || pending.type !== 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
          throw new Error('No pending Wild Draw Color to challenge.');
        }

        const offender = state.players.find((p) => p.id === pending.playedByPlayerId)!;
        const challenger = state.players.find((p) => p.id === action.challengerPlayerId)!;
        const challengerIndex = state.players.findIndex((p) => p.id === challenger.id);
        const isOffenderGuilty = !pending.wasOfficiallyLegal;

        let updatedPlayers = [...state.players];
        let newDrawPile = [...state.drawPile];
        let newDiscardPile = [...state.discardPile];
        let nextPlayerIndex = challengerIndex;

        if (isOffenderGuilty) {
          // Offender draws until chosen dark color; challenger draws 0
          const drawResult = this.drawUntilColor(
            newDrawPile,
            newDiscardPile,
            pending.chosenColor,
            activeSide,
            0,
            rng
          );
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id
              ? {
                  ...p,
                  hand: [...p.hand, ...drawResult.drawnCards],
                  hasDeclaredUno: false,
                  hasDrawnThisTurn: false,
                  drawnCardId: null,
                }
              : p
          );

          generatedEvents.push({
            type: 'WILD_DRAW_COLOR_CHALLENGE_WON',
            playerId: challenger.id,
            payload: {
              offenderId: offender.id,
              penaltyCardsDrawn: drawResult.drawnCards.length,
            },
            timestamp,
          });

          // Challenger plays next
          nextPlayerIndex = challengerIndex;
        } else {
          // Offender was innocent: challenger draws until chosen dark color + 2 cards, and loses turn!
          const drawResult = this.drawUntilColor(
            newDrawPile,
            newDiscardPile,
            pending.chosenColor,
            activeSide,
            2,
            rng
          );
          newDrawPile = drawResult.newDrawPile;
          newDiscardPile = drawResult.newDiscardPile;

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === challenger.id
              ? {
                  ...p,
                  hand: [...p.hand, ...drawResult.drawnCards],
                  hasDeclaredUno: false,
                  hasDrawnThisTurn: false,
                  drawnCardId: null,
                }
              : p
          );

          generatedEvents.push({
            type: 'WILD_DRAW_COLOR_CHALLENGE_LOST',
            playerId: challenger.id,
            payload: {
              offenderId: offender.id,
              penaltyCardsDrawn: drawResult.drawnCards.length,
            },
            timestamp,
          });

          if (updatedPlayers.length === 2) {
            nextPlayerIndex = state.players.findIndex((p) => p.id === offender.id);
          } else {
            nextPlayerIndex = TurnManager.getNextPlayerIndex(
              challengerIndex,
              updatedPlayers.length,
              state.turnDirection,
              1
            );
          }
        }

        const offenderPlayer = updatedPlayers.find((p) => p.id === offender.id)!;
        let newStatus = state.status;
        let roundWinner: GameWinner | null = null;
        let matchWinner: GameWinner | null = null;

        if (offenderPlayer.hand.length === 0) {
          newStatus = 'ROUND_OVER';
          const loserHands = updatedPlayers.filter((p) => p.id !== offender.id).map((p) => p.hand);
          const pointsScored = this.calculateRoundScore(loserHands, activeSide);

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id ? { ...p, score: p.score + pointsScored } : p
          );

          roundWinner = {
            id: offender.id,
            username: offender.username,
            score: updatedPlayers.find((p) => p.id === offender.id)!.score,
            roundScore: pointsScored,
          };

          if (roundWinner.score >= state.targetScore) {
            newStatus = 'COMPLETED';
            matchWinner = roundWinner;
          }
        }

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: newDrawPile,
          discardPile: newDiscardPile,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          pendingActionState: null,
          inspectionHand: null,
          unoVulnerablePlayerId: null,
          status: newStatus,
          roundWinner,
          winner: matchWinner,
          updatedAt: timestamp,
        };
        break;
      }

      case 'ACCEPT_WILD_DRAW_COLOR': {
        const pending = state.pendingActionState;
        if (!pending || pending.type !== 'AWAITING_WILD_DRAW_COLOR_RESOLUTION') {
          throw new Error('No pending Wild Draw Color to accept.');
        }

        const victim = state.players.find((p) => p.id === action.playerId)!;
        const victimIndex = state.players.findIndex((p) => p.id === victim.id);
        const offender = state.players.find((p) => p.id === pending.playedByPlayerId)!;

        // Victim draws until chosen dark color, then loses turn
        const drawResult = this.drawUntilColor(
          state.drawPile,
          state.discardPile,
          pending.chosenColor,
          activeSide,
          0,
          rng
        );

        let updatedPlayers = state.players.map((p) =>
          p.id === victim.id
            ? {
                ...p,
                hand: [...p.hand, ...drawResult.drawnCards],
                hasDeclaredUno: false,
                hasDrawnThisTurn: false,
                drawnCardId: null,
              }
            : p
        );

        generatedEvents.push({
          type: 'WILD_DRAW_COLOR_ACCEPTED',
          playerId: victim.id,
          payload: { cardsDrawn: drawResult.drawnCards.length },
          timestamp,
        });

        let nextPlayerIndex: number;
        if (updatedPlayers.length === 2) {
          nextPlayerIndex = state.players.findIndex((p) => p.id === offender.id);
        } else {
          nextPlayerIndex = TurnManager.getNextPlayerIndex(
            victimIndex,
            updatedPlayers.length,
            state.turnDirection,
            1
          );
        }

        let newStatus = state.status;
        let roundWinner: GameWinner | null = null;
        let matchWinner: GameWinner | null = null;

        if (offender.hand.length === 0) {
          newStatus = 'ROUND_OVER';
          const loserHands = updatedPlayers.filter((p) => p.id !== offender.id).map((p) => p.hand);
          const pointsScored = this.calculateRoundScore(loserHands, activeSide);

          updatedPlayers = updatedPlayers.map((p) =>
            p.id === offender.id ? { ...p, score: p.score + pointsScored } : p
          );

          roundWinner = {
            id: offender.id,
            username: offender.username,
            score: updatedPlayers.find((p) => p.id === offender.id)!.score,
            roundScore: pointsScored,
          };

          if (roundWinner.score >= state.targetScore) {
            newStatus = 'COMPLETED';
            matchWinner = roundWinner;
          }
        }

        intermediateState = {
          ...state,
          players: updatedPlayers,
          drawPile: drawResult.newDrawPile,
          discardPile: drawResult.newDiscardPile,
          currentPlayerIndex: nextPlayerIndex,
          turnNumber: state.turnNumber + 1,
          pendingActionState: null,
          inspectionHand: null,
          unoVulnerablePlayerId: null,
          status: newStatus,
          roundWinner,
          winner: matchWinner,
          updatedAt: timestamp,
        };
        break;
      }

      case 'CHOOSE_STARTING_WILD_COLOR': {
        const pending = state.pendingActionState;
        if (!pending || pending.type !== 'AWAITING_STARTING_WILD_COLOR_SELECTION') {
          throw new Error('No pending starting Wild color selection to choose.');
        }

        if (pending.designatedPlayerId !== action.playerId) {
          throw new Error('Only the designated player can choose the starting Wild color.');
        }

        generatedEvents.push({
          type: 'STARTING_WILD_COLOR_CHOSEN',
          playerId: action.playerId,
          payload: { chosenColor: action.chosenColor },
          timestamp,
        });

        intermediateState = {
          ...state,
          activeColor: action.chosenColor,
          pendingActionState: null,
          updatedAt: timestamp,
        };
        break;
      }

      default:
        throw new Error(`Unsupported action type in UNO Flip: ${(action as { type: string }).type}`);
    }

    // Sequence invariant: advance sequence numbers monotonically
    let runningSeq = state.sequenceNumber;
    const finalEvents: GameEventRecord[] = [];

    for (const rawEvent of generatedEvents) {
      runningSeq++;
      finalEvents.push({
        ...rawEvent,
        sequenceNumber: runningSeq,
      });
    }

    return {
      nextState: {
        ...intermediateState,
        sequenceNumber: runningSeq,
      },
      events: finalEvents,
    };
  }
}
