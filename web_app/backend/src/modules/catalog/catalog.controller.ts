import type { RequestHandler } from 'express';
import { authenticatedUser } from '../../middleware/authenticate.js';
import type { CatalogService } from './catalog.service.js';
import { addressPatchSchema, addressSchema, adminExpertsQuery, cityPatchSchema, citySchema, currencyPatchSchema, expertPatchSchema, expertPriceSchema, expertsQuery, idSchema, pageSchema, policyPatchSchema, servicePatchSchema, serviceSchema, uuidSchema } from './catalog.validation.js';

export function catalogControllers(service: CatalogService) {
  return {
    configuration: async (_req, res) => { res.json({ data: await service.configuration(), requestId: res.locals.requestId }); },
    cities: async (_req, res) => { res.json({ data: await service.listCities(), requestId: res.locals.requestId }); },
    services: async (req, res) => { res.json({ data: await service.listServices(pageSchema.strict().parse(req.query)), requestId: res.locals.requestId }); },
    experts: async (req, res) => { res.json({ data: await service.listExperts(expertsQuery.parse(req.query)), requestId: res.locals.requestId }); },
    expert: async (req, res) => { res.json({ data: await service.expert(uuidSchema.parse(req.params.id)), requestId: res.locals.requestId }); },
    editExpert: async (req, res) => { res.json({ data: await service.updateOwnExpert(authenticatedUser(res), expertPatchSchema.parse(req.body)), requestId: res.locals.requestId }); },
    ownPrices: async (_req, res) => { res.json({ data: await service.ownPrices(authenticatedUser(res)), requestId: res.locals.requestId }); },
    putPrice: async (req, res) => { res.json({ data: await service.putOwnPrice(authenticatedUser(res), idSchema.parse(req.params.serviceId), expertPriceSchema.parse(req.body)), requestId: res.locals.requestId }); },
    addresses: async (req, res) => { res.json({ data: await service.listAddresses(authenticatedUser(res), pageSchema.strict().parse(req.query)), requestId: res.locals.requestId }); },
    address: async (req, res) => { res.json({ data: await service.getAddress(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId }); },
    addAddress: async (req, res) => { res.status(201).json({ data: await service.createAddress(authenticatedUser(res), addressSchema.parse(req.body)), requestId: res.locals.requestId }); },
    editAddress: async (req, res) => { res.json({ data: await service.updateAddress(authenticatedUser(res), uuidSchema.parse(req.params.id), addressPatchSchema.parse(req.body)), requestId: res.locals.requestId }); },
    deleteAddress: async (req, res) => { await service.deleteAddress(authenticatedUser(res), uuidSchema.parse(req.params.id)); res.status(204).end(); },
    adminSettings: async (_req, res) => { res.json({ data: await service.configuration(), requestId: res.locals.requestId }); },
    editSettings: async (req, res) => { res.json({ data: await service.updatePolicy(authenticatedUser(res), policyPatchSchema.parse(req.body)), requestId: res.locals.requestId }); },
    editCurrency: async (req, res) => { res.json({ data: await service.updateCurrency(authenticatedUser(res), currencyPatchSchema.parse(req.body).currency), requestId: res.locals.requestId }); },
    adminCities: async (_req, res) => { res.json({ data: await service.listCities(true), requestId: res.locals.requestId }); },
    addCity: async (req, res) => { res.status(201).json({ data: await service.createCity(authenticatedUser(res), citySchema.parse(req.body)), requestId: res.locals.requestId }); },
    editCity: async (req, res) => { res.json({ data: await service.updateCity(authenticatedUser(res), idSchema.parse(req.params.id), cityPatchSchema.parse(req.body).isActive), requestId: res.locals.requestId }); },
    deleteCity: async (req, res) => { await service.deleteCity(authenticatedUser(res), idSchema.parse(req.params.id)); res.status(204).end(); },
    adminServices: async (req, res) => { res.json({ data: await service.listServices(pageSchema.strict().parse(req.query), authenticatedUser(res)), requestId: res.locals.requestId }); },
    addService: async (req, res) => { res.status(201).json({ data: await service.createService(authenticatedUser(res), serviceSchema.parse(req.body)), requestId: res.locals.requestId }); },
    editService: async (req, res) => { res.json({ data: await service.updateService(authenticatedUser(res), idSchema.parse(req.params.id), servicePatchSchema.parse(req.body)), requestId: res.locals.requestId }); },
    adminExperts: async (req, res) => {
      const q = adminExpertsQuery.parse(req.query);
      res.json({ data: await service.adminExperts(authenticatedUser(res), { page: q.page, limit: q.limit }, q.approvalStatus), requestId: res.locals.requestId });
    },
    approve: async (req, res) => { res.json({ data: await service.setApproval(authenticatedUser(res), uuidSchema.parse(req.params.id), 'approved'), requestId: res.locals.requestId }); },
    suspend: async (req, res) => { res.json({ data: await service.setApproval(authenticatedUser(res), uuidSchema.parse(req.params.id), 'suspended'), requestId: res.locals.requestId }); },
    adminExpert: async (req, res) => { res.json({ data: await service.adminExpertDetail(authenticatedUser(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId }); },
  } satisfies Record<string, RequestHandler>;
}
