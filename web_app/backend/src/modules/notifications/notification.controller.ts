import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { NotificationService } from './notification.service.js';
import { adminOutboxQuery, notificationListQuery, registerDeviceSchema, uuidSchema } from './notification.validation.js';

export function notificationControllers(service: NotificationService) {
  return {
    registerDevice: async (req, res) => {
      const body = registerDeviceSchema.parse(req.body);
      res.status(201).json({ data: await service.registerDevice(authenticatedUser(res).id, body), requestId: res.locals.requestId });
    },
    devices: async (_req, res) => {
      res.json({ data: await service.devices(authenticatedUser(res).id), requestId: res.locals.requestId });
    },
    removeDevice: async (req, res) => {
      await service.removeDevice(authenticatedUser(res).id, uuidSchema.parse(req.params.id));
      res.status(204).end();
    },
    list: async (req, res) => {
      res.json({ data: await service.list(authenticatedUser(res).id, notificationListQuery.parse(req.query)), requestId: res.locals.requestId });
    },
    unreadCount: async (_req, res) => {
      res.json({ data: await service.unreadCount(authenticatedUser(res).id), requestId: res.locals.requestId });
    },
    markRead: async (req, res) => {
      res.json({ data: await service.markRead(authenticatedUser(res).id, uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    markAllRead: async (_req, res) => {
      res.json({ data: await service.markAllRead(authenticatedUser(res).id), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}

export function adminNotificationControllers(service: NotificationService) {
  return {
    outbox: async (req, res) => {
      const q = adminOutboxQuery.parse(req.query);
      res.json({ data: await service.adminOutbox(authenticatedUser(res), q.status, q.page, q.limit), requestId: res.locals.requestId });
    },
    retryOutbox: async (req, res) => {
      res.json({ data: await service.adminOutboxRetry(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
