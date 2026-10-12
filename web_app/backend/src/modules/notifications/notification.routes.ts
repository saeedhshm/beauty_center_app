import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { adminNotificationControllers, notificationControllers } from './notification.controller.js';
import type { NotificationService } from './notification.service.js';

const owner = (auth: AuthService) => [authenticate(auth), authorize('customer', 'expert')] as const;

export function notificationRoutes(service: NotificationService, auth: AuthService) {
  const router = Router();
  const c = notificationControllers(service);
  // Authentication is attached per route: a router-wide guard would also protect
  // public routes mounted after this router.
  router.post('/devices', ...owner(auth), c.registerDevice);
  router.get('/devices', ...owner(auth), c.devices);
  router.delete('/devices/:id', ...owner(auth), c.removeDevice);
  router.get('/notifications', ...owner(auth), c.list);
  router.get('/notifications/unread-count', ...owner(auth), c.unreadCount);
  router.post('/notifications/read-all', ...owner(auth), c.markAllRead);
  router.post('/notifications/:id/read', ...owner(auth), c.markRead);
  return router;
}

export function adminNotificationRoutes(service: NotificationService, auth: AuthService) {
  const router = Router();
  const c = adminNotificationControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/notifications/outbox', c.outbox);
  router.post('/notifications/outbox/:id/retry', c.retryOutbox);
  return router;
}
