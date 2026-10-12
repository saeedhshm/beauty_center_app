import { randomInt, randomUUID } from 'node:crypto';
import type { users } from '../../db/schema/core.js';
import type { OtpSender } from '../../integrations/sms/otp-sender.js';
import { AppError } from '../../shared/app-error.js';
import type { AuthConfig } from './auth.config.js';
import { equalHash, getDummyHash, hashPassword, newAccessToken, newRefreshToken, otpHash, secretHash, tokenHash, verifyPassword } from './auth.crypto.js';
import { AuthRepository } from './auth.repository.js';
import type { RegistrationInput } from './auth.validation.js';

type User = typeof users.$inferSelect;
const invalidSession = () => new AppError(401, 'UNAUTHENTICATED', 'الجلسة غير صالحة أو انتهت صلاحيتها');
const validMobileUser = (user: User | undefined): user is User => !!user?.isActive && !!user.phoneVerifiedAt && (user.role === 'customer' || user.role === 'expert');
export type SessionAudience = 'mobile' | 'admin';
const validUser = (user: User | undefined, audience: SessionAudience): user is User => audience === 'mobile'
  ? validMobileUser(user) : !!user?.isActive && !!user.phoneVerifiedAt && user.role === 'admin';
const publicUser = (user: User) => ({ id: user.id, name: user.name, phone: user.phone, role: user.role, phoneVerified: user.phoneVerifiedAt !== null });
export type AuthenticatedUser = ReturnType<typeof publicUser>;

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly sender: OtpSender,
    private readonly config: AuthConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async limit(scope: string, identity: string, count: number, seconds: number) {
    const key = secretHash(this.config.AUTH_SECRET, `rate:${scope}:${identity}`);
    const result = await this.repo.consumeRateLimit(key, count, seconds * 1000, this.now());
    if (!result.allowed) throw new AppError(429, 'RATE_LIMITED', 'محاولات كثيرة، حاولي لاحقًا', undefined, result.retryAfterSeconds);
  }

  async limitIp(action: 'otp' | 'register' | 'login' | 'refresh' | 'logout' | 'recovery' | 'account', ip: string) {
    const limits = { otp: [20, 600], register: [20, 600], login: [30, 900], refresh: [60, 60], logout: [60, 60], recovery: [20, 600], account: [60, 60] } as const;
    const [count, seconds] = limits[action];
    await this.limit(`ip:${action}`, ip, count, seconds);
  }

  async requestOtp(phone: string, scope: 'otp' | 'recovery' = 'otp') {
    await this.limit(`${scope}:phone:cooldown`, phone, 1, 60);
    await this.limit(`${scope}:phone:hour`, phone, 5, 3600);
    const id = randomUUID();
    const code = this.sender.generateCode?.() ?? randomInt(0, 1000000).toString().padStart(6, '0');
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.config.AUTH_OTP_TTL_SECONDS * 1000);
    await this.repo.transaction(async (repo) => {
      await repo.lockPhone(phone);
      await repo.invalidatePhoneChallenges(phone, now);
      await repo.addChallenge({ id, phone, codeHash: otpHash(this.config.AUTH_SECRET, id, phone, code), expiresAt, createdAt: now });
    });
    // No slow external request inside the transaction. Undelivered challenges cannot register.
    try {
      await this.sender.sendRegistrationCode({ phone, code, expiresInSeconds: this.config.AUTH_OTP_TTL_SECONDS });
      await this.repo.updateChallenge(id, { deliveredAt: this.now() });
    } catch {
      await this.repo.updateChallenge(id, { consumedAt: this.now() });
      throw new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'تعذر إرسال رمز التحقق، حاولي لاحقًا');
    }
    return { challengeId: id, expiresAt: expiresAt.toISOString(), retryAfterSeconds: 60, deliveryMode: this.sender.mode ?? 'sms' };
  }

  private async newSession(repo: AuthRepository, user: User, now: Date, audience: SessionAudience = 'mobile') {
    const accessToken = newAccessToken();
    const refreshToken = newRefreshToken();
    const accessExpiresAt = new Date(now.getTime() + this.config.AUTH_ACCESS_TTL_SECONDS * 1000);
    const refreshExpiresAt = new Date(now.getTime() + this.config.AUTH_SESSION_TTL_SECONDS * 1000);
    await repo.addSession({
      id: randomUUID(), userId: user.id, audience, accessHash: tokenHash(accessToken), accessExpiresAt,
      expiresAt: refreshExpiresAt, createdAt: now, updatedAt: now,
    }, tokenHash(refreshToken), now);
    return { user: publicUser(user), tokenType: 'Bearer' as const, accessToken, refreshToken, accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString() };
  }

  async register(input: RegistrationInput) {
    // Expensive password hashing stays outside the transaction/row locks.
    const passwordHash = await hashPassword(input.password);
    const result = await this.repo.transaction(async (repo) => {
      await repo.lockPhone(input.phone);
      const challenge = await repo.challengeForUpdate(input.challengeId);
      const now = this.now();
      if (!challenge || challenge.consumedAt || !challenge.deliveredAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
        return { error: 'INVALID_OTP' as const };
      }
      const correct = challenge.phone === input.phone && equalHash(challenge.codeHash, otpHash(this.config.AUTH_SECRET, challenge.id, input.phone, input.otp));
      if (!correct) {
        // Return instead of throwing so failed-attempt counters commit.
        await repo.updateChallenge(challenge.id, { attempts: challenge.attempts + 1, ...(challenge.attempts + 1 >= 5 ? { consumedAt: now } : {}) });
        return { error: 'INVALID_OTP' as const };
      }
      await repo.updateChallenge(challenge.id, { consumedAt: now });
      if (await repo.userByPhone(input.phone)) return { error: 'PHONE_ALREADY_REGISTERED' as const };
      const user = await repo.createUser({ phone: input.phone, name: input.name, passwordHash, role: input.role, phoneVerifiedAt: now, createdAt: now, updatedAt: now });
      return { data: await this.newSession(repo, user, now) };
    });
    if (result.error === 'INVALID_OTP') throw new AppError(400, 'INVALID_OTP', 'رمز التحقق غير صالح أو انتهت صلاحيته');
    if (result.error === 'PHONE_ALREADY_REGISTERED') throw new AppError(409, 'PHONE_ALREADY_REGISTERED', 'رقم الهاتف مسجل بالفعل، استخدمي تسجيل الدخول');
    return result.data!;
  }

  async login(phone: string, password: string) {
    return this.loginForAudience(phone, password, 'mobile');
  }

  async adminLogin(phone: string, password: string) {
    return this.loginForAudience(phone, password, 'admin');
  }

  private async loginForAudience(phone: string, password: string, audience: SessionAudience) {
    await this.limit('login:phone', phone, 10, 900);
    const found = await this.repo.userByPhone(phone);
    const matches = await verifyPassword(password, found?.passwordHash ?? await getDummyHash());
    if (!matches || !validUser(found, audience) || !found.passwordHash) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'رقم الهاتف أو كلمة المرور غير صحيحة');
    }
    return this.repo.transaction(async (repo) => {
      const user = await repo.userById(found.id, true);
      if (!validUser(user, audience) || user.passwordHash !== found.passwordHash) throw new AppError(401, 'INVALID_CREDENTIALS', 'رقم الهاتف أو كلمة المرور غير صحيحة');
      return this.newSession(repo, user, this.now(), audience);
    });
  }

  async refresh(refreshToken: string, audience: SessionAudience = 'mobile') {
    const hash = tokenHash(refreshToken);
    const result = await this.repo.transaction(async (repo) => {
      const initial = await repo.refreshByHash(hash);
      if (!initial) return null;
      const session = await repo.sessionForUpdate(initial.sessionId);
      const now = this.now();
      if (!session || session.audience !== audience || session.revokedAt || session.expiresAt <= now) return null;
      const token = await repo.refreshByHash(hash);
      const user = await repo.userById(session.userId);
      if (!token || token.consumedAt || !validUser(user, audience)) {
        await repo.revokeSession(session.id, now);
        return null; // Commit revocation on reuse; never roll it back by throwing here.
      }
      const accessToken = newAccessToken();
      const nextRefresh = newRefreshToken();
      const accessExpiresAt = new Date(Math.min(now.getTime() + this.config.AUTH_ACCESS_TTL_SECONDS * 1000, session.expiresAt.getTime()));
      await repo.rotateSession(session.id, hash, tokenHash(nextRefresh), tokenHash(accessToken), accessExpiresAt, now);
      return { user: publicUser(user), tokenType: 'Bearer' as const, accessToken, refreshToken: nextRefresh, accessExpiresAt: accessExpiresAt.toISOString(), refreshExpiresAt: session.expiresAt.toISOString() };
    });
    if (!result) throw invalidSession();
    return result;
  }

  async logout(refreshToken: string, audience: SessionAudience = 'mobile') {
    await this.repo.transaction(async (repo) => {
      const token = await repo.refreshByHash(tokenHash(refreshToken));
      if (!token) return;
      const session = await repo.sessionForUpdate(token.sessionId);
      if (session?.audience === audience) await repo.revokeSession(session.id, this.now());
    });
  }

  async authenticate(accessToken: string, audience: SessionAudience = 'mobile'): Promise<AuthenticatedUser> {
    if (!/^la_[A-Za-z0-9_-]{43}$/.test(accessToken)) throw invalidSession();
    const user = await this.repo.userForAccess(tokenHash(accessToken), this.now(), audience);
    if (!validUser(user, audience)) throw invalidSession();
    return publicUser(user);
  }

  async ownExpertProfile(user: AuthenticatedUser) {
    if (user.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'هذه العملية متاحة للخبيرة فقط');
    const profile = await this.repo.expertProfile(user.id);
    if (!profile) throw new AppError(404, 'NOT_FOUND', 'ملف الخبيرة غير موجود');
    return profile;
  }

  // Recovery reuses the registration OTP machinery: a verified challenge for
  // the phone rotates the hash and revokes every session. No session is issued;
  // the client logs in again. In demo mode the code is the documented 123456.
  async resetPassword(input: { phone: string; challengeId: string; otp: string; newPassword: string }) {
    const passwordHash = await hashPassword(input.newPassword);
    const result = await this.repo.transaction(async (repo) => {
      await repo.lockPhone(input.phone);
      const challenge = await repo.challengeForUpdate(input.challengeId);
      const now = this.now();
      if (!challenge || challenge.consumedAt || !challenge.deliveredAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
        return { error: 'INVALID_OTP' as const };
      }
      const correct = challenge.phone === input.phone && equalHash(challenge.codeHash, otpHash(this.config.AUTH_SECRET, challenge.id, input.phone, input.otp));
      if (!correct) {
        await repo.updateChallenge(challenge.id, { attempts: challenge.attempts + 1, ...(challenge.attempts + 1 >= 5 ? { consumedAt: now } : {}) });
        return { error: 'INVALID_OTP' as const };
      }
      await repo.updateChallenge(challenge.id, { consumedAt: now });
      const user = await repo.userByPhone(input.phone);
      if (!user) return { error: 'ACCOUNT_NOT_FOUND' as const };
      await repo.updatePasswordHash(user.id, passwordHash, now);
      await repo.revokeUserSessions(user.id, now);
      return { data: null };
    });
    if (result.error === 'INVALID_OTP') throw new AppError(400, 'INVALID_OTP', 'رمز التحقق غير صالح أو انتهت صلاحيته');
    if (result.error === 'ACCOUNT_NOT_FOUND') throw new AppError(404, 'ACCOUNT_NOT_FOUND', 'لا يوجد حساب بهذا الرقم');
  }

  async changePassword(user: AuthenticatedUser, input: { currentPassword: string; newPassword: string }) {
    const stored = await this.repo.userById(user.id);
    if (!stored?.passwordHash || !stored.isActive) throw invalidSession();
    if (!await verifyPassword(input.currentPassword, stored.passwordHash)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'كلمة المرور الحالية غير صحيحة');
    }
    const passwordHash = await hashPassword(input.newPassword);
    const now = this.now();
    await this.repo.transaction(async (repo) => {
      const locked = await repo.userById(user.id, true);
      if (!locked || !locked.isActive) throw invalidSession();
      await repo.updatePasswordHash(user.id, passwordHash, now);
      await repo.revokeUserSessions(user.id, now);
    });
  }

  async changePhone(user: AuthenticatedUser, input: { phone: string; challengeId: string; otp: string }) {
    const result = await this.repo.transaction(async (repo) => {
      await repo.lockPhone(input.phone);
      const challenge = await repo.challengeForUpdate(input.challengeId);
      const now = this.now();
      if (!challenge || challenge.consumedAt || !challenge.deliveredAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
        return { error: 'INVALID_OTP' as const };
      }
      const correct = challenge.phone === input.phone && equalHash(challenge.codeHash, otpHash(this.config.AUTH_SECRET, challenge.id, input.phone, input.otp));
      if (!correct) {
        await repo.updateChallenge(challenge.id, { attempts: challenge.attempts + 1, ...(challenge.attempts + 1 >= 5 ? { consumedAt: now } : {}) });
        return { error: 'INVALID_OTP' as const };
      }
      await repo.updateChallenge(challenge.id, { consumedAt: now });
      const owner = await repo.userById(user.id, true);
      if (!owner || !owner.isActive) return { error: 'UNAUTHENTICATED' as const };
      const taken = await repo.userByPhone(input.phone);
      if (taken && taken.id !== user.id) return { error: 'PHONE_ALREADY_REGISTERED' as const };
      await repo.updatePhone(user.id, input.phone, now, now);
      const updated = await repo.userById(user.id);
      return { data: publicUser(updated!) };
    });
    if (result.error === 'INVALID_OTP') throw new AppError(400, 'INVALID_OTP', 'رمز التحقق غير صالح أو انتهت صلاحيته');
    if (result.error === 'PHONE_ALREADY_REGISTERED') throw new AppError(409, 'PHONE_ALREADY_REGISTERED', 'رقم الهاتف مسجل بحساب آخر');
    if (result.error === 'UNAUTHENTICATED') throw invalidSession();
    return result.data!;
  }

  async updateProfile(user: AuthenticatedUser, input: { name?: string; cityId?: number }) {
    if (user.role !== 'customer' && user.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const now = this.now();
    const updated = await this.repo.transaction(async (repo) => {
      const locked = await repo.userById(user.id, true);
      if (!locked || !locked.isActive) throw invalidSession();
      if (input.cityId !== undefined && !await repo.activeCityById(input.cityId)) {
        throw new AppError(409, 'CITY_UNAVAILABLE', 'المدينة غير متاحة ضمن نطاق الإطلاق');
      }
      return repo.updateProfile(user.id, input, now);
    });
    return { id: updated!.id, name: updated!.name, phone: updated!.phone, role: updated!.role, cityId: updated!.cityId, phoneVerified: true };
  }

  async deactivateSelf(user: AuthenticatedUser) {
    const now = this.now();
    await this.repo.transaction(async (repo) => {
      const locked = await repo.userById(user.id, true);
      if (!locked) throw invalidSession();
      await repo.setUserActive(user.id, false, now);
      await repo.revokeUserSessions(user.id, now);
    });
  }

  private requireAdmin(user: AuthenticatedUser) {
    if (user.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
  }

  async adminSetUserActive(admin: AuthenticatedUser, targetId: string, isActive: boolean) {
    this.requireAdmin(admin);
    if (admin.id === targetId) throw new AppError(403, 'FORBIDDEN', 'لا يمكن للمدير تعطيل حسابه');
    const now = this.now();
    return this.repo.transaction(async (repo) => {
      const target = await repo.userById(targetId, true);
      if (!target) throw new AppError(404, 'NOT_FOUND', 'الحساب غير موجود');
      if (target.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'لا يمكن تعطيل حساب مدير');
      await repo.setUserActive(targetId, isActive, now);
      if (!isActive) await repo.revokeUserSessions(targetId, now);
      await repo.audit(admin.id, isActive ? 'user.reactivated' : 'user.deactivated', 'user', targetId, { role: target.role });
      return { id: targetId, isActive };
    });
  }

  async adminAuditLogs(admin: AuthenticatedUser, filters: { action?: string; resourceType?: string; actorId?: string; from?: string; to?: string }, page: number, limit: number) {    this.requireAdmin(admin);
    const rows = await this.repo.listAuditLogs({
      ...(filters.action !== undefined ? { action: filters.action } : {}),
      ...(filters.resourceType !== undefined ? { resourceType: filters.resourceType } : {}),
      ...(filters.actorId !== undefined ? { actorId: filters.actorId } : {}),
      ...(filters.from !== undefined ? { from: new Date(filters.from) } : {}),
      ...(filters.to !== undefined ? { to: new Date(filters.to) } : {}),
    }, page, limit);
    return {
      items: rows.slice(0, limit).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      pagination: { page, limit, hasNext: rows.length > limit },
    };
  }

  async adminUsers(
    admin: AuthenticatedUser,
    filters: { role?: string; isActive?: boolean; q?: string; from?: string; to?: string },
    page: number, limit: number,
  ) {
    this.requireAdmin(admin);
    const rows = await this.repo.adminUsers({
      ...(filters.role !== undefined ? { role: filters.role } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
      ...(filters.q !== undefined ? { q: filters.q } : {}),
      ...(filters.from !== undefined ? { from: new Date(filters.from) } : {}),
      ...(filters.to !== undefined ? { to: new Date(filters.to) } : {}),
    }, page, limit);
    return {
      items: rows.slice(0, limit).map((row) => ({
        ...row,
        phoneVerified: row.phoneVerified !== null,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: { page, limit, hasNext: rows.length > limit },
    };
  }

  async adminUser(admin: AuthenticatedUser, id: string) {
    this.requireAdmin(admin);
    const row = await this.repo.adminUser(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'الحساب غير موجود');
    return { ...row, phoneVerified: row.phoneVerified !== null, createdAt: row.createdAt.toISOString() };
  }
}
