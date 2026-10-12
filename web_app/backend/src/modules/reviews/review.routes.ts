import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { reviewControllers } from './review.controller.js';
import type { ReviewService } from './review.service.js';

export function reviewRoutes(service: ReviewService, auth: AuthService) {
  const router = Router();
  const c = reviewControllers(service);
  router.post('/bookings/:id/reviews', authenticate(auth), authorize('customer', 'expert'), c.submit);
  router.get('/bookings/:id/reviews', authenticate(auth), authorize('customer', 'expert'), c.forBooking);
  router.get('/experts/:id/reviews', c.forExpert);
  return router;
}

export function adminReviewRoutes(service: ReviewService, auth: AuthService) {
  const router = Router();
  const c = reviewControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/reviews', c.adminList);
  return router;
}
