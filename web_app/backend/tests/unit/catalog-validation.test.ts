import { expect, it } from 'vitest';
import { addressPatchSchema, policyPatchSchema, servicePatchSchema } from '../../src/modules/catalog/catalog.validation.js';

it('does not apply create defaults to PATCH or accept empty updates', () => {
  expect(servicePatchSchema.parse({ name: 'New label' })).toEqual({ name: 'New label' });
  expect(addressPatchSchema.parse({ label: 'New label' })).toEqual({ label: 'New label' });
  expect(servicePatchSchema.safeParse({}).success).toBe(false);
  expect(addressPatchSchema.safeParse({}).success).toBe(false);
  expect(policyPatchSchema.safeParse({}).success).toBe(false);
});
