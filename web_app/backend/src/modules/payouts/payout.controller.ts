import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { PayoutService } from './payout.service.js';
import { eligibleQuerySchema, payoutCreateSchema, payoutListQuery, transferSchema, uuidSchema } from './payout.validation.js';

export function payoutControllers(service: PayoutService) {
  return {
    create: async (req, res) => {
      const body = payoutCreateSchema.parse(req.body);
      res.status(201).json({ data: await service.create(authenticatedUser(res), body.expertId, body.bookingIds), requestId: res.locals.requestId });
    },
    transfer: async (req, res) => {
      const body = transferSchema.parse(req.body);
      res.json({ data: await service.transfer(authenticatedUser(res), uuidSchema.parse(req.params.id), body.transferRef), requestId: res.locals.requestId });
    },
    adminDetail: async (req, res) => {
      res.json({ data: await service.adminDetail(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    adminList: async (req, res) => {
      res.json({ data: await service.adminList(authenticatedUser(res), payoutListQuery.parse(req.query)), requestId: res.locals.requestId });
    },
    adminEligible: async (req, res) => {
      const q = eligibleQuerySchema.parse(req.query);
      res.json({ data: await service.adminEligible(authenticatedUser(res), q.expertId), requestId: res.locals.requestId });
    },
    ownPayouts: async (req, res) => {
      res.json({ data: await service.ownPayouts(authenticatedUser(res), payoutListQuery.parse(req.query)), requestId: res.locals.requestId });
    },
    ownPayout: async (req, res) => {
      res.json({ data: await service.ownPayout(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    ownEarnings: async (_req, res) => {
      res.json({ data: await service.ownEarnings(authenticatedUser(res)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
