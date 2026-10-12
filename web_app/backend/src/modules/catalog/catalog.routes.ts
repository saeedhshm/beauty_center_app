import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { catalogControllers } from './catalog.controller.js';
import type { CatalogService } from './catalog.service.js';

export function catalogRoutes(service: CatalogService, auth: AuthService) {
  const router = Router();
  const c = catalogControllers(service);
  router.get('/configuration', c.configuration);
  router.get('/cities', c.cities);
  router.get('/services', c.services);
  router.get('/experts', c.experts);
  router.patch('/experts/me', authenticate(auth), authorize('expert'), c.editExpert);
  router.get('/experts/me/services', authenticate(auth), authorize('expert'), c.ownPrices);
  router.put('/experts/me/services/:serviceId', authenticate(auth), authorize('expert'), c.putPrice);
  router.get('/experts/:id', c.expert);
  router.use('/addresses', authenticate(auth), authorize('customer'));
  router.get('/addresses', c.addresses);
  router.post('/addresses', c.addAddress);
  router.get('/addresses/:id', c.address);
  router.patch('/addresses/:id', c.editAddress);
  router.delete('/addresses/:id', c.deleteAddress);
  router.use('/admin', authenticate(auth, 'admin'), authorize('admin'));
  router.get('/admin/settings', c.adminSettings);
  router.patch('/admin/settings', c.editSettings);
  router.patch('/admin/settings/currency', c.editCurrency);
  router.get('/admin/cities', c.adminCities);
  router.post('/admin/cities', c.addCity);
  router.patch('/admin/cities/:id', c.editCity);
  router.get('/admin/services', c.adminServices);
  router.post('/admin/services', c.addService);
  router.patch('/admin/services/:id', c.editService);
  router.get('/admin/experts', c.adminExperts);
  router.get('/admin/experts/:id', c.adminExpert);
  router.post('/admin/experts/:id/approve', c.approve);
  router.post('/admin/experts/:id/suspend', c.suspend);
  return router;
}
