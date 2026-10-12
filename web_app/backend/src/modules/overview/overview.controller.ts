import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { OverviewService } from './overview.service.js';
import { overviewQuerySchema } from './overview.validation.js';

export function overviewControllers(service: OverviewService) {
  return {
    summary: async (req, res) => {
      res.json({ data: await service.summary(authenticatedUser(res), overviewQuerySchema.parse(req.query)), requestId: res.locals.requestId });
    },
  } satisfies Record<string, RequestHandler>;
}
