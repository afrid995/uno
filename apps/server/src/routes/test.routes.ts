import { Router, Request, Response } from 'express';
import { gameSessionManager } from '../modules/game/game.session.manager';
import { gamePersistenceService } from '../modules/game/game.persistence.service';
import { gameStatePublisher } from '../modules/game/game.state.publisher';
import { guestSockets } from '../sockets/roomSocketHandler';
import { FlipDeckFactory, CardColor } from '@uno-ultimate/game-engine';

const router: Router = Router();

// Test-only endpoints for Playwright E2E determinism
router.post('/inject-flip-card', async (req: Request, res: Response) => {
  const { roomCode } = req.body;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  const activeSide = session.state.activeSide ?? 'LIGHT';
  const deck = FlipDeckFactory.createFlipDeck();
  const currentIdx = session.state.currentPlayerIndex;
  const currentColor = session.state.activeColor ?? (activeSide === 'LIGHT' ? 'blue' : 'teal');

  let rawCard = deck.find((c) =>
    activeSide === 'LIGHT'
      ? c.lightFace.value === 'flip' && c.lightFace.color === currentColor
      : c.darkFace.value === 'flip' && c.darkFace.color === currentColor
  );

  if (!rawCard) {
    rawCard = deck.find((c) =>
      activeSide === 'LIGHT' ? c.lightFace.value === 'flip' : c.darkFace.value === 'flip'
    )!;
  }

  const activeFlipCard = FlipDeckFactory.flipCard(rawCard, activeSide);
  const cardColor = activeSide === 'LIGHT' ? rawCard.lightFace.color : rawCard.darkFace.color;

  // Ensure top discard card color matches so Flip card is immediately playable
  const matchingDiscard = deck.find((c) =>
    activeSide === 'LIGHT'
      ? c.lightFace.color === cardColor && c.lightFace.value === '5'
      : c.darkFace.color === cardColor && c.darkFace.value === '5'
  ) ?? session.state.topDiscardCard;

  const activeDiscard = FlipDeckFactory.flipCard(matchingDiscard, activeSide);

  session.state = {
    ...session.state,
    activeColor: cardColor as CardColor,
    topDiscardCard: activeDiscard,
    discardPile: [activeDiscard],
    players: session.state.players.map((p, idx) =>
      idx === currentIdx
        ? { ...p, hand: [activeFlipCard, ...p.hand.filter((c) => c.id !== activeFlipCard.id)] }
        : p
    ),
  };

  await gamePersistenceService.persistActionBatch(session.matchId, session.state, []);
  gameStatePublisher.publishToAllParticipants(session.state, guestSockets);

  res.json({
    success: true,
    cardId: activeFlipCard.id,
    activeSide: session.state.activeSide,
    currentPlayerId: session.state.players[currentIdx].id,
  });
});

router.post('/inject-starting-wild', async (req: Request, res: Response) => {
  const { roomCode } = req.body;
  const session = gameSessionManager.getSessionByRoomCode(roomCode);
  if (!session) {
    res.status(404).json({ success: false, error: 'Session not found' });
    return;
  }

  const deck = FlipDeckFactory.createFlipDeck();
  const wildCard = deck.find((c) => c.lightFace.value === 'wild')!;
  const activeWild = FlipDeckFactory.flipCard(wildCard, 'LIGHT');

  const dealerIdx = session.state.dealerIndex;
  const designatedIdx = (dealerIdx + 1) % session.state.players.length;
  const designatedPlayerId = session.state.players[designatedIdx].id;

  session.state = {
    ...session.state,
    topDiscardCard: activeWild,
    discardPile: [activeWild],
    activeColor: null,
    currentPlayerIndex: designatedIdx,
    pendingActionState: {
      type: 'AWAITING_STARTING_WILD_COLOR_SELECTION',
      designatedPlayerId,
    },
  };

  await gamePersistenceService.persistActionBatch(session.matchId, session.state, []);
  gameStatePublisher.publishToAllParticipants(session.state, guestSockets);

  res.json({
    success: true,
    designatedPlayerId,
  });
});

export default router;
