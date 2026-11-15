import { GameState } from '@uno-ultimate/game-engine';
import { logger } from '../../utils/logger';

interface ActiveGameSession {
  matchId: string;
  roomCode: string;
  roomId: string;
  state: GameState;
  lockPromise: Promise<void>;
}

export class GameSessionManager {
  private static instance: GameSessionManager;

  // Key: matchId
  private sessions = new Map<string, ActiveGameSession>();
  // Key: roomCode -> matchId
  private roomCodeToMatchId = new Map<string, string>();
  // Key: guestId -> roomCode
  private guestToRoomCode = new Map<string, string>();

  private constructor() {}

  static getInstance(): GameSessionManager {
    if (!GameSessionManager.instance) {
      GameSessionManager.instance = new GameSessionManager();
    }
    return GameSessionManager.instance;
  }

  setSession(matchId: string, roomCode: string, roomId: string, state: GameState): void {
    const existing = this.sessions.get(matchId);
    this.sessions.set(matchId, {
      matchId,
      roomCode,
      roomId,
      state,
      lockPromise: existing ? existing.lockPromise : Promise.resolve(),
    });
    this.roomCodeToMatchId.set(roomCode, matchId);
    for (const player of state.players) {
      this.guestToRoomCode.set(player.id, roomCode);
    }
    logger.debug('Game session registered/updated', { matchId, roomCode });
  }

  updateState(matchId: string, newState: GameState): void {
    const session = this.sessions.get(matchId);
    if (!session) {
      throw new Error(`Game session not found for matchId ${matchId}`);
    }
    session.state = newState;
  }

  getSessionByMatchId(matchId: string): ActiveGameSession | null {
    return this.sessions.get(matchId) || null;
  }

  getSessionByRoomCode(roomCode: string): ActiveGameSession | null {
    const matchId = this.roomCodeToMatchId.get(roomCode);
    if (!matchId) return null;
    return this.sessions.get(matchId) || null;
  }

  getRoomCodeForGuest(guestId: string): string | null {
    return this.guestToRoomCode.get(guestId) || null;
  }

  getStateByRoomCode(roomCode: string): GameState | null {
    const session = this.getSessionByRoomCode(roomCode);
    return session ? session.state : null;
  }

  removeSession(matchId: string): void {
    const session = this.sessions.get(matchId);
    if (session) {
      this.roomCodeToMatchId.delete(session.roomCode);
      for (const player of session.state.players) {
        if (this.guestToRoomCode.get(player.id) === session.roomCode) {
          this.guestToRoomCode.delete(player.id);
        }
      }
      this.sessions.delete(matchId);
      logger.info('Game session removed from active memory', { matchId });
    }
  }

  removeSessionByRoomCode(roomCode: string): void {
    const matchId = this.roomCodeToMatchId.get(roomCode);
    if (matchId) {
      this.removeSession(matchId);
    }
  }

  /**
   * Resets all in-memory game sessions. Used to simulate cold server restart in tests.
   */
  clearAllSessionsForTesting(): void {
    this.sessions.clear();
    this.roomCodeToMatchId.clear();
    this.guestToRoomCode.clear();
  }

  /**
   * Executes an async operation with per-match serialization lock to prevent race conditions.
   */
  async runWithLock<T>(matchId: string, fn: (session: ActiveGameSession) => Promise<T>): Promise<T> {
    const session = this.sessions.get(matchId);
    if (!session) {
      throw new Error(`No active match session found for match ID ${matchId}`);
    }

    let releaseLock: () => void = () => {};
    const nextLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousLock = session.lockPromise;
    session.lockPromise = previousLock.then(() => nextLock);

    try {
      await previousLock;
      return await fn(session);
    } finally {
      releaseLock();
    }
  }
}

export const gameSessionManager = GameSessionManager.getInstance();
