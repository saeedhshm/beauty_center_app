import type { RequestHandler } from 'express';
import type { AuthService } from './auth.service.js';
import { adminUsersQuerySchema, auditQuerySchema, loginSchema, otpRequestSchema, passwordChangeSchema, passwordResetSchema, phoneChangeSchema, profilePatchSchema, refreshSchema, registrationSchema, uuidSchema } from './auth.validation.js';
import { authenticatedUser } from '../../middleware/authenticate.js';

export function authControllers(service: AuthService) {
  const requestOtp: RequestHandler = async (req, res) => {
    const { phone } = otpRequestSchema.parse(req.body);
    res.status(202).json({ data: await service.requestOtp(phone), requestId: res.locals.requestId });
  };
  const register: RequestHandler = async (req, res) => {
    const data = await service.register(registrationSchema.parse(req.body));
    res.status(201).json({ data, requestId: res.locals.requestId });
  };
  const login: RequestHandler = async (req, res) => {
    const { phone, password } = loginSchema.parse(req.body);
    res.json({ data: await service.login(phone, password), requestId: res.locals.requestId });
  };
  const refresh: RequestHandler = async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    res.json({ data: await service.refresh(refreshToken), requestId: res.locals.requestId });
  };
  const logout: RequestHandler = async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    await service.logout(refreshToken);
    res.status(204).end();
  };
  const me: RequestHandler = (_req, res) => {
    res.json({ data: authenticatedUser(res), requestId: res.locals.requestId });
  };
  const expertProfile: RequestHandler = async (_req, res) => {
    res.json({ data: await service.ownExpertProfile(authenticatedUser(res)), requestId: res.locals.requestId });
  };
  const requestPasswordOtp: RequestHandler = async (req, res) => {
    const { phone } = otpRequestSchema.parse(req.body);
    res.status(202).json({ data: await service.requestOtp(phone, 'recovery'), requestId: res.locals.requestId });
  };
  const requestPhoneOtp: RequestHandler = async (req, res) => {
    const { phone } = otpRequestSchema.parse(req.body);
    res.status(202).json({ data: await service.requestOtp(phone, 'recovery'), requestId: res.locals.requestId });
  };
  const resetPassword: RequestHandler = async (req, res) => {
    const input = passwordResetSchema.parse(req.body);
    await service.resetPassword(input);
    res.status(204).end();
  };
  const changePassword: RequestHandler = async (req, res) => {
    const input = passwordChangeSchema.parse(req.body);
    await service.changePassword(authenticatedUser(res), input);
    res.status(204).end();
  };
  const changePhone: RequestHandler = async (req, res) => {
    const input = phoneChangeSchema.parse(req.body);
    res.json({ data: await service.changePhone(authenticatedUser(res), input), requestId: res.locals.requestId });
  };
  const patchProfile: RequestHandler = async (req, res) => {
    const input = profilePatchSchema.parse(req.body);
    const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as {
      name?: string; cityId?: number;
    };
    res.json({ data: await service.updateProfile(authenticatedUser(res), patch), requestId: res.locals.requestId });
  };
  const deactivateSelf: RequestHandler = async (_req, res) => {
    await service.deactivateSelf(authenticatedUser(res));
    res.status(204).end();
  };
  return { requestOtp, register, login, refresh, logout, me, expertProfile, requestPasswordOtp, requestPhoneOtp, resetPassword, changePassword, changePhone, patchProfile, deactivateSelf };
}

export function adminUserControllers(service: AuthService) {
  const setActive = (isActive: boolean): RequestHandler => async (req, res) => {
    const data = await service.adminSetUserActive(authenticatedUser(res), uuidSchema.parse(req.params.id), isActive);
    res.json({ data, requestId: res.locals.requestId });
  };
  const auditLogs: RequestHandler = async (req, res) => {
    const q = auditQuerySchema.parse(req.query);
    const filters = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as {
      action?: string; resourceType?: string; actorId?: string; from?: string; to?: string;
    };
    res.json({ data: await service.adminAuditLogs(authenticatedUser(res), filters, q.page, q.limit), requestId: res.locals.requestId });
  };
  const users: RequestHandler = async (req, res) => {
    const q = adminUsersQuerySchema.parse(req.query);
    const filters = Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)) as {
      role?: string; isActive?: boolean; q?: string; from?: string; to?: string;
    };
    res.json({ data: await service.adminUsers(authenticatedUser(res), filters, q.page, q.limit), requestId: res.locals.requestId });
  };
  const user: RequestHandler = async (req, res) => {
    res.json({ data: await service.adminUser(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
  };
  return { deactivate: setActive(false), reactivate: setActive(true), auditLogs, users, user };
}
