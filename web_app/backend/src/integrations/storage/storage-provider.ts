export interface StoredObject {
  buffer: Buffer;
  contentType: string;
  size: number;
}

// Object storage behind the catalog media endpoints. Keys are opaque,
// namespaced paths (never user-controlled filenames); traversal outside the
// root is rejected by every implementation.
export interface StorageProvider {
  readonly name: string;
  put(key: string, input: { buffer: Buffer; contentType: string }): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9/_.~-]*$/;

export function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Rejected unsafe storage key: ${key}`);
  }
}
