import { Request, Response, NextFunction } from 'express';
import { HTTP_STATUS, ApiResponse, GuestAuthResponseData, GuestSessionPublic } from '@uno-ultimate/shared';
import { env } from '../../config/env';
import { guestService } from './guest.service';

export class GuestController {
  /**
   * Helper to extract session token from cookies, Authorization header, or request body.
   */
  private extractToken(req: Request): string | undefined {
    // 1. Check HttpOnly cookie
    if (req.cookies && req.cookies[env.COOKIE_NAME]) {
      return req.cookies[env.COOKIE_NAME];
    }

    // 2. Check Authorization Bearer header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    // 3. Check request body
    if (req.body && typeof req.body.sessionToken === 'string') {
      return req.body.sessionToken;
    }

    return undefined;
  }

  /**
   * Sets HttpOnly session cookie on the response.
   */
  private setSessionCookie(res: Response, token: string): void {
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: env.SESSION_EXPIRATION_HOURS * 60 * 60 * 1000,
      path: '/',
    });
  }

  /**
   * POST /api/guest
   * Creates a new guest session for the provided username.
   */
  createGuest = async (
    req: Request,
    res: Response<ApiResponse<GuestAuthResponseData>>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { username } = req.body;
      const { guest, rawSessionToken } = await guestService.createGuest(username);

      this.setSessionCookie(res, rawSessionToken);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: {
          guest,
          sessionToken: rawSessionToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * POST /api/guest/resume
   * Validates and resumes an existing session.
   */
  resumeGuest = async (
    req: Request,
    res: Response<ApiResponse<GuestAuthResponseData>>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const token = this.extractToken(req);
      const claimedGuestId = req.body?.guestId;

      if (!token) {
        res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          error: {
            code: 'SESSION_INVALID',
            message: 'No session token found in cookie, header, or request body.',
          },
        });
        return;
      }

      const guest: GuestSessionPublic = await guestService.resumeGuest(token, claimedGuestId);

      // Refresh cookie expiration
      this.setSessionCookie(res, token);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        data: {
          guest,
          sessionToken: token,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const guestController = new GuestController();
