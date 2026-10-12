import { expect, it } from 'vitest';
import { assertSafeKey } from '../../src/integrations/storage/storage-provider.js';
import { extensionFor } from '../../src/modules/catalog/media.validation.js';

it('accepts namespaced object keys with extensions', () => {
  expect(() => assertSafeKey('portfolio/11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png')).not.toThrow();
  expect(() => assertSafeKey('identity/11111111-2222-3333-4444-555555555555/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf')).not.toThrow();
});

it('rejects traversal and absolute keys', () => {
  for (const key of ['../secret', 'portfolio/../../etc/passwd', '/etc/passwd', '', 'a//b', 'a\\b']) {
    expect(() => assertSafeKey(key), key).toThrow();
  }
});

it('maps upload mimetypes to extensions and nothing else', () => {
  expect(extensionFor('image/png')).toBe('png');
  expect(extensionFor('image/jpeg')).toBe('jpg');
  expect(extensionFor('application/pdf')).toBe('pdf');
  expect(extensionFor('image/svg+xml')).toBeNull();
  expect(extensionFor('text/html')).toBeNull();
});
