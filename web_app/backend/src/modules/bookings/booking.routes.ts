import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { bookingControllers } from './booking.controller.js';
import type { BookingService } from './booking.service.js';

export function bookingRoutes(service: BookingService, auth: AuthService) {
  const router = Router();
  const c = bookingControllers(service);
  router.post('/bookings', authenticate(auth), authorize('customer'), c.create);
  router.get('/bookings', authenticate(auth), authorize('customer', 'expert'), c.list);
  router.get('/bookings/:id', authenticate(auth), authorize('customer', 'expert'), c.detail);
  router.post('/bookings/:id/accept', authenticate(auth), authorize('expert'), c.accept);
  router.post('/bookings/:id/reject', authenticate(auth), authorize('expert'), c.reject);
  router.post('/bookings/:id/cancel', authenticate(auth), authorize('customer', 'expert'), c.cancel);
  router.post('/bookings/:id/complete', authenticate(auth), authorize('customer', 'expert'), c.complete);
  return router;
}

export function adminBookingRoutes(service: BookingService, auth: AuthService) {
  const router = Router();
  const c = bookingControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/bookings', c.list);
  router.get('/bookings/:id', c.detail);
  router.post('/bookings/:id/cancel', c.cancel);
  return router;
}
