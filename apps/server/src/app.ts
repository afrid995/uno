import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { isOriginAllowed } from './utils/cors';
import { errorHandler } from './middleware/errorHandler';
import apiRoutes from './routes';
import { HTTP_STATUS, ERROR_CODES } from '@uno-ultimate/shared';

export function createApp(): Express {
  const app = express();

  // Trust reverse proxy (Render, Vercel, Cloudflare, etc.) so client IP and secure cookies resolve accurately
  app.set('trust proxy', 1);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false, // relaxed for local dev and socket connections
      crossOriginEmbedderPolicy: false,
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: (requestOrigin, callback) => {
        if (isOriginAllowed(requestOrigin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${requestOrigin} not permitted by CORS`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser(env.COOKIE_SECRET));

  // Root lightweight health check for hosting platforms
  app.get(['/healthz', '/health'], (_req: Request, res: Response) => {
    res.status(HTTP_STATUS.OK).send('OK');
  });

  // Mount API routes
  app.use('/api', apiRoutes);

  // 404 Handler
  app.use((_req: Request, res: Response) => {
    res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: {
        code: ERROR_CODES.SESSION_NOT_FOUND,
        message: 'Endpoint not found.',
      },
    });
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}

export default createApp;
