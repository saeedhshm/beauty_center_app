import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { PaymentService } from './payment.service.js';
import { demoWebhookSchema, pageSchema, paymentListQuery, refundSchema, uuidSchema } from './payment.validation.js';

export function paymentControllers(service: PaymentService) {
  return {
    initiate: async (req, res) => {
      const result = await service.initiate(authenticatedUser(res), uuidSchema.parse(req.params.id));
      res.status(result.reused ? 200 : 201).json({ data: result, requestId: res.locals.requestId });
    },
    byBooking: async (req, res) => {
      res.json({ data: await service.listMine(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    webhook: async (req, res) => {
      res.json({ data: await service.webhook(demoWebhookSchema.parse(req.body)), requestId: res.locals.requestId });
    },
    adminList: async (req, res) => {
      res.json({ data: await service.adminList(authenticatedUser(res), paymentListQuery.parse(req.query)), requestId: res.locals.requestId });
    },
    adminLate: async (req, res) => {
      const q = pageSchema.parse(req.query);
      res.json({ data: await service.adminLate(authenticatedUser(res), q), requestId: res.locals.requestId });
    },
    adminDetail: async (req, res) => {
      res.json({ data: await service.adminDetail(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    refund: async (req, res) => {
      const body = refundSchema.parse(req.body);
      res.json({ data: await service.refund(authenticatedUser(res), uuidSchema.parse(req.params.id), body.reason), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
