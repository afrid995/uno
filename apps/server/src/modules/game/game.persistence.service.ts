import { prisma, MatchStatus } from '@uno-ultimate/database';
import { GameState, GameSerializer } from '@uno-ultimate/game-engine';
import { logger } from '../../utils/logger';

export class GamePersistenceService {
  /**
   * Initializes a new Match record and seating order in PostgreSQL.
   */
  async createMatch(
    matchId: string,
    roomId: string,
    variant: string,
    players: { guestId: string; seatIndex: number }[]
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Create Match row
      await tx.match.create({
        data: {
          id: matchId,
          roomId,
          variant,
          status: MatchStatus.IN_PROGRESS,
          sequenceNumber: 0,
          turnNumber: 1,
          currentVersion: 1,
        },
      });

      // 2. Create MatchPlayer rows
      for (const p of players) {
        await tx.matchPlayer.create({
          data: {
            matchId,
            guestId: p.guestId,
            playerIndex: p.seatIndex,
            cardCount: 7,
            score: 0,
          },
        });
      }
    });

    logger.info('Match and players persisted in database', { matchId, roomId, playerCount: players.length });
  }

  /**
   * Saves a GameEvent record.
   */
  async saveGameEvent(
    matchId: string,
    sequenceNumber: number,
    eventType: string,
    guestId: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.gameEvent.create({
        data: {
          matchId,
          sequenceNumber,
          eventType,
          guestId: guestId ?? null,
          payload: payload as object,
        },
      });
    } catch (err: unknown) {
      logger.error('Failed to persist GameEvent', { matchId, sequenceNumber, eventType, error: (err as Error).message });
    }
  }

  /**
   * Saves a full GameSnapshot record.
   */
  async saveGameSnapshot(matchId: string, sequenceNumber: number, state: GameState): Promise<void> {
    try {
      const serialized = GameSerializer.serialize(state);
      await prisma.gameSnapshot.upsert({
        where: {
          matchId_sequenceNumber: {
            matchId,
            sequenceNumber,
          },
        },
        create: {
          matchId,
          sequenceNumber,
          state: JSON.parse(serialized),
        },
        update: {
          state: JSON.parse(serialized),
        },
      });
    } catch (err: unknown) {
      logger.error('Failed to persist GameSnapshot', { matchId, sequenceNumber, error: (err as Error).message });
    }
  }

  /**
   * Updates match state after an action (updates sequenceNumber, turnNumber, players, and optionally completion).
   */
  async updateMatchProgress(matchId: string, state: GameState): Promise<void> {
    try {
      const isCompleted = state.status === 'COMPLETED';

      await prisma.$transaction(async (tx) => {
        await tx.match.update({
          where: { id: matchId },
          data: {
            sequenceNumber: state.sequenceNumber,
            turnNumber: state.turnNumber,
            currentVersion: { increment: 1 },
            status: isCompleted ? MatchStatus.COMPLETED : MatchStatus.IN_PROGRESS,
            winnerGuestId: state.winner?.id ?? null,
            updatedAt: new Date(),
          },
        });

        for (const p of state.players) {
          await tx.matchPlayer.updateMany({
            where: { matchId, guestId: p.id },
            data: {
              cardCount: p.hand.length,
              score: p.score,
              isWinner: isCompleted && state.winner?.id === p.id,
            },
          });
        }
      });
    } catch (err: unknown) {
      logger.error('Failed to update match progress in database', { matchId, error: (err as Error).message });
    }
  }

  /**
   * Loads the latest snapshot for a match from the database.
   */
  async loadLatestSnapshot(matchId: string): Promise<GameState | null> {
    const snapshot = await prisma.gameSnapshot.findFirst({
      where: { matchId },
      orderBy: { sequenceNumber: 'desc' },
    });

    if (!snapshot) return null;
    return GameSerializer.deserialize(JSON.stringify(snapshot.state));
  }

  /**
   * Checks if an active match already exists for a given room.
   */
  async findActiveMatchForRoom(roomId: string): Promise<{ id: string } | null> {
    return prisma.match.findFirst({
      where: {
        roomId,
        status: { in: [MatchStatus.INITIALIZING, MatchStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
  }
}

export const gamePersistenceService = new GamePersistenceService();
