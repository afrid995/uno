import { GameState, GameWinner, PendingActionState } from '../../game/game.types';
import {
  GameAction,
  GameEventRecord,
  PlayCardAction,
  CallUnoAction,
  ChallengeUnoFailureAction,
  TeamInitialPassAction,
  TeamCardPassAction,
  TeamSplitHandPassAction,
} from '../../actions/action.types';
import { Card, CardColor } from '../../cards/card.types';
import { isWildCard } from '../../cards/card.validation';
import { DeckManager } from '../../deck/deck.manager';
import { HandManager } from '../../players/hand.manager';
import { Player } from '../../players/player.types';
import { TurnManager } from '../../turns/turn.manager';
import { RandomNumberGenerator, defaultCryptoRng, shuffleDeck } from '../../deck/deck.shuffle';
import { TeamsMoveValidator } from './teams.validator';
import { UNO_TEAMS_RULES } from './teams.constants';
import { TeamsDeckFactory } from './teams.deck';
import { getPartnerId } from './teams.types';
import { assertValidTeamsGameState } from './teams.invariants';
import { ActionProcessResult } from '../../actions/action.processor';

export class TeamsActionProcessor {
  static process(
    state: GameState,
    action: GameAction,
    rng: RandomNumberGenerator = defaultCryptoRng
  ): ActionProcessResult {
    // 1. Validate action legality
    const validation = TeamsMoveValidator.validate(state, action);
    if (!validation.valid) {
      throw new Error(`[${validation.code}] ${validation.message}`);
    }

    const events: GameEventRecord[] = [];
    const timestamp = new Date().toISOString();
    let currentSeq = state.sequenceNumber;

    const addEvent = (type: string, playerId: string | undefined, payload: Record<string, unknown>) => {
      currentSeq += 1;
      events.push({
        sequenceNumber: currentSeq,
        type,
        playerId,
        payload,
        timestamp,
      });
    };

    let nextState: GameState = {
      ...state,
      sequenceNumber: currentSeq,
      updatedAt: timestamp,
    };

    // 2. Dispatch action
    switch (action.type) {
      case 'TEAM_INITIAL_PASS':
        nextState = this.handleTeamInitialPass(nextState, action, addEvent);
        break;
      case 'TEAM_CARD_PASS':
        nextState = this.handleTeamCardPass(nextState, action, addEvent);
        break;
      case 'TEAM_SPLIT_HAND_PASS':
        nextState = this.handleTeamSplitHandPass(nextState, action, addEvent);
        break;
      case 'PLAY_CARD':
        nextState = this.handlePlayCard(nextState, action, rng, addEvent);
        break;
      case 'DRAW_CARD':
        nextState = this.handleDrawCard(nextState, action.playerId, rng, addEvent);
        break;
      case 'PASS_TURN':
        nextState = this.handlePassTurn(nextState, action.playerId, addEvent);
        break;
      case 'CALL_UNO':
        nextState = this.handleCallUno(nextState, action, addEvent);
        break;
      case 'CHALLENGE_UNO_FAILURE':
        nextState = this.handleChallengeUnoFailure(nextState, action, rng, addEvent);
        break;
      case 'CHOOSE_STARTING_WILD_COLOR':
        nextState = this.handleChooseStartingWildColor(nextState, action.playerId, action.chosenColor, addEvent);
        break;
      case 'START_NEXT_ROUND':
        nextState = this.handleStartNextRound(nextState, rng, addEvent);
        break;
      default:
        throw new Error(`Unsupported action type: ${(action as GameAction).type}`);
    }

    nextState = {
      ...nextState,
      sequenceNumber: currentSeq,
    };

    assertValidTeamsGameState(nextState);
    return { nextState, events };
  }

  // --- Handlers ---

  private static handleTeamInitialPass(
    state: GameState,
    action: TeamInitialPassAction,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_INITIAL_PASS') {
      throw new Error('Not in initial team pass state.');
    }

    const { playerId, cardId } = action;
    const newSelections = {
      ...pending.selections,
      [playerId]: cardId,
    };

    addEvent('TEAM_INITIAL_CARD_SELECTED', playerId, { cardId });

    // Check if all players have submitted their selection
    const allSubmitted = state.players.every((p) => !!newSelections[p.id]);

    if (!allSubmitted) {
      return {
        ...state,
        pendingActionState: {
          type: 'AWAITING_TEAM_INITIAL_PASS',
          selections: newSelections,
        },
      };
    }

    // All players submitted! Execute simultaneous swaps across partners
    const updatedPlayers: Player[] = state.players.map((player) => {
      const partnerId = getPartnerId(player.id, state);
      const passedCardId = newSelections[player.id];
      const receivedCardId = newSelections[partnerId];

      const partner = state.players.find((p) => p.id === partnerId)!;
      const receivedCard = partner.hand.find((c) => c.id === receivedCardId)!;

      const remainingHand = player.hand.filter((c) => c.id !== passedCardId);
      return {
        ...player,
        hand: [...remainingHand, receivedCard],
      };
    });

    addEvent('TEAM_INITIAL_PASS_COMPLETED', undefined, {
      swaps: state.players.map((p) => ({
        fromPlayerId: p.id,
        toPlayerId: getPartnerId(p.id, state),
        cardId: newSelections[p.id],
      })),
    });

    return {
      ...state,
      players: updatedPlayers,
      pendingActionState: null,
    };
  }

  private static handleTeamCardPass(
    state: GameState,
    action: TeamCardPassAction,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_CARD_PASS') {
      throw new Error('Not in team card pass state.');
    }

    const { playerId, cardId } = action;
    const newSelections = {
      ...pending.selections,
      [playerId]: cardId,
    };

    addEvent('TEAM_CARD_SELECTED', playerId, { cardId });

    const { player1Id, player2Id } = pending;
    const bothSubmitted = !!newSelections[player1Id] && !!newSelections[player2Id];

    if (!bothSubmitted) {
      return {
        ...state,
        pendingActionState: {
          ...pending,
          selections: newSelections,
        },
      };
    }

    // Both players submitted! Swap cards
    const card1Id = newSelections[player1Id];
    const card2Id = newSelections[player2Id];

    const p1 = state.players.find((p) => p.id === player1Id)!;
    const p2 = state.players.find((p) => p.id === player2Id)!;

    const card1 = p1.hand.find((c) => c.id === card1Id)!;
    const card2 = p2.hand.find((c) => c.id === card2Id)!;

    const updatedPlayers = state.players.map((p) => {
      if (p.id === player1Id) {
        return {
          ...p,
          hand: [...p.hand.filter((c) => c.id !== card1Id), card2],
        };
      }
      if (p.id === player2Id) {
        return {
          ...p,
          hand: [...p.hand.filter((c) => c.id !== card2Id), card1],
        };
      }
      return p;
    });

    addEvent('TEAM_CARD_PASS_COMPLETED', undefined, {
      player1Id,
      player2Id,
      passedToP2: card1Id,
      passedToP1: card2Id,
    });

    // Advance turn to next active player
    const nextPlayerIndex = this.getNextActivePlayerIndex(
      state.currentPlayerIndex,
      state.players.length,
      state.turnDirection,
      1,
      updatedPlayers
    );

    return {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      pendingActionState: null,
      turnNumber: state.turnNumber + 1,
    };
  }

  private static handleTeamSplitHandPass(
    state: GameState,
    action: TeamSplitHandPassAction,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const pending = state.pendingActionState;
    if (!pending || pending.type !== 'AWAITING_TEAM_HAND_SPLIT') {
      throw new Error('Not in team hand split state.');
    }

    const { giverPlayerId, receiverPlayerId, nextPlayerTurnIndex } = pending;
    const { cardIds } = action;

    const giver = state.players.find((p) => p.id === giverPlayerId)!;

    const cardsToPass = giver.hand.filter((c) => cardIds.includes(c.id));
    const remainingGiverHand = giver.hand.filter((c) => !cardIds.includes(c.id));

    const updatedPlayers = state.players.map((p) => {
      if (p.id === giverPlayerId) {
        return {
          ...p,
          hand: remainingGiverHand,
          hasDeclaredUno: remainingGiverHand.length === 1 ? p.hasDeclaredUno : false,
        };
      }
      if (p.id === receiverPlayerId) {
        return {
          ...p,
          hand: [...p.hand, ...cardsToPass],
          isOut: false,
          hasDeclaredUno: false,
        };
      }
      return p;
    });

    addEvent('TEAM_HAND_SPLIT_COMPLETED', giverPlayerId, {
      receiverPlayerId,
      cardsPassedCount: cardsToPass.length,
      cardIds,
    });

    const nextCurrentPlayerIndex =
      nextPlayerTurnIndex !== undefined
        ? nextPlayerTurnIndex
        : state.currentPlayerIndex;

    return {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextCurrentPlayerIndex,
      pendingActionState: null,
    };
  }

  private static handlePlayCard(
    state: GameState,
    action: PlayCardAction,
    rng: RandomNumberGenerator,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const { playerId, cardId, chosenColor } = action;
    const player = state.players[state.currentPlayerIndex];
    const playedCard = player.hand.find((c) => c.id === cardId)!;

    // Remove card from player hand
    const remainingHand = player.hand.filter((c) => c.id !== cardId);

    // Track missed UNO vulnerability
    let unoVulnerablePlayerId = state.unoVulnerablePlayerId;
    if (unoVulnerablePlayerId === playerId) {
      unoVulnerablePlayerId = null;
    }
    if (remainingHand.length === 1 && !player.hasDeclaredUno) {
      unoVulnerablePlayerId = playerId;
    }

    const updatedCurrentPlayer: Player = {
      ...player,
      hand: remainingHand,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      hasDeclaredUno: remainingHand.length === 1 ? player.hasDeclaredUno : false,
    };

    let updatedPlayers = state.players.map((p, idx) =>
      idx === state.currentPlayerIndex ? updatedCurrentPlayer : p
    );

    const discardPile = [...state.discardPile, playedCard];
    const activeColor = isWildCard(playedCard) ? chosenColor! : (playedCard.color ?? state.activeColor);

    addEvent('CARD_PLAYED', playerId, {
      cardId,
      color: playedCard.color,
      value: playedCard.value,
      type: playedCard.type,
      chosenColor,
      remainingCards: remainingHand.length,
    });

    // CHECK GOING OUT: Did this player empty their hand?
    const partnerId = getPartnerId(playerId, state);
    const partner = updatedPlayers.find((p) => p.id === partnerId)!;

    if (remainingHand.length === 0) {
      // Player has 0 cards!
      const partnerCardCount = partner.hand.length;

      if (partnerCardCount === 0) {
        // BOTH PARTNERS HAVE 0 CARDS! TEAM WINS!
        return this.handleTeamVictory(
          {
            ...state,
            players: updatedPlayers,
            discardPile,
            topDiscardCard: playedCard,
            activeColor,
            unoVulnerablePlayerId,
          },
          player.teamId!,
          addEvent
        );
      }

      if (partnerCardCount === 1) {
        // Partner has exactly 1 card: partner keeps it, player stays out of game
        updatedPlayers = updatedPlayers.map((p) =>
          p.id === playerId ? { ...p, isOut: true } : p
        );
        addEvent('PLAYER_OUT_OF_GAME', playerId, {
          reason: 'EMPTIED_HAND_PARTNER_HAS_ONE_CARD',
          partnerId,
        });
      } else {
        // Partner has > 1 card: partner passes half to player!
        // Math.floor(n / 2) passed to player, partner keeps Math.ceil(n / 2)
        const cardsToPassCount = Math.floor(partnerCardCount / 2);
        // Automatically split cards from partner (take first cardsToPassCount cards)
        const cardsToPass = partner.hand.slice(0, cardsToPassCount);
        const partnerRemainingHand = partner.hand.slice(cardsToPassCount);

        updatedPlayers = updatedPlayers.map((p) => {
          if (p.id === partnerId) {
            return {
              ...p,
              hand: partnerRemainingHand,
              hasDeclaredUno: partnerRemainingHand.length === 1 ? p.hasDeclaredUno : false,
            };
          }
          if (p.id === playerId) {
            return {
              ...p,
              hand: cardsToPass,
              isOut: false,
              hasDeclaredUno: false,
            };
          }
          return p;
        });

        addEvent('TEAM_HAND_SPLIT_COMPLETED', partnerId, {
          receiverPlayerId: playerId,
          cardsPassedCount: cardsToPassCount,
          cardIds: cardsToPass.map((c) => c.id),
        });
      }
    }

    // Now resolve played card action effect
    let turnDirection = state.turnDirection;
    let drawPile = [...state.drawPile];
    let discard = discardPile;
    let pendingActionState: PendingActionState | null = null;
    let nextPlayerIndex = state.currentPlayerIndex;

    const advanceTurn = (steps: number) => {
      return this.getNextActivePlayerIndex(
        state.currentPlayerIndex,
        updatedPlayers.length,
        turnDirection,
        steps,
        updatedPlayers
      );
    };

    if (playedCard.value === 'reverse') {
      turnDirection = turnDirection === 'clockwise' ? 'counter_clockwise' : 'clockwise';
      addEvent('DIRECTION_REVERSED', playerId, { turnDirection });
      nextPlayerIndex = this.getNextActivePlayerIndex(
        state.currentPlayerIndex,
        updatedPlayers.length,
        turnDirection,
        1,
        updatedPlayers
      );
    } else if (playedCard.value === 'skip') {
      const skippedIndex = advanceTurn(1);
      const skippedPlayer = updatedPlayers[skippedIndex];
      addEvent('PLAYER_SKIPPED', skippedPlayer.id, { skippedBy: playerId });
      nextPlayerIndex = advanceTurn(2);
    } else if (playedCard.value === 'draw_two') {
      const victimIndex = advanceTurn(1);
      const victim = updatedPlayers[victimIndex];

      const drawResult = DeckManager.drawCards(drawPile, discard, 2, rng);
      drawPile = [...drawResult.newDrawPile];
      discard = [...drawResult.newDiscardPile];

      let newVictimHand = [...victim.hand, ...drawResult.drawnCards];
      let victimPartnerHand = [...updatedPlayers.find((p) => p.id === getPartnerId(victim.id, state))!.hand];
      let victimPartnerIsOut = updatedPlayers.find((p) => p.id === getPartnerId(victim.id, state))!.isOut;

      // Check Tagging Back In for victim's partner
      if (victimPartnerIsOut) {
        // Victim passes half of cards to partner, partner tagged back in!
        const totalCards = newVictimHand.length;
        const passCount = Math.floor(totalCards / 2);
        const passedToPartner = newVictimHand.slice(0, passCount);
        newVictimHand = newVictimHand.slice(passCount);
        victimPartnerHand = [...victimPartnerHand, ...passedToPartner];
        victimPartnerIsOut = false;

        addEvent('TEAM_TAGGED_BACK_IN', getPartnerId(victim.id, state), {
          taggedInBy: victim.id,
          cardsReceived: passCount,
        });
      }

      const vPartnerId = getPartnerId(victim.id, state);
      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id === victim.id) {
          return { ...p, hand: newVictimHand, hasDeclaredUno: false };
        }
        if (p.id === vPartnerId) {
          return { ...p, hand: victimPartnerHand, isOut: victimPartnerIsOut };
        }
        return p;
      });

      addEvent('CARDS_DRAWN', victim.id, {
        count: 2,
        reason: 'DRAW_TWO_PENALTY',
        drawnBy: victim.id,
      });

      addEvent('PLAYER_SKIPPED', victim.id, { skippedBy: playerId });
      nextPlayerIndex = advanceTurn(2);
    } else if (playedCard.value === 'wild_team_draw_four') {
      // Next player in rotation draws 2 and skips, AND their teammate draws 2!
      const victimIndex = advanceTurn(1);
      const victim = updatedPlayers[victimIndex];
      const victimPartnerId = getPartnerId(victim.id, state);

      // Draw 2 for victim
      const drawVictim = DeckManager.drawCards(drawPile, discard, 2, rng);
      drawPile = [...drawVictim.newDrawPile];
      discard = [...drawVictim.newDiscardPile];

      // Draw 2 for victim's partner (even if out)
      const drawPartner = DeckManager.drawCards(drawPile, discard, 2, rng);
      drawPile = [...drawPartner.newDrawPile];
      discard = [...drawPartner.newDiscardPile];

      updatedPlayers = updatedPlayers.map((p) => {
        if (p.id === victim.id) {
          return { ...p, hand: [...p.hand, ...drawVictim.drawnCards], hasDeclaredUno: false };
        }
        if (p.id === victimPartnerId) {
          return {
            ...p,
            hand: [...p.hand, ...drawPartner.drawnCards],
            isOut: false, // Tagged back in!
            hasDeclaredUno: false,
          };
        }
        return p;
      });

      addEvent('CARDS_DRAWN', victim.id, {
        count: 2,
        reason: 'WILD_TEAM_DRAW_FOUR',
      });
      addEvent('CARDS_DRAWN', victimPartnerId, {
        count: 2,
        reason: 'WILD_TEAM_DRAW_FOUR',
      });
      addEvent('PLAYER_SKIPPED', victim.id, { skippedBy: playerId });

      nextPlayerIndex = advanceTurn(2);
    } else if (playedCard.value === 'wild_team_play') {
      // First choose a color (already in activeColor). Play SKIPS directly to partner!
      const partnerIndex = updatedPlayers.findIndex((p) => p.id === partnerId);
      const targetPartner = updatedPlayers[partnerIndex];

      addEvent('WILD_TEAM_PLAY_SKIPPED_TO_PARTNER', playerId, {
        partnerId,
        chosenColor: activeColor,
      });

      // Check if partner can play a card matching chosenColor or a Wild card
      const partnerHasPlayable = targetPartner.hand.some((c) => {
        if (isWildCard(c)) return true;
        return c.color === activeColor;
      });

      if (!partnerHasPlayable) {
        // Partner CANNOT play: card player must draw 2 penalty cards!
        const drawPenalty = DeckManager.drawCards(drawPile, discard, 2, rng);
        drawPile = [...drawPenalty.newDrawPile];
        discard = [...drawPenalty.newDiscardPile];

        updatedPlayers = updatedPlayers.map((p) =>
          p.id === playerId ? { ...p, hand: [...p.hand, ...drawPenalty.drawnCards], hasDeclaredUno: false } : p
        );

        addEvent('CARDS_DRAWN', playerId, {
          count: 2,
          reason: 'WILD_TEAM_PLAY_PARTNER_CANNOT_PLAY_PENALTY',
        });

        // Play continues from partner with chosen color: turn advances to player after partner
        nextPlayerIndex = this.getNextActivePlayerIndex(
          partnerIndex,
          updatedPlayers.length,
          turnDirection,
          1,
          updatedPlayers
        );
      } else {
        // Partner CAN play: partner's turn begins!
        nextPlayerIndex = partnerIndex;
      }
    } else if (playedCard.hasPassingSymbol) {
      // Number card with passing symbol:
      // If player still has cards and partner is active, enter AWAITING_TEAM_CARD_PASS
      const currentPlayerAfterPlay = updatedPlayers.find((p) => p.id === playerId)!;
      const partnerAfterPlay = updatedPlayers.find((p) => p.id === partnerId)!;

      if (currentPlayerAfterPlay.hand.length > 0 && !partnerAfterPlay.isOut && partnerAfterPlay.hand.length > 0) {
        pendingActionState = {
          type: 'AWAITING_TEAM_CARD_PASS',
          player1Id: playerId,
          player2Id: partnerId,
          selections: {},
        };
        addEvent('TEAM_CARD_PASS_TRIGGERED', playerId, {
          player1Id: playerId,
          player2Id: partnerId,
        });
        // Turn will advance after pass completes
        nextPlayerIndex = state.currentPlayerIndex;
      } else {
        nextPlayerIndex = advanceTurn(1);
      }
    } else {
      // Normal card: advance 1 active player
      nextPlayerIndex = advanceTurn(1);
    }

    return {
      ...state,
      players: updatedPlayers,
      drawPile,
      discardPile: discard,
      topDiscardCard: playedCard,
      activeColor,
      turnDirection,
      currentPlayerIndex: nextPlayerIndex,
      unoVulnerablePlayerId,
      pendingActionState,
      turnNumber: state.turnNumber + 1,
    };
  }

  private static handleDrawCard(
    state: GameState,
    playerId: string,
    rng: RandomNumberGenerator,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const player = state.players[state.currentPlayerIndex];
    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, 1, rng);
    const drawnCard = drawResult.drawnCards[0];

    addEvent('CARD_DRAWN', playerId, {
      cardId: drawnCard.id,
      cardsRemainingInDrawPile: drawResult.newDrawPile.length,
    });

    let newHand = [...player.hand, drawnCard];
    let partnerHand = [...state.players.find((p) => p.id === getPartnerId(playerId, state))!.hand];
    let partnerIsOut = state.players.find((p) => p.id === getPartnerId(playerId, state))!.isOut;

    // Check Tagging Back In: if partner is out, drawing cards tags partner back in!
    if (partnerIsOut) {
      const totalCards = newHand.length;
      const passCount = Math.floor(totalCards / 2);
      if (passCount > 0) {
        const passedToPartner = newHand.slice(0, passCount);
        newHand = newHand.slice(passCount);
        partnerHand = [...partnerHand, ...passedToPartner];
        partnerIsOut = false;

        addEvent('TEAM_TAGGED_BACK_IN', getPartnerId(playerId, state), {
          taggedInBy: playerId,
          cardsReceived: passCount,
        });
      }
    }

    const partnerId = getPartnerId(playerId, state);
    const updatedPlayers = state.players.map((p) => {
      if (p.id === playerId) {
        return {
          ...p,
          hand: newHand,
          hasDrawnThisTurn: true,
          drawnCardId: drawnCard.id,
          hasDeclaredUno: false,
        };
      }
      if (p.id === partnerId) {
        return {
          ...p,
          hand: partnerHand,
          isOut: partnerIsOut,
        };
      }
      return p;
    });

    return {
      ...state,
      players: updatedPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
    };
  }

  private static handlePassTurn(
    state: GameState,
    playerId: string,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const updatedPlayers = state.players.map((p) =>
      p.id === playerId
        ? { ...p, hasDrawnThisTurn: false, drawnCardId: null }
        : p
    );

    addEvent('TURN_PASSED', playerId, {});

    const nextPlayerIndex = this.getNextActivePlayerIndex(
      state.currentPlayerIndex,
      updatedPlayers.length,
      state.turnDirection,
      1,
      updatedPlayers
    );

    return {
      ...state,
      players: updatedPlayers,
      currentPlayerIndex: nextPlayerIndex,
      turnNumber: state.turnNumber + 1,
    };
  }

  private static handleCallUno(
    state: GameState,
    action: CallUnoAction,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const { playerId, targetPlayerId } = action;
    const targetId = targetPlayerId ?? playerId;

    const updatedPlayers = state.players.map((p) =>
      p.id === targetId ? { ...p, hasDeclaredUno: true } : p
    );

    addEvent('UNO_CALLED', playerId, { targetPlayerId: targetId });

    let unoVulnerablePlayerId = state.unoVulnerablePlayerId;
    if (unoVulnerablePlayerId === targetId) {
      unoVulnerablePlayerId = null;
    }

    return {
      ...state,
      players: updatedPlayers,
      unoVulnerablePlayerId,
    };
  }

  private static handleChallengeUnoFailure(
    state: GameState,
    action: ChallengeUnoFailureAction,
    rng: RandomNumberGenerator,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const { challengerPlayerId, targetPlayerId } = action;
    const target = state.players.find((p) => p.id === targetPlayerId)!;

    const drawResult = DeckManager.drawCards(state.drawPile, state.discardPile, UNO_TEAMS_RULES.MISSED_UNO_PENALTY_CARDS, rng);

    addEvent('UNO_CHALLENGE_SUCCESS', challengerPlayerId, {
      offenderPlayerId: targetPlayerId,
      penaltyCards: UNO_TEAMS_RULES.MISSED_UNO_PENALTY_CARDS,
    });

    let newHand = [...target.hand, ...drawResult.drawnCards];
    let partnerHand = [...state.players.find((p) => p.id === getPartnerId(targetPlayerId, state))!.hand];
    let partnerIsOut = state.players.find((p) => p.id === getPartnerId(targetPlayerId, state))!.isOut;

    // Check Tagging Back In
    if (partnerIsOut) {
      const totalCards = newHand.length;
      const passCount = Math.floor(totalCards / 2);
      if (passCount > 0) {
        const passedToPartner = newHand.slice(0, passCount);
        newHand = newHand.slice(passCount);
        partnerHand = [...partnerHand, ...passedToPartner];
        partnerIsOut = false;

        addEvent('TEAM_TAGGED_BACK_IN', getPartnerId(targetPlayerId, state), {
          taggedInBy: targetPlayerId,
          cardsReceived: passCount,
        });
      }
    }

    const targetPartnerId = getPartnerId(targetPlayerId, state);
    const updatedPlayers = state.players.map((p) => {
      if (p.id === targetPlayerId) {
        return { ...p, hand: newHand, hasDeclaredUno: false };
      }
      if (p.id === targetPartnerId) {
        return { ...p, hand: partnerHand, isOut: partnerIsOut };
      }
      return p;
    });

    return {
      ...state,
      players: updatedPlayers,
      drawPile: drawResult.newDrawPile,
      discardPile: drawResult.newDiscardPile,
      unoVulnerablePlayerId: null,
    };
  }

  private static handleChooseStartingWildColor(
    state: GameState,
    playerId: string,
    chosenColor: CardColor,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    addEvent('STARTING_WILD_COLOR_CHOSEN', playerId, { chosenColor });

    return {
      ...state,
      activeColor: chosenColor,
      pendingActionState: null,
    };
  }

  private static handleStartNextRound(
    state: GameState,
    rng: RandomNumberGenerator,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    const playerCount = state.players.length;
    const nextDealerIndex = (state.dealerIndex + 1) % playerCount;

    const deck = shuffleDeck(TeamsDeckFactory.createDeck(), rng);
    const playerIds = state.players.map((p) => p.id);
    const { hands, remainingDeck } = HandManager.dealInitialHands(deck, playerIds, UNO_TEAMS_RULES.INITIAL_HAND_SIZE);

    const drawPile = [...remainingDeck];
    const discardPile: Card[] = [];
    let topCard = drawPile.pop()!;
    while (topCard.type !== 'number') {
      discardPile.push(topCard);
      topCard = drawPile.pop()!;
    }
    discardPile.push(topCard);

    const startingPlayerIndex = (nextDealerIndex + 1) % playerCount;

    const nextPlayers: Player[] = state.players.map((p) => ({
      ...p,
      hand: hands.get(p.id)!,
      hasDeclaredUno: false,
      hasDrawnThisTurn: false,
      drawnCardId: null,
      isOut: false,
    }));

    addEvent('ROUND_STARTED', undefined, {
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
    });

    return {
      ...state,
      status: 'IN_PROGRESS',
      roundNumber: state.roundNumber + 1,
      dealerIndex: nextDealerIndex,
      players: nextPlayers,
      currentPlayerIndex: startingPlayerIndex,
      drawPile,
      discardPile,
      topDiscardCard: topCard,
      activeColor: topCard.color,
      turnNumber: 1,
      roundWinner: null,
      pendingActionState: {
        type: 'AWAITING_TEAM_INITIAL_PASS',
        selections: {},
      },
    };
  }

  private static handleTeamVictory(
    state: GameState,
    winningTeamId: string,
    addEvent: (type: string, playerId: string | undefined, payload: Record<string, unknown>) => void
  ): GameState {
    // Scoring: sum of score values of cards in losing teams' hands
    const losingPlayers = state.players.filter((p) => p.teamId !== winningTeamId);
    let roundPoints = 0;
    for (const lp of losingPlayers) {
      for (const card of lp.hand) {
        roundPoints += card.scoreValue;
      }
    }

    const winningPlayers = state.players.filter((p) => p.teamId === winningTeamId);
    const updatedPlayers = state.players.map((p) => {
      if (p.teamId === winningTeamId) {
        return {
          ...p,
          score: p.score + roundPoints,
        };
      }
      return p;
    });

    const winningTeamScore = updatedPlayers.find((p) => p.teamId === winningTeamId)!.score;
    const isMatchWon = winningTeamScore >= state.targetScore;

    const roundWinner: GameWinner = {
      id: winningPlayers[0].id,
      username: `${winningPlayers[0].username} & ${winningPlayers[1]?.username ?? ''} (${winningTeamId})`,
      score: winningTeamScore,
      roundScore: roundPoints,
    };

    const winner: GameWinner | null = isMatchWon ? roundWinner : null;

    addEvent('ROUND_FINISHED', undefined, {
      winningTeamId,
      roundPoints,
      winningTeamScore,
      isMatchWon,
    });

    return {
      ...state,
      status: isMatchWon ? 'COMPLETED' : 'ROUND_OVER',
      players: updatedPlayers,
      roundWinner,
      winner,
    };
  }

  // --- Utility ---

  static getNextActivePlayerIndex(
    currentIndex: number,
    totalPlayers: number,
    direction: 'clockwise' | 'counter_clockwise',
    steps: number,
    players: readonly Player[]
  ): number {
    let activeSteps = 0;
    let index = currentIndex;

    while (activeSteps < steps) {
      index = TurnManager.getNextPlayerIndex(index, totalPlayers, direction, 1);
      const player = players[index];
      if (!player.isOut && !player.isEliminated) {
        activeSteps++;
      }
    }

    return index;
  }
}
