import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { initializeSocketServer } from './sockets/socketServer';
import { prisma } from '@uno-ultimate/database';
import { logger } from './utils/logger';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Initialize Socket.IO server
  const io = initializeSocketServer(server);

  server.listen(env.PORT, () => {
    logger.info('🚀 UNO Ultimate Server started successfully', {
      port: env.PORT,
      env: env.NODE_ENV,
      corsOrigin: env.CORS_ORIGIN,
      apiHealth: `http://localhost:${env.PORT}/api/health`,
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down server...`);

    // Close socket connections
    io.close(() => {
      logger.info('Socket.IO connections closed.');
    });

    // Close HTTP server
    server.close(async () => {
      logger.info('HTTP server closed.');

      // Disconnect Prisma
      try {
        await prisma.$disconnect();
        logger.info('Prisma database client disconnected.');
      } catch (err) {
        logger.error('Error disconnecting database client', { error: String(err) });
      }

      process.exit(0);
    });

    // Force close after 10 seconds if graceful exit hangs
    setTimeout(() => {
      logger.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Promise Rejection', { reason: String(reason) });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception thrown', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
