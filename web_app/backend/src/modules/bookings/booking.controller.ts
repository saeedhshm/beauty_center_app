import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { BookingService } from './booking.service.js';
import { bookingCreateSchema, bookingListQuery, idempotencyKeySchema, transitionSchema, uuidSchema } from './booking.validation.js';

export function bookingControllers(service: BookingService) {
  return {
    create: async (req, res) => {
      const header = req.headers['idempotency-key'];
      const key = header === undefined ? undefined : idempotencyKeySchema.parse(header);
      const result = await service.create(authenticatedUser(res), bookingCreateSchema.parse(req.body), key);
      res.status(result.status).json({ data: result.body, requestId: res.locals.requestId });
    },
    list: async (req, res) => {
      res.json({ data: await service.list(authenticatedUser(res), bookingListQuery.parse(req.query)), requestId: res.locals.requestId });
    },
    detail: async (req, res) => {
      res.json({ data: await service.detail(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    accept: async (req, res) => {
      res.json({ data: await service.accept(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    reject: async (req, res) => {
      const body = transitionSchema.parse(req.body);
      res.json({ data: await service.reject(authenticatedUser(res), uuidSchema.parse(req.params.id), body.reason), requestId: res.locals.requestId });
    },
    cancel: async (req, res) => {
      const body = transitionSchema.parse(req.body);
      res.json({ data: await service.cancel(authenticatedUser(res), uuidSchema.parse(req.params.id), body.reason), requestId: res.locals.requestId });
    },
    complete: async (req, res) => {
      res.json({ data: await service.complete(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
