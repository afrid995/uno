import { Router } from 'express';
import { createGuestSchema, resumeGuestSchema } from '@uno-ultimate/shared';
import { validateBody } from '../../middleware/validate';
import { guestRateLimiter } from '../../middleware/rateLimiter';
import { guestController } from './guest.controller';

const router: Router = Router();

// Apply rate limiting to all guest identity endpoints
router.use(guestRateLimiter);

router.post('/', validateBody(createGuestSchema), guestController.createGuest);
router.post('/resume', validateBody(resumeGuestSchema), guestController.resumeGuest);

export default router;
