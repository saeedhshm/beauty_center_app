import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { ReviewService } from './review.service.js';
import { adminReviewQuery, createReviewSchema, pageSchema, uuidSchema } from './review.validation.js';

export function reviewControllers(service: ReviewService) {
  return {
    submit: async (req, res) => {
      const body = createReviewSchema.parse(req.body);
      res.status(201).json({ data: await service.submit(authenticatedUser(res), uuidSchema.parse(req.params.id), body), requestId: res.locals.requestId });
    },
    forBooking: async (req, res) => {
      res.json({ data: await service.forBooking(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    forExpert: async (req, res) => {
      res.json({ data: await service.forExpert(uuidSchema.parse(req.params.id), pageSchema.parse(req.query)), requestId: res.locals.requestId });
    },
    adminList: async (req, res) => {
      res.json({ data: await service.adminList(authenticatedUser(res), adminReviewQuery.parse(req.query)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
