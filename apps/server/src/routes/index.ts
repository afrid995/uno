import { Router } from 'express';
import guestRoutes from '../modules/guest/guest.routes';
import healthRoutes from './health.routes';

const router: Router = Router();

router.use('/health', healthRoutes);
router.use('/guest', guestRoutes);

export default router;
