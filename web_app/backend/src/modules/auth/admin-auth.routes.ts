import { Router, type RequestHandler } from 'express';
import { authenticate, authenticatedUser, authorize } from '../../middleware/authenticate.js';
import { loginSchema, refreshSchema } from './auth.validation.js';
import { adminUserControllers } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

// Explicit Bearer contract: no cookies or ambient browser credentials.
export function adminAuthRoutes(service: AuthService) {
  const router = Router();
  const limit = (action: 'login' | 'refresh' | 'logout'): RequestHandler => async (req, _res, next) => {
    await service.limitIp(action, req.ip ?? 'unknown');
    next();
  };
  router.post('/auth/login', limit('login'), async (req, res) => {
    const input = loginSchema.parse(req.body);
    res.json({ data: await service.adminLogin(input.phone, input.password), requestId: res.locals.requestId });
  });
  router.post('/auth/refresh', limit('refresh'), async (req, res) => {
    const input = refreshSchema.parse(req.body);
    res.json({ data: await service.refresh(input.refreshToken, 'admin'), requestId: res.locals.requestId });
  });
  router.post('/auth/logout', limit('logout'), async (req, res) => {
    await service.logout(refreshSchema.parse(req.body).refreshToken, 'admin');
    res.status(204).end();
  });
  router.get('/me', authenticate(service, 'admin'), authorize('admin'), (_req, res) => {
    res.json({ data: authenticatedUser(res), requestId: res.locals.requestId });
  });
  const users = adminUserControllers(service);
  const adminOnly = [authenticate(service, 'admin'), authorize('admin')] as const;
  router.get('/users', ...adminOnly, users.users);
  router.get('/users/:id', ...adminOnly, users.user);
  router.post('/users/:id/deactivate', ...adminOnly, users.deactivate);
  router.post('/users/:id/reactivate', ...adminOnly, users.reactivate);
  router.get('/audit-logs', ...adminOnly, users.auditLogs);
  return router;
}
