import { and, asc, desc, eq, exists, ilike } from 'drizzle-orm';
import type { z } from 'zod';
import type { createDatabase } from '../../db/client.js';
import { cities, customerAddresses, expertProfiles, expertServices, portfolioImages, services, settings, users } from '../../db/schema/core.js';
import { adminAuditLogs } from '../../db/schema/admin.js';
import { MARKET } from '../../config/market.js';
import type { addressPatchSchema, servicePatchSchema, CityBoundaryInput, CityInput, ExpertQuery, Page } from './catalog.validation.js';

type Database = ReturnType<typeof createDatabase>['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const publicExpertFields = {
  id: users.id, name: users.name, cityId: users.cityId, cityName: cities.name,
  bio: expertProfiles.bio, ratingAvg: users.ratingAvg, ratingCount: users.ratingCount,
};
const addressFields = {
  id: customerAddresses.id, label: customerAddresses.label, addressText: customerAddresses.addressText,
  cityId: customerAddresses.cityId, lat: customerAddresses.lat, lng: customerAddresses.lng, isDefault: customerAddresses.isDefault,
};

export class CatalogRepository {
  constructor(private readonly db: Database | Transaction) {}
  transaction<T>(work: (repo: CatalogRepository) => Promise<T>) { return this.db.transaction((tx) => work(new CatalogRepository(tx))); }
  async city(id: number, lock = false) {
    const query = this.db.select().from(cities).where(eq(cities.id, id));
    const [row] = await (lock ? query.for('update') : query);
    return row;
  }
  async launchCity() {
    const [row] = await this.db.select().from(cities).where(eq(cities.code, MARKET.cityCode));
    return row;
  }
  listCities(activeOnly = false) {
    return this.db.select().from(cities).where(activeOnly ? eq(cities.isActive, true) : undefined).orderBy(asc(cities.name), asc(cities.id));
  }
  async addCity(input: CityInput) {
    const [row] = await this.db.insert(cities).values({ ...input, isActive: false }).returning();
    return row!;
  }
  async changeCity(id: number, isActive: boolean) {
    const [row] = await this.db.update(cities).set({ isActive, updatedAt: new Date() }).where(eq(cities.id, id)).returning();
    return row!;
  }
  async replaceCityBoundary(id: number, input: CityBoundaryInput) {
    const [row] = await this.db.update(cities).set({
      boundary: input.geometry,
      boundaryBounds: input.bounds,
      boundarySource: 'openstreetmap',
      boundarySourceRef: input.sourceRef,
      boundaryUpdatedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(cities.id, id)).returning();
    return row!;
  }
  async removeCity(id: number) {
    await this.db.delete(cities).where(eq(cities.id, id));
  }
  async policy(lock = false) {
    const q = this.db.select().from(settings).where(eq(settings.key, 'booking_policy'));
    const [row] = await (lock ? q.for('update') : q);
    return row;
  }
  async changePolicy(value: unknown) {
    await this.db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, 'booking_policy'));
  }
  async market(lock: 'share' | 'update' | false = false) {
    const q = this.db.select().from(settings).where(eq(settings.key, 'market'));
    const [row] = await (lock ? q.for(lock) : q);
    return row;
  }
  async changeMarket(value: unknown) {
    await this.db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, 'market'));
  }
  listServices(page: Page, admin = false) {
    return this.db.select({ id: services.id, name: services.name, description: services.description, durationMin: services.durationMin, isActive: services.isActive })
      .from(services).where(admin ? undefined : eq(services.isActive, true)).orderBy(asc(services.id)).limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }
  async service(id: number, lock = false) {
    const q = this.db.select().from(services).where(eq(services.id, id));
    const [row] = await (lock ? q.for('update') : q);
    return row;
  }
  async addService(input: typeof services.$inferInsert) {
    const [row] = await this.db.insert(services).values(input).returning(); return row!;
  }
  async changeService(id: number, input: z.infer<typeof servicePatchSchema>) {
    const [row] = await this.db.update(services).set({ ...input, updatedAt: new Date() }).where(eq(services.id, id)).returning(); return row!;
  }
  async lockUser(id: string) {
    const [row] = await this.db.select({ id: users.id, name: users.name, cityId: users.cityId, role: users.role, isActive: users.isActive })
      .from(users).where(eq(users.id, id)).for('update'); return row;
  }
  async profile(id: string) {
    const [row] = await this.db.select({ userId: expertProfiles.userId, name: users.name, cityId: users.cityId, bio: expertProfiles.bio, approvalStatus: expertProfiles.approvalStatus, isAcceptingBookings: expertProfiles.isAcceptingBookings })
      .from(expertProfiles).innerJoin(users, eq(users.id, expertProfiles.userId)).where(eq(users.id, id)); return row;
  }
  async updateExpert(id: string, userValues: { name?: string; cityId?: number }, profileValues: { bio?: string | null; isAcceptingBookings?: boolean; approvalStatus?: string }) {
    if (Object.keys(userValues).length) await this.db.update(users).set({ ...userValues, updatedAt: new Date() }).where(eq(users.id, id));
    if (Object.keys(profileValues).length) await this.db.update(expertProfiles).set({ ...profileValues, updatedAt: new Date() }).where(eq(expertProfiles.userId, id));
    return this.profile(id);
  }
  expertPrices(id: string, publicOnly = false, currency?: string) {
    return this.db.select({ serviceId: services.id, name: services.name, description: services.description, durationMin: services.durationMin, price: expertServices.price, currency: expertServices.currency, isActive: expertServices.isActive, serviceIsActive: services.isActive })
      .from(expertServices).innerJoin(services, eq(services.id, expertServices.serviceId))
      .where(and(eq(expertServices.expertId, id), publicOnly ? and(eq(services.isActive, true), eq(expertServices.isActive, true), eq(expertServices.currency, currency!)) : undefined)).orderBy(asc(services.id));
  }
  async putPrice(expertId: string, serviceId: number, price: string, isActive: boolean, currency: string) {
    const [row] = await this.db.insert(expertServices).values({ expertId, serviceId, price, isActive, currency })
      .onConflictDoUpdate({ target: [expertServices.expertId, expertServices.serviceId], set: { price, isActive, currency, updatedAt: new Date() } }).returning();
    return { expertId: row!.expertId, serviceId: row!.serviceId, price: row!.price, currency: row!.currency, isActive: row!.isActive };
  }
  private published(currency: string, query?: ExpertQuery) {
    const offered = this.db.select({ id: expertServices.serviceId }).from(expertServices).innerJoin(services, eq(services.id, expertServices.serviceId))
      .where(and(eq(expertServices.expertId, users.id), eq(expertServices.isActive, true), eq(services.isActive, true), eq(expertServices.currency, currency), query?.serviceId ? eq(services.id, query.serviceId) : undefined));
    return and(eq(users.role, 'expert'), eq(users.isActive, true), eq(expertProfiles.approvalStatus, 'approved'), eq(expertProfiles.isAcceptingBookings, true),
      eq(cities.isActive, true), exists(offered),
      query?.cityId ? eq(users.cityId, query.cityId) : undefined,
      query?.q ? ilike(users.name, `%${query.q.replace(/[\\%_]/g, '\\$&')}%`) : undefined);
  }
  publicExperts(query: ExpertQuery, currency: string) {
    const base = this.db.select(publicExpertFields).from(users)
      .innerJoin(expertProfiles, eq(users.id, expertProfiles.userId))
      .innerJoin(cities, eq(users.cityId, cities.id));
    const selected = query.sort.startsWith('price_')
      ? base.innerJoin(expertServices, and(
        eq(expertServices.expertId, users.id),
        eq(expertServices.serviceId, query.serviceId!),
        eq(expertServices.isActive, true),
        eq(expertServices.currency, currency),
      ))
      : base;
    const order = query.sort === 'name_desc' ? [desc(users.name), asc(users.id)]
      : query.sort === 'rating_desc' ? [desc(users.ratingAvg), desc(users.ratingCount), asc(users.name), asc(users.id)]
        : query.sort === 'price_asc' ? [asc(expertServices.price), asc(users.name), asc(users.id)]
          : query.sort === 'price_desc' ? [desc(expertServices.price), asc(users.name), asc(users.id)]
            : [asc(users.name), asc(users.id)];
    return selected.where(this.published(currency, query)).orderBy(...order)
      .limit(query.limit + 1).offset((query.page - 1) * query.limit);
  }
  async publicExpert(id: string, currency?: string) {
    if (!currency) {
      const value = (await this.market())?.value as { currency?: unknown } | undefined;
      if (value?.currency !== 'EGP' && value?.currency !== 'SAR') return undefined;
      currency = value.currency;
    }
    const [row] = await this.db.select(publicExpertFields).from(users).innerJoin(expertProfiles, eq(users.id, expertProfiles.userId)).innerJoin(cities, eq(users.cityId, cities.id))
      .where(and(eq(users.id, id), this.published(currency))); return row;
  }
  adminExperts(page: Page, status?: string) {
    return this.db.select({ ...publicExpertFields, phone: users.phone, isActive: users.isActive, approvalStatus: expertProfiles.approvalStatus, isAcceptingBookings: expertProfiles.isAcceptingBookings })
      .from(users).innerJoin(expertProfiles, eq(users.id, expertProfiles.userId)).leftJoin(cities, eq(users.cityId, cities.id))
      .where(and(eq(users.role, 'expert'), status ? eq(expertProfiles.approvalStatus, status) : undefined))
      .orderBy(desc(users.createdAt), asc(users.id)).limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }
  async adminExpert(id: string) {
    const [row] = await this.db.select({ ...publicExpertFields, phone: users.phone, isActive: users.isActive, approvalStatus: expertProfiles.approvalStatus, isAcceptingBookings: expertProfiles.isAcceptingBookings })
      .from(users).innerJoin(expertProfiles, eq(users.id, expertProfiles.userId)).leftJoin(cities, eq(users.cityId, cities.id))
      .where(and(eq(users.id, id), eq(users.role, 'expert')));
    return row;
  }
  addresses(customerId: string, page: Page) {
    return this.db.select(addressFields).from(customerAddresses).where(eq(customerAddresses.customerId, customerId))
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt), asc(customerAddresses.id)).limit(page.limit + 1).offset((page.page - 1) * page.limit);
  }
  async address(customerId: string, id: string) {
    const [row] = await this.db.select(addressFields).from(customerAddresses).where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.id, id))); return row;
  }
  async clearDefault(customerId: string) {
    await this.db.update(customerAddresses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.isDefault, true)));
  }
  async addAddress(values: typeof customerAddresses.$inferInsert) {
    const [row] = await this.db.insert(customerAddresses).values(values).returning(addressFields); return row!;
  }
  async updateAddress(customerId: string, id: string, values: z.infer<typeof addressPatchSchema>) {
    const [row] = await this.db.update(customerAddresses).set({ ...values, updatedAt: new Date() })
      .where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.id, id))).returning(addressFields); return row!;
  }
  async deleteAddress(customerId: string, id: string) {
    await this.db.delete(customerAddresses).where(and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.id, id)));
  }
  async audit(actorId: string, action: string, resourceType: string, resourceId: string, details: unknown) {
    await this.db.insert(adminAuditLogs).values({ actorId, action, resourceType, resourceId, details });
  }

  async expertOfferActive(expertId: string, serviceId: number) {
    const [row] = await this.db.select({ serviceId: expertServices.serviceId }).from(expertServices)
      .where(and(eq(expertServices.expertId, expertId), eq(expertServices.serviceId, serviceId)));
    return row;
  }

  async portfolioCount(expertId: string) {
    const rows = await this.db.select({ id: portfolioImages.id }).from(portfolioImages)
      .where(eq(portfolioImages.expertId, expertId));
    return rows.length;
  }

  async addPortfolioImage(values: typeof portfolioImages.$inferInsert) {
    const existing = await this.db.select({ sortOrder: portfolioImages.sortOrder }).from(portfolioImages)
      .where(eq(portfolioImages.expertId, values.expertId)).orderBy(desc(portfolioImages.sortOrder)).limit(1);
    const [row] = await this.db.insert(portfolioImages).values({
      ...values, sortOrder: (existing[0]?.sortOrder ?? -1) + 1,
    }).returning({ id: portfolioImages.id, serviceId: portfolioImages.serviceId, storageKey: portfolioImages.storageKey, sortOrder: portfolioImages.sortOrder });
    return row!;
  }

  portfolioOf(expertId: string) {
    return this.db.select({
      id: portfolioImages.id, serviceId: portfolioImages.serviceId, sortOrder: portfolioImages.sortOrder,
    }).from(portfolioImages).where(eq(portfolioImages.expertId, expertId))
      .orderBy(asc(portfolioImages.sortOrder), asc(portfolioImages.id));
  }

  async portfolioImage(id: string) {
    const [row] = await this.db.select().from(portfolioImages).where(eq(portfolioImages.id, id));
    return row;
  }

  async deletePortfolioImage(id: string) {
    await this.db.delete(portfolioImages).where(eq(portfolioImages.id, id));
  }

  async identityDocumentKey(expertId: string) {
    const [row] = await this.db.select({ identityDocumentKey: expertProfiles.identityDocumentKey })
      .from(expertProfiles).where(eq(expertProfiles.userId, expertId));
    return row?.identityDocumentKey ?? null;
  }

  async setIdentityDocumentKey(expertId: string, key: string) {
    await this.db.update(expertProfiles).set({ identityDocumentKey: key, updatedAt: new Date() })
      .where(eq(expertProfiles.userId, expertId));
  }

  async expertVisibility(id: string) {
    const [row] = await this.db.select({ id: users.id, isActive: users.isActive, approvalStatus: expertProfiles.approvalStatus })
      .from(users).innerJoin(expertProfiles, eq(expertProfiles.userId, users.id))
      .where(and(eq(users.id, id), eq(users.role, 'expert')));
    return row;
  }
}
