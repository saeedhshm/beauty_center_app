import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { overviewControllers } from './overview.controller.js';
import type { OverviewService } from './overview.service.js';

export function adminOverviewRoutes(service: OverviewService, auth: AuthService) {
  const router = Router();
  const c = overviewControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/overview', c.summary);
  return router;
}
