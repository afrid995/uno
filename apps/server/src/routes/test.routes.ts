import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { gameSessionManager } from '../modules/game/game.session.manager';
import { gamePersistenceService } from '../modules/game/game.persistence.service';
import { gameStatePublisher } from '../modules/game/game.state.publisher';
import { guestSockets } from '../sockets/roomSocketHandler';
import {
  FlipFixtureBuilder,
  assertValidFlipGameState,
  validateFlipGameStateInvariants,
  NoMercyFixtureBuilder,
  assertValidNoMercyGameState,
  validateNoMercyGameStateInvariants,
  AllWildFixtureBuilder,
  assertValidAllWildGameState,
  validateAllWildGameStateInvariants,
  FlexFixtureBuilder,
  assertValidFlexGameState,
  validateFlexGameStateInvariants,
  TeamsFixtureBuilder,
  assertValidTeamsGameState,
  validateTeamsGameStateInvariants,
} from '@uno-ultimate/game-engine';
import { timingSafeSecretCompare } from '../utils/crypto';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router: Router = Router();

// -------------------------------------------------------------
// Security Gate:
// 1. Reject if in production (NODE_ENV === 'production')
// 2. Reject if ENABLE_TEST_HELPERS is not 'true'
// 3. Reject if server-side TEST_HELPER_SECRET is missing or weak (< 16 chars)
// 4. Reject if request header X-Test-Helper-Secret is missing or does not match
// -------------------------------------------------------------
router.use((req: Request, res: Response, next) => {
  // Gate 1 & 2: Environment checks
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_TEST_HELPERS !== 'true') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Test helper endpoints are strictly disabled.',
      },
    });
    return;
  }

  // Gate 3: Server-side secret validation (fail closed)
  const configuredSecret = process.env.TEST_HELPER_SECRET;
  if (!configuredSecret || typeof configuredSecret !== 'string' || configuredSecret.trim().length < 16) {
    logger.warn('Test helper endpoint accessed but TEST_HELPER_SECRET is missing or insufficiently strong', {
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Test helper endpoints are not configured.',
      },
    });
    return;
  }

  // Gate 4: Request authentication header verification
  const providedSecret = req.header('X-Test-Helper-Secret');
  if (!providedSecret) {
    logger.warn('Unauthorized test helper request: missing X-Test-Helper-Secret header', {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing test helper secret header.',
      },
    });
    return;
  }

  // Constant-time comparison
  const isValid = timingSafeSecretCompare(providedSecret, configuredSecret);
  if (!isValid) {
    logger.warn('Unauthorized test helper request: invalid X-Test-Helper-Secret header', {
      path: req.path,
      method: req.method,
    });
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid test helper secret.',
      },
    });
    return;
  }

  next();
});

// Zod schemas for input validation
const injectFlipCardSchema = z.object({
  roomCode: z.string().trim().min(1).max(10),
  targetPlayerId: z.string().uuid().optional(),
});

const injectStartingWildSchema = z.object({
  roomCode: z.string().trim().min(1).max(10),
});

const injectNoMercyCardSchema = z.object({
  roomCode: z.string().trim().min(1).max(10),
  cardValue: z.string().min(1),
  color: z.enum(['red', 'yellow', 'green', 'blue']).optional(),
  targetPlayerId: z.string().uuid().optional(),
  targetUsername: z.string().optional(),
});

const setNoMercyHandSizeSchema = z.object({
  roomCode: z.string().trim().min(1).max(10),
  targetPlayerId: z.string().uuid().optional(),
  targetUsername: z.string().optional(),
  // Maximum active hand size capped at 24 to preserve active-player Mercy Rule validity (< 25)
  targetCount: z.number().int().min(1).max(24),
});

/**
 * POST /api/test/inject-flip-card
 * Safely injects a playable Flip card into the active player's hand by swapping
 * with an existing card from within the game's canonical 112-card inventory.
 * Protected by match mutex with state-dependent preconditions verified under lock,
 * and committed to PostgreSQL before in-memory state update.
 */
router.post('/inject-flip-card', async (req: Request, res: Response) => {
  const parseResult = injectFlipCardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid request payload',
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { roomCode, targetPlayerId } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      // 1. Locked state-dependent precondition checks (guards against concurrent match completion/mutation)
      if (activeSession.state.variant !== 'uno_flip') {
        throw new AppError(400, 'INVALID_VARIANT', 'Test fixture is only valid for UNO Flip matches.');
      }

      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS to apply test fixtures.');
      }

      // 2. Compute state mutation with pure fixture helper (preserves 112 cards & unique IDs)
      const { nextState, injectedCard } = FlipFixtureBuilder.injectPlayableFlipCard(
        activeSession.state,
        targetPlayerId
      );

      // 3. Validate strict invariants
      assertValidFlipGameState(nextState);

      // 4. Persist to database FIRST (if this fails, activeSession.state is unchanged)
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);

      // 5. Update in-memory state ONLY AFTER successful database commit
      activeSession.state = nextState;

      // 6. Broadcast updated state to all connected participants
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      logger.info('Test helper: Flip card injected safely', {
        matchId: activeSession.matchId,
        roomCode,
        activeSide: nextState.activeSide,
      });

      return {
        cardId: injectedCard.id,
        activeSide: nextState.activeSide,
        currentPlayerId: nextState.players[nextState.currentPlayerIndex].id,
      };
    });

    res.json({
      success: true,
      data: outcome,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    const message = (err as Error).message || 'Failed to inject Flip card';
    logger.error('Error injecting Flip card fixture', { error: message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

/**
 * POST /api/test/inject-starting-wild
 * Safely establishes an opening Starting Wild card state by swapping a physical
 * Wild card from the draw pile onto the discard pile, strictly preserving all 112 cards.
 * Protected by match mutex with state-dependent preconditions verified under lock.
 */
router.post('/inject-starting-wild', async (req: Request, res: Response) => {
  const parseResult = injectStartingWildSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid request payload',
        details: parseResult.error.format(),
      },
    });
    return;
  }

  const { roomCode } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      // 1. Locked state-dependent precondition checks (guards against concurrent match completion/mutation)
      if (activeSession.state.variant !== 'uno_flip') {
        throw new AppError(400, 'INVALID_VARIANT', 'Test fixture is only valid for UNO Flip matches.');
      }

      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS to apply test fixtures.');
      }

      // 2. Compute mutated state with pure fixture helper (preserves 112 cards & unique IDs)
      const { nextState, wildCard } = FlipFixtureBuilder.injectStartingWild(activeSession.state);

      // 3. Validate strict invariants
      assertValidFlipGameState(nextState);

      // 4. Persist to database FIRST
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);

      // 5. Update in-memory state ONLY AFTER successful database commit
      activeSession.state = nextState;

      // 6. Broadcast to connected participants
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      logger.info('Test helper: Starting Wild state injected safely', {
        matchId: activeSession.matchId,
        roomCode,
      });

      const designatedPlayerId =
        nextState.pendingActionState && 'designatedPlayerId' in nextState.pendingActionState
          ? nextState.pendingActionState.designatedPlayerId
          : null;

      return {
        cardId: wildCard.id,
        designatedPlayerId,
      };
    });

    res.json({
      success: true,
      data: outcome,
    });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return;
    }
    const message = (err as Error).message || 'Failed to inject Starting Wild';
    logger.error('Error injecting Starting Wild fixture', { error: message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

/**
 * GET /api/test/verify-invariants/:roomCode
 * Verifies that the current in-memory and database game state satisfies all UNO Flip invariants:
 * exact 112 physical card conservation, ID uniqueness, dual-face integrity, and active-side representations.
 * Protected by match mutex to verify a stable snapshot.
 */
router.get('/verify-invariants/:roomCode', async (req: Request, res: Response) => {
  const roomCode = req.params.roomCode;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const validation = validateFlipGameStateInvariants(activeSession.state);
      const totalCards =
        activeSession.state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        activeSession.state.drawPile.length +
        activeSession.state.discardPile.length;

      return {
        success: validation.valid,
        valid: validation.valid,
        totalCards,
        activeSide: activeSession.state.activeSide,
        errors: validation.errors,
      };
    });

    res.json(outcome);
  } catch (err: unknown) {
    const message = (err as Error).message || 'Failed to verify invariants';
    logger.error('Error verifying invariants', { error: message });
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message },
    });
  }
});

/**
 * POST /api/test/inject-no-mercy-card
 * Swaps a card of specified value/color into player's hand strictly conserving 168 cards.
 */
router.post('/inject-no-mercy-card', async (req: Request, res: Response) => {
  const parseResult = injectNoMercyCardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, cardValue, color, targetPlayerId, targetUsername } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_show_em_no_mercy') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Show \'em No Mercy.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        targetId = activeSession.state.players[activeSession.state.currentPlayerIndex].id;
      }

      const { nextState, card } = NoMercyFixtureBuilder.injectPlayableCard(
        activeSession.state,
        targetId,
        cardValue,
        color
      );

      assertValidNoMercyGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        cardId: card.id,
        value: card.value,
        color: card.color,
        targetPlayerId: targetId,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * POST /api/test/set-no-mercy-hand-size
 * Adjusts hand size of target player (e.g. setting to 24 for Mercy Rule elimination test)
 */
router.post('/set-no-mercy-hand-size', async (req: Request, res: Response) => {
  const parseResult = setNoMercyHandSizeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, targetCount } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_show_em_no_mercy') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Show \'em No Mercy.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const nextState = NoMercyFixtureBuilder.setHandSize(
        activeSession.state,
        targetId,
        targetCount
      );

      assertValidNoMercyGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        targetPlayerId: targetId,
        targetCount,
        handLength: nextState.players.find((p: { id: string }) => p.id === targetId)?.hand.length,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * GET /api/test/verify-no-mercy-invariants/:roomCode
 * GET /api/test/verify-no-mercy-invariants?roomCode=...
 */
router.get(['/verify-no-mercy-invariants/:roomCode', '/verify-no-mercy-invariants'], async (req: Request, res: Response) => {
  const roomCode = req.params.roomCode || (req.query.roomCode as string);
  if (!roomCode) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'roomCode required' } });
    return;
  }

  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const validation = validateNoMercyGameStateInvariants(activeSession.state);
      const totalCards =
        activeSession.state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        activeSession.state.drawPile.length +
        activeSession.state.discardPile.length +
        (activeSession.state.setAsideCards?.length || 0);

      return {
        success: validation.valid,
        valid: validation.valid,
        totalCards,
        errors: validation.errors,
      };
    });

    res.json(outcome);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

// =============================================================
// UNO All Wild Fixture Routes
// =============================================================

const injectAllWildCardSchema = z.object({
  roomCode: z.string().min(1),
  targetPlayerId: z.string().optional(),
  targetUsername: z.string().optional(),
  cardValue: z.enum([
    'wild',
    'wild_reverse',
    'wild_skip',
    'wild_draw_two',
    'wild_skip_two',
    'wild_draw_four',
    'wild_targeted_draw_two',
    'wild_forced_swap',
  ]),
});

const setAllWildHandSizeSchema = z.object({
  roomCode: z.string().min(1),
  targetPlayerId: z.string().optional(),
  targetUsername: z.string().optional(),
  targetCount: z.number().int().min(1).max(25),
});

/**
 * POST /api/test/inject-all-wild-card
 * Swaps a card of the requested type into target player's hand under match mutex lock.
 */
router.post('/inject-all-wild-card', async (req: Request, res: Response) => {
  const parseResult = injectAllWildCardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, cardValue } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_all_wild') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO All Wild.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const { nextState, card } = AllWildFixtureBuilder.injectPlayableCard(
        activeSession.state,
        targetId,
        cardValue
      );

      assertValidAllWildGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        cardId: card.id,
        value: card.value,
        color: card.color,
        targetPlayerId: targetId,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * POST /api/test/set-all-wild-hand-size
 * Adjusts hand size of target player under match mutex lock.
 */
router.post('/set-all-wild-hand-size', async (req: Request, res: Response) => {
  const parseResult = setAllWildHandSizeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, targetCount } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_all_wild') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO All Wild.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const nextState = AllWildFixtureBuilder.setHandSize(
        activeSession.state,
        targetId,
        targetCount
      );

      assertValidAllWildGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        targetPlayerId: targetId,
        targetCount,
        handLength: nextState.players.find((p: { id: string }) => p.id === targetId)?.hand.length,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * GET /api/test/verify-all-wild-invariants/:roomCode
 * GET /api/test/verify-all-wild-invariants?roomCode=...
 */
router.get(['/verify-all-wild-invariants/:roomCode', '/verify-all-wild-invariants'], async (req: Request, res: Response) => {
  const roomCode = req.params.roomCode || (req.query.roomCode as string);
  if (!roomCode) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'roomCode required' } });
    return;
  }

  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const validation = validateAllWildGameStateInvariants(activeSession.state);
      const totalCards =
        activeSession.state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        activeSession.state.drawPile.length +
        activeSession.state.discardPile.length;

      return {
        success: validation.valid,
        valid: validation.valid,
        totalCards,
        errors: validation.errors,
      };
    });

    res.json(outcome);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

/**
 * UNO Flex Test Helpers
 */
const injectFlexCardSchema = z.object({
  roomCode: z.string().min(1),
  targetPlayerId: z.string().optional(),
  targetUsername: z.string().optional(),
  cardValue: z.string().min(1),
  cardColor: z.enum(['red', 'yellow', 'green', 'blue']).optional(),
});

const setFlexPowerCardSchema = z.object({
  roomCode: z.string().min(1),
  targetPlayerId: z.string().optional(),
  targetUsername: z.string().optional(),
  powerCardStatus: z.enum(['green_check', 'red_x']),
});

const setFlexHandSizeSchema = z.object({
  roomCode: z.string().min(1),
  targetPlayerId: z.string().optional(),
  targetUsername: z.string().optional(),
  targetCount: z.number().int().min(1).max(25),
});

const setupTeamsRoundEndSchema = z.object({
  roomCode: z.string().min(1),
  targetTeamId: z.string().optional(),
});

/**
 * POST /api/test/inject-flex-card
 */
router.post('/inject-flex-card', async (req: Request, res: Response) => {
  const parseResult = injectFlexCardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, cardValue, cardColor } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_flex') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Flex.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const { nextState, card } = FlexFixtureBuilder.injectPlayableCard(
        activeSession.state,
        targetId,
        cardValue,
        cardColor
      );

      assertValidFlexGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        cardId: card.id,
        value: card.value,
        color: card.color,
        flexColor: card.flexColor,
        targetPlayerId: targetId,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * POST /api/test/set-flex-power-card
 */
router.post('/set-flex-power-card', async (req: Request, res: Response) => {
  const parseResult = setFlexPowerCardSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, powerCardStatus } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_flex') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Flex.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const nextState = FlexFixtureBuilder.setPowerCardStatus(
        activeSession.state,
        targetId,
        powerCardStatus
      );

      assertValidFlexGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        targetPlayerId: targetId,
        powerCardStatus,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * POST /api/test/set-flex-hand-size
 */
router.post('/set-flex-hand-size', async (req: Request, res: Response) => {
  const parseResult = setFlexHandSizeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetPlayerId, targetUsername, targetCount } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_flex') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Flex.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      let targetId = targetPlayerId;
      if (!targetId && targetUsername) {
        const found = activeSession.state.players.find((p) => p.username === targetUsername);
        if (found) targetId = found.id;
      }
      if (!targetId) {
        throw new AppError(400, 'BAD_REQUEST', 'targetPlayerId or targetUsername required.');
      }

      const nextState = FlexFixtureBuilder.setHandSize(
        activeSession.state,
        targetId,
        targetCount
      );

      assertValidFlexGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      return {
        targetPlayerId: targetId,
        targetCount,
        handLength: nextState.players.find((p: { id: string }) => p.id === targetId)?.hand.length,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

/**
 * GET /api/test/verify-flex-invariants/:roomCode
 */
router.get(['/verify-flex-invariants/:roomCode', '/verify-flex-invariants'], async (req: Request, res: Response) => {
  const roomCode = req.params.roomCode || (req.query.roomCode as string);
  if (!roomCode) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'roomCode required' } });
    return;
  }

  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const validation = validateFlexGameStateInvariants(activeSession.state);
      const totalCards =
        activeSession.state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        activeSession.state.drawPile.length +
        activeSession.state.discardPile.length;

      return {
        success: validation.valid,
        valid: validation.valid,
        totalCards,
        errors: validation.errors,
      };
    });

    res.json(outcome);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

/**
 * GET /api/test/verify-teams-invariants/:roomCode
 */
router.get(['/verify-teams-invariants/:roomCode', '/verify-teams-invariants'], async (req: Request, res: Response) => {
  const roomCode = req.params.roomCode || (req.query.roomCode as string);
  if (!roomCode) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'roomCode required' } });
    return;
  }

  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      const validation = validateTeamsGameStateInvariants(activeSession.state);
      const totalCards =
        activeSession.state.players.reduce((sum, p) => sum + p.hand.length, 0) +
        activeSession.state.drawPile.length +
        activeSession.state.discardPile.length;

      return {
        success: validation.valid,
        valid: validation.valid,
        totalCards,
        errors: validation.errors,
      };
    });

    res.json(outcome);
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
  }
});

/**
 * POST /api/test/setup-teams-round-end
 */
router.post('/setup-teams-round-end', async (req: Request, res: Response) => {
  const parseResult = setupTeamsRoundEndSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Invalid payload', details: parseResult.error.format() },
    });
    return;
  }

  const { roomCode, targetTeamId } = parseResult.data;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Active game session not found for this room.' },
    });
    return;
  }

  try {
    const outcome = await gameSessionManager.runWithLock(session.matchId, async (activeSession) => {
      if (activeSession.state.variant !== 'uno_teams') {
        throw new AppError(400, 'INVALID_VARIANT', 'Fixture only valid for UNO Teams.');
      }
      if (activeSession.state.status !== 'IN_PROGRESS') {
        throw new AppError(400, 'MATCH_NOT_ACTIVE', 'Match must be IN_PROGRESS.');
      }

      const nextState = TeamsFixtureBuilder.setupRoundEndState(
        activeSession.state,
        targetTeamId ?? 'team_1'
      );

      assertValidTeamsGameState(nextState);
      await gamePersistenceService.persistActionBatch(activeSession.matchId, nextState, []);
      activeSession.state = nextState;
      gameStatePublisher.publishToAllParticipants(nextState, guestSockets);

      const currentPlayer = nextState.players[nextState.currentPlayerIndex];
      return {
        winningTeamId: targetTeamId ?? 'team_1',
        currentPlayerId: currentPlayer.id,
        cardToPlayId: currentPlayer.hand[0]?.id,
      };
    });

    res.json({ success: true, data: outcome });
  } catch (err: unknown) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message } });
    } else {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (err as Error).message } });
    }
  }
});

export default router;
