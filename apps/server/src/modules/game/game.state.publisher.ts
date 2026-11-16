import { Server, Socket } from 'socket.io';
import {
  SOCKET_EVENTS,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '@uno-ultimate/game-protocol';
import { GameState, getPlayerGameState } from '@uno-ultimate/game-engine';
import { logger } from '../../utils/logger';

type UnoSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type UnoServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class GameStatePublisher {
  /**
   * Publishes a personalized, secure PlayerGameState to an individual player.
   * Conceals opponents' private hands and secret draw pile identities.
   */
  publishToPlayer(
    guestId: string,
    state: GameState,
    guestSockets: Map<string, UnoSocket>,
    io?: UnoServer
  ): void {
    let socket = guestSockets.get(guestId);
    if ((!socket || !socket.connected) && io) {
      for (const [, s] of io.sockets.sockets) {
        if (s.data.guestId === guestId && s.connected) {
          socket = s as UnoSocket;
          guestSockets.set(guestId, socket);
          break;
        }
      }
    }

    if (!socket || !socket.connected) {
      logger.debug('Cannot publish state to disconnected player; awaiting reconnect', { guestId });
      return;
    }

    try {
      const playerState = getPlayerGameState(state, guestId);
      socket.emit(SOCKET_EVENTS.GAME_STATE, { state: playerState });
    } catch (err: unknown) {
      logger.error('Error generating player state projection', { guestId, error: (err as Error).message });
    }
  }

  /**
   * Securely broadcasts personalized state projections to all match participants.
   * Every player receives their own distinct projection over their own socket connection.
   */
  publishToAllParticipants(
    state: GameState,
    guestSockets: Map<string, UnoSocket>,
    io?: UnoServer
  ): void {
    for (const player of state.players) {
      this.publishToPlayer(player.id, state, guestSockets, io);
    }
  }

  /**
   * Broadcasts round completion event to the room.
   */
  broadcastRoundFinished(
    io: UnoServer,
    roomCode: string,
    state: GameState
  ): void {
    if (!state.roundWinner) return;

    const scores: Record<string, number> = {};
    for (const p of state.players) {
      scores[p.id] = p.score;
    }

    io.to(roomCode).emit(SOCKET_EVENTS.GAME_ROUND_FINISHED, {
      matchId: state.id,
      roundWinner: state.roundWinner,
      roundNumber: state.roundNumber,
      scores,
    });
  }

  /**
   * Broadcasts final match completion event to the room.
   */
  broadcastMatchFinished(
    io: UnoServer,
    roomCode: string,
    state: GameState
  ): void {
    if (!state.winner) return;

    const finalScores: Record<string, number> = {};
    for (const p of state.players) {
      finalScores[p.id] = p.score;
    }

    io.to(roomCode).emit(SOCKET_EVENTS.GAME_FINISHED, {
      matchId: state.id,
      winner: state.winner,
      finalScores,
    });
  }
}

export const gameStatePublisher = new GameStatePublisher();
