import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { payoutControllers } from './payout.controller.js';
import type { PayoutService } from './payout.service.js';

export function payoutRoutes(service: PayoutService, auth: AuthService) {
  const router = Router();
  const c = payoutControllers(service);
  router.get('/experts/me/payouts', authenticate(auth), authorize('expert'), c.ownPayouts);
  router.get('/experts/me/earnings', authenticate(auth), authorize('expert'), c.ownEarnings);
  router.get('/experts/me/payouts/:id', authenticate(auth), authorize('expert'), c.ownPayout);
  return router;
}

export function adminPayoutRoutes(service: PayoutService, auth: AuthService) {
  const router = Router();
  const c = payoutControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/payouts', c.adminList);
  router.post('/payouts', c.create);
  router.get('/payouts/eligible', c.adminEligible);
  router.get('/payouts/:id', c.adminDetail);
  router.post('/payouts/:id/transfer', c.transfer);
  return router;
}
