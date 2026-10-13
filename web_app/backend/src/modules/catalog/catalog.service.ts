import type { z } from 'zod';
import { MARKET, PUBLIC_MAP_CONFIG } from '../../config/market.js';
import { AppError } from '../../shared/app-error.js';
import { boundaryCoversPoint, type BoundaryBounds, type BoundaryGeometry } from '../../shared/geojson.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { CatalogRepository } from './catalog.repository.js';
import { bookingPolicySchema, marketSettingsSchema, type addressPatchSchema, type policyPatchSchema, type servicePatchSchema, type AddressInput, type CityBoundaryInput, type CityInput, type ExpertPatch, type ExpertQuery, type Page, type ServiceInput } from './catalog.validation.js';

const requireRole = (user: AuthenticatedUser, role: string) => { if (user.role !== role) throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية'); };
const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
const paginate = <T>(rows: T[], page: Page) => ({ items: rows.slice(0, page.limit), pagination: { ...page, hasNext: rows.length > page.limit } });
const serviceDto = (row: { id: number; name: string; description: string | null; durationMin: number; isActive: boolean }) => ({ id: row.id, name: row.name, description: row.description, durationMin: row.durationMin, isActive: row.isActive });
type CityLocationRow = {
  id: number; name: string; code: string | null; isActive: boolean;
  boundary: unknown; boundaryBounds: unknown;
};
const cityDto = (row: CityLocationRow) => ({
  id: row.id, name: row.name, code: row.code, isActive: row.isActive,
  location: row.boundary && row.boundaryBounds
    ? { status: 'ready' as const, bounds: row.boundaryBounds as BoundaryBounds }
    : { status: 'not_configured' as const },
});
const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === '23505'
  || (error as { cause?: { code?: string } })?.cause?.code === '23505';
const isForeignKeyViolation = (error: unknown) => (error as { code?: string })?.code === '23503'
  || (error as { cause?: { code?: string } })?.cause?.code === '23503';

export class CatalogService {
  constructor(private readonly repo: CatalogRepository) {}

  async configuration() {
    const [city, cities, policy, market] = await Promise.all([this.repo.launchCity(), this.repo.listCities(true), this.repo.policy(), this.repo.market()]);
    if (!city || !policy || !market) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
    return { launchCity: cityDto(city), cities: cities.map(cityDto), map: PUBLIC_MAP_CONFIG, currency: marketSettingsSchema.parse(market.value).currency, timeZone: MARKET.timeZone, paymentMode: MARKET.paymentMode, daytimeOnly: MARKET.daytimeOnly, bookingPolicy: bookingPolicySchema.parse(policy.value) };
  }
  async listCities(admin = false) {
    return (await this.repo.listCities(!admin)).map(cityDto);
  }
  async createCity(actor: AuthenticatedUser, input: CityInput) {
    requireRole(actor, 'admin');
    try {
      return await this.repo.transaction(async (repo) => {
        const city = await repo.addCity(input);
        const dto = cityDto(city);
        await repo.audit(actor.id, 'city.created', 'city', String(city.id), { after: dto });
        return dto;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError(409, 'CITY_ALREADY_EXISTS', 'اسم المدينة أو رمزها مستخدم بالفعل');
      throw error;
    }
  }
  async updatePolicy(actor: AuthenticatedUser, patch: z.infer<typeof policyPatchSchema>) {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const row = await repo.policy(true);
      if (!row) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      const before = bookingPolicySchema.parse(row.value);
      const after = bookingPolicySchema.parse({ ...before, ...patch });
      await repo.changePolicy(after);
      await repo.audit(actor.id, 'settings.updated', 'settings', 'booking_policy', { before, after });
      return after;
    });
  }
  async updateCity(actor: AuthenticatedUser, id: number, isActive: boolean) {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const city = await repo.city(id, true); if (!city) throw notFound();
      if (isActive && !city.boundary) throw new AppError(409, 'CITY_BOUNDARY_REQUIRED', 'يلزم إعداد حدود المدينة قبل تفعيلها');
      const after = await repo.changeCity(id, isActive);
      await repo.audit(actor.id, 'city.updated', 'city', String(id), { before: { isActive: city.isActive }, after: { isActive } });
      return cityDto(after);
    });
  }
  async replaceCityBoundary(actor: AuthenticatedUser, id: number, input: CityBoundaryInput) {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const city = await repo.city(id, true); if (!city) throw notFound();
      if (city.isActive) throw new AppError(409, 'CITY_MUST_BE_INACTIVE', 'عطّلي المدينة قبل استبدال حدودها');
      const after = await repo.replaceCityBoundary(id, input);
      await repo.audit(actor.id, 'city.boundary_updated', 'city', String(id), {
        source: 'openstreetmap', sourceRef: input.sourceRef, bounds: input.bounds,
      });
      return cityDto(after);
    });
  }
  async deleteCity(actor: AuthenticatedUser, id: number) {
    requireRole(actor, 'admin');
    try {
      await this.repo.transaction(async (repo) => {
        const city = await repo.city(id, true); if (!city) throw notFound();
        if (city.code === MARKET.cityCode) throw new AppError(409, 'LAUNCH_CITY_PROTECTED', 'لا يمكن حذف مدينة الإطلاق');
        if (city.isActive) throw new AppError(409, 'CITY_MUST_BE_INACTIVE', 'عطّلي المدينة قبل حذفها');
        await repo.removeCity(id);
        await repo.audit(actor.id, 'city.deleted', 'city', String(id), { before: cityDto(city) });
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new AppError(409, 'CITY_IN_USE', 'لا يمكن حذف مدينة مرتبطة بمستخدمين أو عناوين أو حجوزات');
      throw error;
    }
  }
  async updateCurrency(actor: AuthenticatedUser, currency: 'EGP' | 'SAR') {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const row = await repo.market('update');
      if (!row) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      const before = marketSettingsSchema.parse(row.value);
      const after = { currency } as const;
      await repo.changeMarket(after);
      await repo.audit(actor.id, 'market.currency_updated', 'settings', 'market', { before, after });
      return after;
    });
  }
  async listServices(page: Page, admin?: AuthenticatedUser) {
    if (admin) requireRole(admin, 'admin');
    return paginate(await this.repo.listServices(page, !!admin), page);
  }
  async createService(actor: AuthenticatedUser, input: ServiceInput) {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const row = await repo.addService(input);
      const dto = serviceDto(row);
      await repo.audit(actor.id, 'service.created', 'service', String(row.id), { after: dto });
      return dto;
    });
  }
  async updateService(actor: AuthenticatedUser, id: number, input: z.infer<typeof servicePatchSchema>) {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const before = await repo.service(id, true); if (!before) throw notFound();
      const after = await repo.changeService(id, input);
      await repo.audit(actor.id, 'service.updated', 'service', String(id), { before: serviceDto(before), after: serviceDto(after) });
      return serviceDto(after);
    });
  }
  private async activeCity(repo: CatalogRepository, id: number) {
    const city = await repo.city(id);
    if (!city?.isActive) throw new AppError(409, 'CITY_UNAVAILABLE', 'المدينة غير متاحة حاليًا');
    return city;
  }
  private assertLocation(city: { boundary: unknown }, lat: string | null, lng: string | null) {
    if (!city.boundary) throw new AppError(409, 'CITY_BOUNDARY_REQUIRED', 'حدود المدينة غير مهيأة');
    if (lat === null || lng === null) throw new AppError(422, 'VALIDATION_ERROR', 'خط العرض والطول مطلوبان');
    if (!boundaryCoversPoint(city.boundary as BoundaryGeometry, Number(lat), Number(lng))) {
      throw new AppError(422, 'ADDRESS_OUTSIDE_CITY', 'الموقع المحدد خارج حدود المدينة');
    }
  }
  private async lockActor(repo: CatalogRepository, actor: AuthenticatedUser, role: string) {
    requireRole(actor, role);
    const user = await repo.lockUser(actor.id);
    if (!user?.isActive || user.role !== role) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
  }
  async updateOwnExpert(actor: AuthenticatedUser, input: ExpertPatch) {
    return this.repo.transaction(async (repo) => {
      await this.lockActor(repo, actor, 'expert');
      const profile = await repo.profile(actor.id); if (!profile) throw notFound();
      if (input.cityId !== undefined) await this.activeCity(repo, input.cityId);
      if (input.isAcceptingBookings === true && profile.approvalStatus !== 'approved') throw new AppError(409, 'EXPERT_NOT_APPROVED', 'يلزم اعتماد الخبيرة قبل تفعيل استقبال الحجوزات');
      return repo.updateExpert(actor.id,
        { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.cityId !== undefined ? { cityId: input.cityId } : {}) },
        { ...(input.bio !== undefined ? { bio: input.bio } : {}), ...(input.isAcceptingBookings !== undefined ? { isAcceptingBookings: input.isAcceptingBookings } : {}) });
    });
  }
  async ownPrices(actor: AuthenticatedUser) { requireRole(actor, 'expert'); return this.repo.expertPrices(actor.id); }
  async putOwnPrice(actor: AuthenticatedUser, serviceId: number, input: { price: string; isActive: boolean }) {
    return this.repo.transaction(async (repo) => {
      const market = await repo.market('share');
      if (!market) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      const currency = marketSettingsSchema.parse(market.value).currency;
      await this.lockActor(repo, actor, 'expert');
      const service = await repo.service(serviceId, true);
      if (!service) throw notFound();
      if (input.isActive && !service.isActive) throw new AppError(409, 'SERVICE_UNAVAILABLE', 'الخدمة معطلة');
      return repo.putPrice(actor.id, serviceId, input.price, input.isActive, currency);
    });
  }
  async listExperts(query: ExpertQuery) {
    return this.repo.transaction(async (repo) => {
      const market = await repo.market('share');
      if (!market) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      return paginate(await repo.publicExperts(query, marketSettingsSchema.parse(market.value).currency), { page: query.page, limit: query.limit });
    });
  }
  async expert(id: string) {
    return this.repo.transaction(async (repo) => {
      const market = await repo.market('share');
      if (!market) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
      const currency = marketSettingsSchema.parse(market.value).currency;
      const expert = await repo.publicExpert(id, currency); if (!expert) throw notFound();
      return { ...expert, services: await repo.expertPrices(id, true, currency) };
    });
  }
  async adminExperts(actor: AuthenticatedUser, page: Page, status?: string) {
    requireRole(actor, 'admin'); return paginate(await this.repo.adminExperts(page, status), page);
  }
  async adminExpertDetail(actor: AuthenticatedUser, expertId: string) {
    requireRole(actor, 'admin');
    const profile = await this.repo.adminExpert(expertId);
    if (!profile) throw notFound();
    const [services, portfolio, documentKey] = await Promise.all([
      this.repo.expertPrices(expertId, false),
      this.repo.portfolioOf(expertId),
      this.repo.identityDocumentKey(expertId),
    ]);
    return {
      ...profile,
      services,
      portfolio: portfolio.map((row) => ({ ...row, url: `/api/v1/portfolio/${row.id}/file` })),
      identityDocument: { present: documentKey !== null },
    };
  }
  async setApproval(actor: AuthenticatedUser, expertId: string, approvalStatus: 'approved' | 'suspended') {
    requireRole(actor, 'admin');
    return this.repo.transaction(async (repo) => {
      const expert = await repo.lockUser(expertId);
      const before = await repo.profile(expertId);
      if (!expert || expert.role !== 'expert' || !before) throw notFound();
      const after = await repo.updateExpert(expertId, {}, { approvalStatus, ...(approvalStatus === 'suspended' ? { isAcceptingBookings: false } : {}) });
      await repo.audit(actor.id, 'expert.approval_updated', 'expert', expertId, { before: before.approvalStatus, after: approvalStatus });
      return after;
    });
  }
  async listAddresses(actor: AuthenticatedUser, page: Page) { requireRole(actor, 'customer'); return paginate(await this.repo.addresses(actor.id, page), page); }
  async getAddress(actor: AuthenticatedUser, id: string) {
    requireRole(actor, 'customer'); const address = await this.repo.address(actor.id, id); if (!address) throw notFound(); return address;
  }
  async createAddress(actor: AuthenticatedUser, input: AddressInput) {
    return this.repo.transaction(async (repo) => {
      await this.lockActor(repo, actor, 'customer');
      const city = await this.activeCity(repo, input.cityId);
      this.assertLocation(city, input.lat, input.lng);
      if (input.isDefault) await repo.clearDefault(actor.id);
      return repo.addAddress({ ...input, customerId: actor.id });
    });
  }
  async updateAddress(actor: AuthenticatedUser, id: string, input: z.infer<typeof addressPatchSchema>) {
    return this.repo.transaction(async (repo) => {
      await this.lockActor(repo, actor, 'customer');
      const current = await repo.address(actor.id, id); if (!current) throw notFound();
      if (input.cityId !== undefined || input.lat !== undefined || input.lng !== undefined) {
        const cityId = input.cityId ?? current.cityId;
        const city = await this.activeCity(repo, cityId);
        this.assertLocation(city, input.lat ?? current.lat, input.lng ?? current.lng);
      }
      if (input.isDefault) await repo.clearDefault(actor.id);
      return repo.updateAddress(actor.id, id, input);
    });
  }
  async deleteAddress(actor: AuthenticatedUser, id: string) {
    return this.repo.transaction(async (repo) => {
      await this.lockActor(repo, actor, 'customer');
      if (!await repo.address(actor.id, id)) throw notFound();
      await repo.deleteAddress(actor.id, id);
    });
  }
}
