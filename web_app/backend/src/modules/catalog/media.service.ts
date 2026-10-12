import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/app-error.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { StorageProvider } from '../../integrations/storage/storage-provider.js';
import { CatalogRepository } from './catalog.repository.js';
import { DOCUMENT_MIME_TYPES, IMAGE_MIME_TYPES, MAX_PORTFOLIO_IMAGES, extensionFor } from './media.validation.js';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const fileUrl = (id: string) => `/api/v1/portfolio/${id}/file`;

export class MediaService {
  private readonly upload;
  constructor(
    private readonly repo: CatalogRepository,
    private readonly storage: StorageProvider,
    private readonly opts: { maxFileBytes: number },
  ) {
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: opts.maxFileBytes, files: 1, fields: 5 },
    });
  }

  singleFile(field: string) {
    const middleware = this.upload.single(field);
    return (req: Request, _res: Response, next: NextFunction) => {
      middleware(req, _res, (error: unknown) => {
        if (!error) { next(); return; }
        if (error instanceof multer.MulterError) {
          if (error.code === 'LIMIT_FILE_SIZE') {
            next(new AppError(413, 'FILE_TOO_LARGE', 'حجم الملف يتجاوز الحد المسموح'));
            return;
          }
          next(new AppError(400, 'INVALID_UPLOAD', 'تعذر قراءة الملف المرفوع'));
          return;
        }
        next(error);
      });
    };
  }

  private requireFile(file: UploadedFile | undefined): UploadedFile {
    if (!file || file.buffer.length === 0) throw new AppError(400, 'FILE_REQUIRED', 'أرفقي ملفًا واحدًا');
    return file;
  }

  private async requireExpert(repo: CatalogRepository, actor: AuthenticatedUser) {
    if (actor.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
    const user = await repo.lockUser(actor.id);
    if (!user?.isActive || user.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
  }

  async uploadPortfolioImage(actor: AuthenticatedUser, input: { serviceId?: number }, raw: UploadedFile | undefined) {
    const file = this.requireFile(raw);
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'صيغ الصور المسموحة: JPEG وPNG وWebP');
    }
    const ext = extensionFor(file.mimetype)!;
    return this.repo.transaction(async (repo) => {
      await this.requireExpert(repo, actor);
      if (input.serviceId !== undefined && !await repo.expertOfferActive(actor.id, input.serviceId)) {
        throw new AppError(404, 'NOT_FOUND', 'الخدمة غير مرتبطة بحسابك');
      }
      if (await repo.portfolioCount(actor.id) >= MAX_PORTFOLIO_IMAGES) {
        throw new AppError(409, 'MEDIA_LIMIT_REACHED', 'بلغتِ الحد الأقصى لصور المعرض');
      }
      const key = `portfolio/${actor.id}/${randomUUID()}.${ext}`;
      await this.storage.put(key, { buffer: file.buffer, contentType: file.mimetype });
      try {
        const row = await repo.addPortfolioImage({ expertId: actor.id, serviceId: input.serviceId ?? null, storageKey: key });
        return { id: row.id, serviceId: row.serviceId, sortOrder: row.sortOrder, url: fileUrl(row.id) };
      } catch (error) {
        await this.storage.delete(key).catch(() => {});
        throw error;
      }
    });
  }

  async deletePortfolioImage(actor: AuthenticatedUser, id: string) {
    const removed = await this.repo.transaction(async (repo) => {
      await this.requireExpert(repo, actor);
      const row = await repo.portfolioImage(id);
      if (!row || row.expertId !== actor.id) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
      await repo.deletePortfolioImage(id);
      return row.storageKey;
    });
    await this.storage.delete(removed).catch(() => {});
  }

  private async portfolioVisible(viewer: AuthenticatedUser | null, expertId: string) {
    if (viewer && (viewer.role === 'admin' || viewer.id === expertId)) return true;
    return (await this.repo.publicExpert(expertId)) !== undefined;
  }

  async listPortfolio(viewer: AuthenticatedUser | null, expertId: string) {
    if (!await this.portfolioVisible(viewer, expertId)) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    return (await this.repo.portfolioOf(expertId)).map((row) => ({ id: row.id, serviceId: row.serviceId, sortOrder: row.sortOrder, url: fileUrl(row.id) }));
  }

  async portfolioFile(viewer: AuthenticatedUser | null, id: string) {
    const row = await this.repo.portfolioImage(id);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    if (!await this.portfolioVisible(viewer, row.expertId)) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    const object = await this.storage.get(row.storageKey);
    if (!object) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    return object;
  }

  async uploadIdentityDocument(actor: AuthenticatedUser, raw: UploadedFile | undefined) {
    const file = this.requireFile(raw);
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      throw new AppError(415, 'UNSUPPORTED_FILE_TYPE', 'الصيغ المسموحة لوثيقة الهوية: JPEG وPNG وWebP وPDF');
    }
    const ext = extensionFor(file.mimetype)!;
    const key = `identity/${actor.id}/${randomUUID()}.${ext}`;
    const previous = await this.repo.transaction(async (repo) => {
      await this.requireExpert(repo, actor);
      await this.storage.put(key, { buffer: file.buffer, contentType: file.mimetype });
      try {
        const old = await repo.identityDocumentKey(actor.id);
        await repo.setIdentityDocumentKey(actor.id, key);
        return old;
      } catch (error) {
        await this.storage.delete(key).catch(() => {});
        throw error;
      }
    });
    if (previous) await this.storage.delete(previous).catch(() => {});
    return { updated: true };
  }

  async identityDocumentFile(actor: AuthenticatedUser, expertId: string) {
    if (actor.role !== 'admin' && actor.id !== expertId) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    if (actor.role === 'expert' && actor.id === expertId) {
      const user = await this.repo.lockUser(actor.id);
      if (!user?.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
    }
    const key = await this.repo.identityDocumentKey(expertId);
    if (!key) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    const object = await this.storage.get(key);
    if (!object) throw new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');
    return object;
  }
}
