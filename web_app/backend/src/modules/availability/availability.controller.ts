import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { AvailabilityService } from './availability.service.js';
import { exceptionSchema, slotsQuerySchema, uuidSchema, weeklyScheduleSchema } from './availability.validation.js';

export function availabilityControllers(service: AvailabilityService) {
  return {
    ownSchedule: async (_req, res) => {
      res.json({ data: await service.ownSchedule(authenticatedUser(res)), requestId: res.locals.requestId });
    },
    replaceSchedule: async (req, res) => {
      res.json({ data: await service.replaceOwnSchedule(authenticatedUser(res), weeklyScheduleSchema.parse(req.body)), requestId: res.locals.requestId });
    },
    ownExceptions: async (_req, res) => {
      res.json({ data: await service.ownExceptions(authenticatedUser(res)), requestId: res.locals.requestId });
    },
    addException: async (req, res) => {
      res.status(201).json({ data: await service.addOwnException(authenticatedUser(res), exceptionSchema.parse(req.body)), requestId: res.locals.requestId });
    },
    deleteException: async (req, res) => {
      await service.deleteOwnException(authenticatedUser(res), uuidSchema.parse(req.params.id));
      res.status(204).end();
    },
    slots: async (req, res) => {
      const expertId = uuidSchema.parse(req.params.id);
      res.json({ data: await service.slots(expertId, slotsQuerySchema.parse(req.query)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
