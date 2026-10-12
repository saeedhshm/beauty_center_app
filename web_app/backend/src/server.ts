import { createApp } from './app.js';
import { parseEnv } from './config/env.js';
import { createDatabase } from './db/client.js';
import { createLogger } from './shared/logger.js';
import { parseAuthConfig } from './modules/auth/auth.config.js';
import { AuthRepository } from './modules/auth/auth.repository.js';
import { AuthService } from './modules/auth/auth.service.js';
import { createOtpSender } from './integrations/sms/otp-sender.js';
import { CatalogRepository } from './modules/catalog/catalog.repository.js';
import { CatalogService } from './modules/catalog/catalog.service.js';
import { AvailabilityRepository } from './modules/availability/availability.repository.js';
import { AvailabilityService } from './modules/availability/availability.service.js';
import { BookingRepository } from './modules/bookings/booking.repository.js';
import { BookingService } from './modules/bookings/booking.service.js';
import { PaymentRepository } from './modules/payments/payment.repository.js';
import { PaymentService } from './modules/payments/payment.service.js';
import { PayoutRepository } from './modules/payouts/payout.repository.js';
import { PayoutService } from './modules/payouts/payout.service.js';
import { NotificationRepository } from './modules/notifications/notification.repository.js';
import { NotificationService } from './modules/notifications/notification.service.js';
import { ReviewRepository } from './modules/reviews/review.repository.js';
import { ReviewService } from './modules/reviews/review.service.js';
import { createPushSender } from './integrations/push/push-sender.js';
import { LocalStorageProvider } from './integrations/storage/local-storage.js';
import { MediaService } from './modules/catalog/media.service.js';
import { OverviewRepository } from './modules/overview/overview.repository.js';
import { OverviewService } from './modules/overview/overview.service.js';

const env = parseEnv(process.env);
const authConfig = parseAuthConfig(process.env);
const logger = createLogger(env.LOG_LEVEL);
const database = createDatabase(env, () => logger.error('Idle database connection failed'));
const auth = new AuthService(new AuthRepository(database.db), createOtpSender(authConfig), authConfig);
const catalog = new CatalogService(new CatalogRepository(database.db));
const availabilityRepository = new AvailabilityRepository(database.db);
// Push mode comes from the environment: demo records pending deliveries without sending.
const notification = new NotificationService(new NotificationRepository(database.db), createPushSender(env.PUSH_MODE));
const availability = new AvailabilityService(availabilityRepository);
const booking = new BookingService(new BookingRepository(database.db), availabilityRepository, notification);
const payment = new PaymentService(new PaymentRepository(database.db), notification);
const payout = new PayoutService(new PayoutRepository(database.db));
const review = new ReviewService(new ReviewRepository(database.db), new CatalogRepository(database.db), notification);
const media = new MediaService(new CatalogRepository(database.db), new LocalStorageProvider(env.STORAGE_DIR), { maxFileBytes: env.STORAGE_MAX_FILE_BYTES });
const overview = new OverviewService(new OverviewRepository(database.db));
const app = createApp({ checkDatabase: database.check, logger, auth, catalog, availability, booking, payment, payout, notification, review, media, overview });
const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT, otpMode: authConfig.AUTH_OTP_MODE }, 'API listening');
});

let stopping = false;
function shutdown(exitCode: number) {
  if (stopping) return;
  stopping = true;
  logger.info('Stopping API');
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(() => {
    void database.close().then(() => {
      clearTimeout(deadline);
      process.exitCode = exitCode;
    }).catch(() => {
      logger.error('Failed to close database pool');
      process.exit(1);
    });
  });
}

server.on('error', () => { logger.error('HTTP server failed'); shutdown(1); });
process.once('SIGTERM', () => shutdown(0));
process.once('SIGINT', () => shutdown(0));
