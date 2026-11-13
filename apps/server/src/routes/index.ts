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
  router.use('/test', testRoutes);
}

export default router;
