import { Router, Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ApiResponse, RoomMetadataResponse, RoomPublicDto, ERROR_CODES } from '@uno-ultimate/shared';
import { roomService } from '../modules/room/room.service';
import { guestService } from '../modules/guest/guest.service';
import { env } from '../config/env';

const router: Router = Router();

function extractToken(req: Request): string | undefined {
  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    return req.cookies[env.COOKIE_NAME];
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return undefined;
}

/**
 * GET /api/rooms/:roomCode
 * Public read-only metadata for invitation link pre-validation.
 */
router.get('/:roomCode', async (req: Request, res: Response<ApiResponse<RoomMetadataResponse>>) => {
  try {
    const { roomCode } = req.params;
    const metadata = await roomService.getRoomMetadata(roomCode);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: metadata,
    });
  } catch {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Failed to inspect room.',
      },
    });
  }
});

/**
 * GET /api/rooms/:roomCode/state
 * Authenticated member room state retrieval.
 */
router.get('/:roomCode/state', async (req: Request, res: Response<ApiResponse<RoomPublicDto>>, next: NextFunction) => {
  try {
    const token = extractToken(req);
    if (!token) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        error: { code: ERROR_CODES.UNAUTHORIZED, message: 'Authentication required' },
      });
      return;
    }

    const guest = await guestService.resumeGuest(token);
    const room = await roomService.getRoomByCode(req.params.roomCode);

    if (!room) {
      res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        error: { code: ERROR_CODES.ROOM_NOT_FOUND, message: 'Room not found' },
      });
      return;
    }

    // Assert guest is a member of this room
    const isMember = room.members.some((m) => m.guestId === guest.id);
    if (!isMember) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: { code: ERROR_CODES.NOT_IN_ROOM, message: 'You are not a member of this room' },
      });
      return;
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: room,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
