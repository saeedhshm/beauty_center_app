import type { RequestHandler, Response } from 'express';
import type { AuthenticatedUser, AuthService, SessionAudience } from '../modules/auth/auth.service.js';
import { AppError } from '../shared/app-error.js';

export function authenticatedUser(res: Response): AuthenticatedUser {
  const user = res.locals.authenticatedUser as AuthenticatedUser | undefined;
  if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'تسجيل الدخول مطلوب');
  return user;
}

export function authenticate(service: AuthService, audience: SessionAudience = 'mobile'): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
    if (!match?.[1]) throw new AppError(401, 'UNAUTHENTICATED', 'تسجيل الدخول مطلوب');
    res.locals.authenticatedUser = await service.authenticate(match[1], audience);
    next();
  };
}

export function authorize(...roles: string[]): RequestHandler {
  return (_req, res, next) => {
    if (!roles.includes(authenticatedUser(res).role)) throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    next();
  };
}
