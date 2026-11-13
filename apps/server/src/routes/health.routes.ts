import { Router, Request, Response } from 'express';
import { prisma } from '@uno-ultimate/database';
import { HTTP_STATUS, ApiResponse, HealthCheckResponse } from '@uno-ultimate/shared';
import { env } from '../config/env';

const router: Router = Router();
const startTime = Date.now();

router.get('/', async (_req: Request, res: Response<ApiResponse<HealthCheckResponse>>) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let latencyMs: number | undefined;

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    latencyMs = Date.now() - dbStart;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const isHealthy = dbStatus === 'connected';

  const healthData: HealthCheckResponse = {
    status: isHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    environment: env.NODE_ENV,
    database: {
      status: dbStatus,
      latencyMs,
    },
    version: '0.1.0',
  };

  res.status(isHealthy ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: isHealthy,
    data: healthData,
  });
});

export default router;
