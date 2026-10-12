import { and, asc, desc, eq, gt, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';
import type { createDatabase } from '../../db/client.js';
import { authOtpChallenges, authRateLimits, authRefreshTokens, authSessions } from '../../db/schema/auth.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { cities, expertProfiles, users } from '../../db/schema/core.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class AuthRepository {
  constructor(private readonly db: Database | Transaction) {}

  transaction<T>(work: (repo: AuthRepository) => Promise<T>) {
    return this.db.transaction((tx) => work(new AuthRepository(tx)));
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number, now: Date) {
    const reset = new Date(now.getTime() + windowMs);
    const expired = sql`${authRateLimits.resetsAt} <= ${now.toISOString()}::timestamptz`;
    const [row] = await this.db.insert(authRateLimits).values({ key, hits: 1, resetsAt: reset })
      .onConflictDoUpdate({ target: authRateLimits.key, set: {
        hits: sql`case when ${expired} then 1 else least(${authRateLimits.hits} + 1, ${limit + 1}) end`,
        resetsAt: sql`case when ${expired} then ${reset.toISOString()}::timestamptz else ${authRateLimits.resetsAt} end`,
      } }).returning();
    return { allowed: row!.hits <= limit, retryAfterSeconds: Math.max(1, Math.ceil((row!.resetsAt.getTime() - now.getTime()) / 1000)) };
  }

  async lockPhone(phone: string) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${phone}, 0))`);
  }
  async invalidatePhoneChallenges(phone: string, now: Date) {
    await this.db.update(authOtpChallenges).set({ consumedAt: now }).where(and(eq(authOtpChallenges.phone, phone), isNull(authOtpChallenges.consumedAt)));
  }
  async addChallenge(value: typeof authOtpChallenges.$inferInsert) {
    await this.db.insert(authOtpChallenges).values(value);
  }
  async updateChallenge(id: string, values: Partial<Pick<typeof authOtpChallenges.$inferInsert, 'attempts' | 'consumedAt' | 'deliveredAt'>>) {
    await this.db.update(authOtpChallenges).set(values).where(eq(authOtpChallenges.id, id));
  }
  async challengeForUpdate(id: string) {
    const [row] = await this.db.select().from(authOtpChallenges).where(eq(authOtpChallenges.id, id)).for('update');
    return row;
  }
  async userByPhone(phone: string) {
    const [row] = await this.db.select().from(users).where(eq(users.phone, phone));
    return row;
  }
  async userById(id: string, lock = false) {
    const query = this.db.select().from(users).where(eq(users.id, id));
    const [row] = await (lock ? query.for('update') : query);
    return row;
  }
  async createUser(input: typeof users.$inferInsert) {
    const [user] = await this.db.insert(users).values(input).returning();
    if (user!.role === 'expert') await this.db.insert(expertProfiles).values({ userId: user!.id });
    return user!;
  }
  async expertProfile(id: string) {
    const [profile] = await this.db.select({
      userId: expertProfiles.userId,
      name: users.name,
      cityId: users.cityId,
      bio: expertProfiles.bio,
      approvalStatus: expertProfiles.approvalStatus,
      isAcceptingBookings: expertProfiles.isAcceptingBookings,
    }).from(expertProfiles).innerJoin(users, eq(users.id, expertProfiles.userId)).where(eq(expertProfiles.userId, id));
    return profile;
  }
  async addSession(input: typeof authSessions.$inferInsert, refreshHash: string, now: Date) {
    await this.db.insert(authSessions).values(input);
    await this.db.insert(authRefreshTokens).values({ hash: refreshHash, sessionId: input.id, createdAt: now });
  }
  async refreshByHash(hash: string) {
    const [token] = await this.db.select().from(authRefreshTokens).where(eq(authRefreshTokens.hash, hash));
    return token;
  }
  async sessionForUpdate(id: string) {
    const [session] = await this.db.select().from(authSessions).where(eq(authSessions.id, id)).for('update');
    return session;
  }
  async rotateSession(id: string, oldRefreshHash: string, nextRefreshHash: string, accessHash: string, accessExpiresAt: Date, now: Date) {
    await this.db.update(authRefreshTokens).set({ consumedAt: now }).where(eq(authRefreshTokens.hash, oldRefreshHash));
    await this.db.update(authSessions).set({ accessHash, accessExpiresAt, updatedAt: now }).where(eq(authSessions.id, id));
    await this.db.insert(authRefreshTokens).values({ hash: nextRefreshHash, sessionId: id, createdAt: now });
  }
  async revokeSession(id: string, now: Date) {
    await this.db.update(authSessions).set({ revokedAt: now, updatedAt: now }).where(and(eq(authSessions.id, id), isNull(authSessions.revokedAt)));
  }
  async userForAccess(hash: string, now: Date, audience: 'mobile' | 'admin') {
    const [row] = await this.db.select({ user: users }).from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(and(eq(authSessions.accessHash, hash), eq(authSessions.audience, audience), isNull(authSessions.revokedAt), gt(authSessions.accessExpiresAt, now), gt(authSessions.expiresAt, now), eq(users.isActive, true)));
    return row?.user;
  }

  async updatePasswordHash(id: string, passwordHash: string, now: Date) {
    await this.db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, id));
  }

  async revokeUserSessions(userId: string, now: Date) {
    await this.db.update(authSessions).set({ revokedAt: now, updatedAt: now })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)));
  }

  async updatePhone(id: string, phone: string, verifiedAt: Date, now: Date) {
    await this.db.update(users).set({ phone, phoneVerifiedAt: verifiedAt, updatedAt: now }).where(eq(users.id, id));
  }

  async activeCityById(id: number) {
    const [row] = await this.db.select({ id: cities.id }).from(cities)
      .where(and(eq(cities.id, id), eq(cities.isActive, true)));
    return row;
  }

  async updateProfile(id: string, values: { name?: string; cityId?: number }, now: Date) {
    const [row] = await this.db.update(users)
      .set({ ...values, updatedAt: now }).where(eq(users.id, id))
      .returning({ id: users.id, name: users.name, phone: users.phone, role: users.role, cityId: users.cityId, isActive: users.isActive });
    return row;
  }

  async setUserActive(id: string, isActive: boolean, now: Date) {
    const [row] = await this.db.update(users).set({ isActive, updatedAt: now }).where(eq(users.id, id))
      .returning({ id: users.id, role: users.role, isActive: users.isActive });
    return row;
  }

  async audit(actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType, resourceId, details });
  }

  private static readonly managedUserFields = {
    id: users.id,
    name: users.name,
    phone: users.phone,
    role: users.role,
    cityId: users.cityId,
    cityName: cities.name,
    isActive: users.isActive,
    phoneVerified: users.phoneVerifiedAt,
    ratingAvg: users.ratingAvg,
    ratingCount: users.ratingCount,
    createdAt: users.createdAt,
  };

  adminUsers(
    filters: { role?: string; isActive?: boolean; q?: string; from?: Date; to?: Date },
    page: number, limit: number,
  ) {
    const term = filters.q ? `%${filters.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
    return this.db.select(AuthRepository.managedUserFields).from(users)
      .leftJoin(cities, eq(users.cityId, cities.id))
      .where(and(
        filters.role ? eq(users.role, filters.role) : undefined,
        filters.isActive !== undefined ? eq(users.isActive, filters.isActive) : undefined,
        term ? or(ilike(users.name, term), ilike(users.phone, term)) : undefined,
        filters.from ? gte(users.createdAt, filters.from) : undefined,
        filters.to ? lte(users.createdAt, filters.to) : undefined,
      ))
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(limit + 1).offset((page - 1) * limit);
  }

  async adminUser(id: string) {
    const [row] = await this.db.select(AuthRepository.managedUserFields).from(users)
      .leftJoin(cities, eq(users.cityId, cities.id))
      .where(eq(users.id, id));
    return row;
  }

  listAuditLogs(
    filters: { action?: string; resourceType?: string; actorId?: string; from?: Date; to?: Date },
    page: number, limit: number,
  ) {
    return this.db.select({
      id: adminAuditLogs.id, actorId: adminAuditLogs.actorId, action: adminAuditLogs.action,
      resourceType: adminAuditLogs.resourceType, resourceId: adminAuditLogs.resourceId,
      details: adminAuditLogs.details, createdAt: adminAuditLogs.createdAt,
    }).from(adminAuditLogs).where(and(
      filters.action ? eq(adminAuditLogs.action, filters.action) : undefined,
      filters.resourceType ? eq(adminAuditLogs.resourceType, filters.resourceType) : undefined,
      filters.actorId ? eq(adminAuditLogs.actorId, filters.actorId) : undefined,
      filters.from ? gte(adminAuditLogs.createdAt, filters.from) : undefined,
      filters.to ? lte(adminAuditLogs.createdAt, filters.to) : undefined,
    )).orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id)).limit(limit + 1).offset((page - 1) * limit);
  }
}
