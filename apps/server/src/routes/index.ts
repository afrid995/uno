import { Router } from 'express';
import guestRoutes from '../modules/guest/guest.routes';
import healthRoutes from './health.routes';
import roomRoutes from './room.routes';
import testRoutes from './test.routes';

const router: Router = Router();

router.use('/health', healthRoutes);
router.use('/guest', guestRoutes);
router.use('/rooms', roomRoutes);

if (process.env.NODE_ENV !== 'production') {
  router.use('/test', (req, res, next) => {
    if (process.env.ENABLE_TEST_HELPERS !== 'true') {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Test helper endpoints are strictly disabled.',
        },
      });
      return;
    }
    const secret = process.env.TEST_HELPER_SECRET;
    if (!secret || typeof secret !== 'string' || secret.trim().length < 16) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Test helper secret is not configured or insufficiently strong.',
        },
      });
      return;
    }
    testRoutes(req, res, next);
  });
}

export default router;
