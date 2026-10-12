import { Router, type RequestHandler } from 'express';
import { authenticate, authorize } from '../../middleware/authenticate.js';
import type { AuthService } from '../auth/auth.service.js';
import { mediaControllers } from './media.controller.js';
import type { MediaService } from './media.service.js';

// Portfolio reads stay public for discoverable experts; the controller resolves
// an absent caller to an anonymous viewer instead of rejecting it.
function optionalAuth(auth: AuthService): RequestHandler {
  const required = authenticate(auth);
  return (req, res, next) => {
    if (!req.headers.authorization) return next();
    required(req, res, next);
  };
}

export function mediaRoutes(service: MediaService, auth: AuthService) {
  const router = Router();
  const c = mediaControllers(service);
  const uploadImage = service.singleFile('image');
  const uploadDocument = service.singleFile('document');
  router.post('/experts/me/portfolio', authenticate(auth), authorize('expert'), uploadImage, c.uploadPortfolio);
  router.delete('/experts/me/portfolio/:id', authenticate(auth), authorize('expert'), c.deletePortfolio);
  router.post('/experts/me/identity-document', authenticate(auth), authorize('expert'), uploadDocument, c.uploadIdentityDocument);
  router.get('/experts/me/identity-document/file', authenticate(auth), authorize('expert'), c.identityDocumentSelf);
  router.get('/experts/:id/portfolio', optionalAuth(auth), c.listPortfolio);
  router.get('/portfolio/:id/file', optionalAuth(auth), c.portfolioFile);
  return router;
}

export function adminMediaRoutes(service: MediaService, auth: AuthService) {
  const router = Router();
  const c = mediaControllers(service);
  router.use(authenticate(auth, 'admin'), authorize('admin'));
  router.get('/experts/:id/identity-document/file', c.identityDocumentFile);
  return router;
}
