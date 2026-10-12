import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError } from './shared/app-error.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';
import { adminAuthRoutes } from './modules/auth/admin-auth.routes.js';
import type { CatalogService } from './modules/catalog/catalog.service.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import type { MediaService } from './modules/catalog/media.service.js';
import { adminMediaRoutes, mediaRoutes } from './modules/catalog/media.routes.js';
import type { AvailabilityService } from './modules/availability/availability.service.js';
import { availabilityRoutes } from './modules/availability/availability.routes.js';
import type { BookingService } from './modules/bookings/booking.service.js';
import { adminBookingRoutes, bookingRoutes } from './modules/bookings/booking.routes.js';
import type { PaymentService } from './modules/payments/payment.service.js';
import { adminPaymentRoutes, paymentRoutes, paymentWebhookRoutes } from './modules/payments/payment.routes.js';
import type { PayoutService } from './modules/payouts/payout.service.js';
import { adminPayoutRoutes, payoutRoutes } from './modules/payouts/payout.routes.js';
import type { NotificationService } from './modules/notifications/notification.service.js';
import { adminNotificationRoutes, notificationRoutes } from './modules/notifications/notification.routes.js';
import type { OverviewService } from './modules/overview/overview.service.js';
import { adminOverviewRoutes } from './modules/overview/overview.routes.js';
import type { ReviewService } from './modules/reviews/review.service.js';
import { adminReviewRoutes, reviewRoutes } from './modules/reviews/review.routes.js';

interface AppDependencies {
  checkDatabase: () => Promise<void>;
  logger: Logger;
  auth?: AuthService;
  catalog?: CatalogService;
  availability?: AvailabilityService;
  booking?: BookingService;
  payment?: PaymentService;
  payout?: PayoutService;
  notification?: NotificationService;
  review?: ReviewService;
  media?: MediaService;
  overview?: OverviewService;
}

export function createApp({ checkDatabase, logger, auth, catalog, availability, booking, payment, payout, notification, review, media, overview }: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    const start = performance.now();
    res.on('finish', () => {
      // Do not log URLs, query strings, headers or bodies that can carry personal data.
      logger.info({ requestId, status: res.statusCode, durationMs: Math.round(performance.now() - start) }, 'HTTP request completed');
    });
    next();
  });
  app.use(helmet());
  app.use(express.json({ limit: '32kb' }));

  app.get('/health/live', (_req, res) => {
    res.json({ data: { status: 'ok' }, requestId: res.locals.requestId });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ data: { status: 'ready' }, requestId: res.locals.requestId });
    } catch {
      logger.warn({ requestId: res.locals.requestId }, 'Database readiness check failed');
      res.status(503).json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'الخدمة غير متاحة مؤقتًا' },
        requestId: res.locals.requestId,
      });
    }
  });

  if (auth) {
    app.use('/api/v1', authRoutes(auth));
    app.use('/api/v1/admin', adminAuthRoutes(auth));
    if (catalog) app.use('/api/v1', catalogRoutes(catalog, auth));
    if (media) {
      app.use('/api/v1', mediaRoutes(media, auth));
      app.use('/api/v1/admin', adminMediaRoutes(media, auth));
    }
    if (availability) app.use('/api/v1', availabilityRoutes(availability, auth));
    if (booking) {
      app.use('/api/v1', bookingRoutes(booking, auth));
      app.use('/api/v1/admin', adminBookingRoutes(booking, auth));
    }
    if (payment) {
      app.use('/api/v1', paymentRoutes(payment, auth));
      app.use('/api/v1/admin', adminPaymentRoutes(payment, auth));
      app.use('/api/v1', paymentWebhookRoutes(payment));
    }
    if (payout) {
      app.use('/api/v1', payoutRoutes(payout, auth));
      app.use('/api/v1/admin', adminPayoutRoutes(payout, auth));
    }
    if (notification) {
      app.use('/api/v1', notificationRoutes(notification, auth));
      app.use('/api/v1/admin', adminNotificationRoutes(notification, auth));
    }
    if (overview) app.use('/api/v1/admin', adminOverviewRoutes(overview, auth));
    if (review) {
      app.use('/api/v1', reviewRoutes(review, auth));
      app.use('/api/v1/admin', adminReviewRoutes(review, auth));
    }
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'المسار غير موجود' },
      requestId: res.locals.requestId,
    });
  });

  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    if (error instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join('.') || '_form';
        (fields[key] ??= []).push(issue.message);
      }
      res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'تحققي من البيانات المدخلة', fields }, requestId: res.locals.requestId });
      return;
    }
    if (error instanceof AppError) {
      if (error.retryAfterSeconds) res.setHeader('Retry-After', error.retryAfterSeconds);
      res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) }, requestId: res.locals.requestId });
      return;
    }
    const type = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
    const knownErrors = {
      'entity.parse.failed': [400, 'INVALID_JSON', 'صيغة JSON غير صحيحة'],
      'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'حجم الطلب أكبر من المسموح'],
      'charset.unsupported': [415, 'UNSUPPORTED_ENCODING', 'ترميز الطلب غير مدعوم'],
      'encoding.unsupported': [415, 'UNSUPPORTED_ENCODING', 'ترميز الطلب غير مدعوم'],
    } as const;
    const known = typeof type === 'string' && Object.hasOwn(knownErrors, type)
      ? knownErrors[type as keyof typeof knownErrors] : undefined;
    const [status, code, message] = known ?? [500, 'INTERNAL_ERROR', 'حدث خطأ داخلي'];
    if (status === 500) logger.error({ requestId: res.locals.requestId }, 'Unhandled request error');
    res.status(status).json({ error: { code, message }, requestId: res.locals.requestId });
  };
  app.use(errorHandler);
  return app;
}
