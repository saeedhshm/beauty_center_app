import { z } from 'zod';

export const overviewQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict().refine((v) => !v.from || !v.to || v.from <= v.to, {
  message: 'تاريخ النهاية يجب ألا يسبق تاريخ البداية',
  path: ['to'],
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
