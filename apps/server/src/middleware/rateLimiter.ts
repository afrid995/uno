import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { HTTP_STATUS, ERROR_CODES } from '@uno-ultimate/shared';

export const guestRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_GUEST,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
      success: false,
      error: {
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Too many guest requests from this IP. Please try again shortly.',
      },
    });
  },
});
