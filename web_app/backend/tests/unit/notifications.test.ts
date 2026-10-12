import { describe, expect, it } from 'vitest';
import { retryDelayMs, MAX_DELIVERY_ATTEMPTS } from '../../src/modules/notifications/notification.service.js';
import { NOTIFICATION_TYPES, notificationContent } from '../../src/modules/notifications/notification.content.js';

describe('notification delivery retry schedule', () => {
  it('backs off exponentially and stays inside the ceiling', () => {
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
    expect(retryDelayMs(8)).toBe(3_600_000);
    expect(retryDelayMs(30)).toBe(3_600_000);
    expect(MAX_DELIVERY_ATTEMPTS).toBeGreaterThan(1);
  });
});

describe('notification copy', () => {
  it('addresses each audience and never carries booking or contact data', () => {
    for (const type of Object.values(NOTIFICATION_TYPES)) {
      for (const audience of ['customer', 'expert'] as const) {
        const { title, body } = notificationContent(type, audience);
        expect(title.length).toBeGreaterThan(0);
        expect(body.length).toBeGreaterThan(0);
        expect(`${title} ${body}`).not.toMatch(/\d{5,}/);
      }
    }
    expect(notificationContent(NOTIFICATION_TYPES.bookingCompleted, 'customer').body).toContain('تقييم');
    expect(notificationContent(NOTIFICATION_TYPES.bookingCompleted, 'expert').body).toContain('تقييم');
    expect(notificationContent(NOTIFICATION_TYPES.bookingExpired, 'expert').title).not.toBe(notificationContent(NOTIFICATION_TYPES.bookingExpired, 'customer').title);
  });
});
