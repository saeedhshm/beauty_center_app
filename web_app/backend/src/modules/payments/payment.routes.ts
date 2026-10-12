import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { paymentControllers } from './payment.controller.js';
import type { PaymentService } from './payment.service.js';

export function paymentRoutes(service: PaymentService, auth: AuthService) {
  const router = Router();
  const c = paymentControllers(service);
  router.post('/bookings/:id/payments', authenticate(auth), authorize('customer'), c.initiate);
  router.get('/bookings/:id/payments', authenticate(auth), authorize('customer', 'expert'), c.byBooking);
  return router;
}

export function adminPaymentRoutes(service: PaymentService, auth: AuthService) {
  const router = Router();
  const c = paymentControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/payments', c.adminList);
  router.get('/payments/late', c.adminLate);
  router.get('/payments/:id', c.adminDetail);
  router.post('/payments/:id/refund', c.refund);
  return router;
}

/** Provider callbacks carry their own token verification; no user session applies. */
export function paymentWebhookRoutes(service: PaymentService) {
  const router = Router();
  const c = paymentControllers(service);
  router.post('/webhooks/payments/demo', c.webhook);
  return router;
}
