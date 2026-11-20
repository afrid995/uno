import { prisma, MatchStatus } from '@uno-ultimate/database';
import { GameState, GameSerializer, GameEventRecord } from '@uno-ultimate/game-engine';
import { logger } from '../../utils/logger';

export class GamePersistenceService {
  /**
   * Initializes a new Match record, seating order, and initial GameSnapshot in PostgreSQL
   * within a single atomic database transaction.
   */
  async createMatch(
    matchId: string,
    roomId: string,
    variant: string,
    players: { guestId: string; seatIndex: number }[],
    initialState?: GameState
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

      // 2. Create MatchPlayer rows in a single batch insert
      await tx.matchPlayer.createMany({
        data: players.map((p) => ({
          matchId,
          guestId: p.guestId,
          playerIndex: p.seatIndex,
          cardCount: 7,
          score: 0,
        })),
      });

      // 3. Persist initial GameSnapshot at sequenceNumber 0 for crash recovery
      if (initialState) {
        const serialized = GameSerializer.serialize(initialState);
        await tx.gameSnapshot.create({
          data: {
            matchId,
            sequenceNumber: 0,
            state: JSON.parse(serialized),
          },
        });
      }
    });

    logger.info('Match, players, and initial snapshot persisted in database', {
      matchId,
      roomId,
      playerCount: players.length,
    });
  }

  /**
   * Durably persists an accepted action batch within a single atomic database transaction.
   * Updates Match progress, MatchPlayer scores/counts, inserts all GameEvent records,
   * and saves a complete GameSnapshot for crash/restart recovery.
   * If any operation fails, the transaction rolls back completely and throws an error.
   */
  async persistActionBatch(
    matchId: string,
    nextState: GameState,
    events: readonly GameEventRecord[]
  ): Promise<void> {
    const isCompleted = nextState.status === 'COMPLETED';
    const serialized = GameSerializer.serialize(nextState);
    const parsedSnapshot = JSON.parse(serialized);

    await prisma.$transaction(async (tx) => {
      // 1. Update Match record
      await tx.match.update({
        where: { id: matchId },
        data: {
          sequenceNumber: nextState.sequenceNumber,
          turnNumber: nextState.turnNumber,
          currentVersion: { increment: 1 },
          status: isCompleted ? MatchStatus.COMPLETED : MatchStatus.IN_PROGRESS,
          winnerGuestId: nextState.winner?.id ?? null,
          updatedAt: new Date(),
        },
      });

      // 2. Update MatchPlayer rows
      for (const p of nextState.players) {
        await tx.matchPlayer.updateMany({
          where: { matchId, guestId: p.id },
          data: {
            cardCount: p.hand.length,
            score: p.score,
            isWinner: isCompleted && nextState.winner?.id === p.id,
          },
        });
      }

      // 3. Insert each GameEvent record
      for (const ev of events) {
        await tx.gameEvent.create({
          data: {
            matchId,
            sequenceNumber: ev.sequenceNumber,
            eventType: ev.type,
            guestId: ev.playerId ?? null,
            payload: ev.payload as object,
          },
        });
      }

      // 4. Save GameSnapshot for crash/restart recovery
      await tx.gameSnapshot.upsert({
        where: {
          matchId_sequenceNumber: {
            matchId,
            sequenceNumber: nextState.sequenceNumber,
          },
        },
        create: {
          matchId,
          sequenceNumber: nextState.sequenceNumber,
          state: parsedSnapshot,
        },
        update: {
          state: parsedSnapshot,
        },
      });
    });
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
