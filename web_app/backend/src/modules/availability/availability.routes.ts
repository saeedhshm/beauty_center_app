import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { availabilityControllers } from './availability.controller.js';
import type { AvailabilityService } from './availability.service.js';

export function availabilityRoutes(service: AvailabilityService, auth: AuthService) {
  const router = Router();
  const c = availabilityControllers(service);
  router.get('/experts/:id/slots', c.slots);
  router.get('/experts/me/availability', authenticate(auth), authorize('expert'), c.ownSchedule);
  router.put('/experts/me/availability', authenticate(auth), authorize('expert'), c.replaceSchedule);
  router.get('/experts/me/availability-exceptions', authenticate(auth), authorize('expert'), c.ownExceptions);
  router.post('/experts/me/availability-exceptions', authenticate(auth), authorize('expert'), c.addException);
  router.delete('/experts/me/availability-exceptions/:id', authenticate(auth), authorize('expert'), c.deleteException);
  return router;
}
