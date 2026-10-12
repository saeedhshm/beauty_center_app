import type { RequestHandler, Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { StoredObject } from '../../integrations/storage/storage-provider.js';
import type { MediaService, UploadedFile } from './media.service.js';
import { portfolioUploadSchema, uuidSchema } from './media.validation.js';

function viewerOf(res: Response): AuthenticatedUser | null {
  return (res.locals.authenticatedUser as AuthenticatedUser | undefined) ?? null;
}

function requireViewer(res: Response): AuthenticatedUser {
  const viewer = viewerOf(res);
  if (!viewer) throw new Error('authenticated route reached without a user');
  return viewer;
}

function uploaded(req: unknown): UploadedFile | undefined {
  const file = (req as { file?: unknown }).file as { buffer?: unknown; mimetype?: unknown; size?: unknown } | undefined;
  if (!file || !(file.buffer instanceof Buffer) || typeof file.mimetype !== 'string' || typeof file.size !== 'number') return undefined;
  return { buffer: file.buffer, mimetype: file.mimetype, size: file.size };
}

function sendFile(res: Parameters<RequestHandler>[1], object: StoredObject) {
  res.setHeader('Content-Type', object.contentType);
  res.setHeader('Content-Length', object.size);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.send(object.buffer);
}

export function mediaControllers(service: MediaService) {
  return {
    uploadPortfolio: async (req, res) => {
      const input = portfolioUploadSchema.parse(req.body);
      const options = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as { serviceId?: number };
      const data = await service.uploadPortfolioImage(requireViewer(res), options, uploaded(req));
      res.status(201).json({ data, requestId: res.locals.requestId });
    },
    deletePortfolio: async (req, res) => {
      await service.deletePortfolioImage(requireViewer(res), uuidSchema.parse(req.params.id));
      res.status(204).end();
    },
    listPortfolio: async (req, res) => {
      res.json({ data: await service.listPortfolio(viewerOf(res), uuidSchema.parse(req.params.id)), requestId: res.locals.requestId });
    },
    portfolioFile: async (req, res) => {
      sendFile(res, await service.portfolioFile(viewerOf(res), uuidSchema.parse(req.params.id)));
    },
    uploadIdentityDocument: async (req, res) => {
      res.json({ data: await service.uploadIdentityDocument(requireViewer(res), uploaded(req)), requestId: res.locals.requestId });
    },
    identityDocumentSelf: async (_req, res) => {
      const viewer = requireViewer(res);
      sendFile(res, await service.identityDocumentFile(viewer, viewer.id));
    },
    identityDocumentFile: async (req, res) => {
      sendFile(res, await service.identityDocumentFile(requireViewer(res), uuidSchema.parse(req.params.id)));
    },
  } satisfies Record<string, RequestHandler>;
}
