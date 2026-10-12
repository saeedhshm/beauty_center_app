import { and, eq, sql } from 'drizzle-orm';
import type { createDatabase } from '../client.js';
import { cities, expertProfiles, expertServices, services, users } from '../schema/core.js';
import { MARKET } from '../../config/market.js';
import { hashPassword } from '../../modules/auth/auth.crypto.js';

// Public synthetic demo fixtures, not credentials for a deployed service.
export const DEMO_ACCOUNTS = [
  { phone: '+201000000001', name: 'مدير العرض التجريبي', role: 'admin', password: 'DemoAdmin-2026!' },
  { phone: '+201000000002', name: 'عميلة العرض التجريبي', role: 'customer', password: 'DemoCustomer-2026!' },
  { phone: '+201000000003', name: 'خبيرة العرض التجريبي', role: 'expert', password: 'DemoExpert-2026!' },
] as const;

export async function seedDemo(db: ReturnType<typeof createDatabase>['db']) {
  const accounts = await Promise.all(DEMO_ACCOUNTS.map(async (account) => ({ ...account, hash: await hashPassword(account.password) })));
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('lamsa-demo-seed', 0))`);
    const [city] = await tx.select().from(cities).where(eq(cities.code, MARKET.cityCode));
    if (!city) throw new Error('Apply migrations before running demo seeds');
    let createdAccounts = 0;
    let createdServices = 0;
    const serviceIds: number[] = [];
    for (const input of [
      { name: 'مكياج — عرض تجريبي', durationMin: 60 },
      { name: 'تصفيف شعر — عرض تجريبي', durationMin: 45 },
      { name: 'عناية بالأظافر — عرض تجريبي', durationMin: 30 },
    ]) {
      const [existing] = await tx.select().from(services).where(eq(services.name, input.name)).limit(1);
      const service = existing ?? (await tx.insert(services).values({ ...input, description: 'بيانات عرض تجريبية فقط' }).returning())[0]!;
      if (!existing) createdServices++;
      serviceIds.push(service.id);
    }
    for (const account of accounts) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, account.phone));
      if (existing) continue; // Never promote, reset credentials or overwrite an existing account.
      const [user] = await tx.insert(users).values({ name: account.name, phone: account.phone, role: account.role, passwordHash: account.hash, phoneVerifiedAt: new Date(), cityId: city.id }).returning();
      createdAccounts++;
      if (account.role === 'expert') {
        await tx.insert(expertProfiles).values({ userId: user!.id, bio: 'ملف خيالي مخصص لعرض التطبيق', approvalStatus: 'approved', isAcceptingBookings: true });
        for (const serviceId of serviceIds) {
          const [active] = await tx.select({ id: services.id }).from(services).where(and(eq(services.id, serviceId), eq(services.isActive, true)));
          if (active) await tx.insert(expertServices).values({ expertId: user!.id, serviceId, price: '250.00', currency: MARKET.currency });
        }
      }
    }
    return { createdAccounts, createdServices };
  });
}
