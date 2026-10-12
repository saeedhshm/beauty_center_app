import { Router, type RequestHandler } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import { authControllers } from './auth.controller.js';
import type { AuthService } from './auth.service.js';

export function authRoutes(service: AuthService) {
  const router = Router();
  const controller = authControllers(service);
  const limit = (action: Parameters<AuthService['limitIp']>[0]): RequestHandler => async (req, _res, next) => {
    // trust proxy remains false: caller-controlled X-Forwarded-For cannot bypass limits.
    await service.limitIp(action, req.ip ?? 'unknown');
    next();
  };
  router.post('/auth/register/otp', limit('otp'), controller.requestOtp);
  router.post('/auth/register', limit('register'), controller.register);
  router.post('/auth/login', limit('login'), controller.login);
  router.post('/auth/refresh', limit('refresh'), controller.refresh);
  router.post('/auth/logout', limit('logout'), controller.logout);
  router.post('/auth/password/otp', limit('recovery'), controller.requestPasswordOtp);
  router.post('/auth/password/reset', limit('recovery'), controller.resetPassword);
  router.post('/auth/phone/otp', limit('recovery'), controller.requestPhoneOtp);
  router.post('/auth/password/change', limit('account'), authenticate(service), controller.changePassword);
  router.post('/auth/phone/change', limit('account'), authenticate(service), controller.changePhone);
  router.get('/users/me', authenticate(service), controller.me);
  router.patch('/users/me', limit('account'), authenticate(service), controller.patchProfile);
  router.post('/users/me/deactivate', limit('account'), authenticate(service), controller.deactivateSelf);
  router.get('/experts/me', authenticate(service), authorize('expert'), controller.expertProfile);
  return router;
}
