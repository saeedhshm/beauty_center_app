import { z } from 'zod';

// Multipart bodies are parsed by multer before these run; only the text fields
// and path params are validated here.
export const uuidSchema = z.uuid();
export const idSchema = z.coerce.number().int().min(1).max(32767);

export const portfolioUploadSchema = z.object({
  serviceId: idSchema.optional(),
}).strict();

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_MIME_TYPES = [...IMAGE_MIME_TYPES, 'application/pdf'] as const;
export const MAX_PORTFOLIO_IMAGES = 20;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function extensionFor(mimetype: string): string | null {
  return EXTENSIONS[mimetype] ?? null;
}
