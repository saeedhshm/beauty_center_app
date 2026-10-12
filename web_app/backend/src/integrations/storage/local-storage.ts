import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertSafeKey, type StorageProvider, type StoredObject } from './storage-provider.js';

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function extensionOf(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot >= 0 ? key.slice(dot).toLowerCase() : '';
}

// Local-disk adapter for development and demo. Production object storage
// (S3-compatible or similar) plugs in behind StorageProvider without touching
// the catalog media endpoints.
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  constructor(private readonly rootDir: string) {}

  private pathFor(key: string): string {
    assertSafeKey(key);
    return join(this.rootDir, ...key.split('/'));
  }

  async put(key: string, input: { buffer: Buffer; contentType: string }): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.buffer);
  }

  async get(key: string): Promise<StoredObject | null> {
    const path = this.pathFor(key);
    try {
      const [buffer, info] = await Promise.all([readFile(path), stat(path)]);
      const contentType = CONTENT_TYPES[extensionOf(key)] ?? 'application/octet-stream';
      return { buffer, contentType, size: info.size };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await rm(this.pathFor(key), { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
