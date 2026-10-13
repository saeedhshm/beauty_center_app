import { expect, it } from 'vitest';
import { addressPatchSchema, addressSchema, cityBoundarySchema, expertsQuery, policyPatchSchema, servicePatchSchema } from '../../src/modules/catalog/catalog.validation.js';

it('does not apply create defaults to PATCH or accept empty updates', () => {
  expect(servicePatchSchema.parse({ name: 'New label' })).toEqual({ name: 'New label' });
  expect(addressPatchSchema.parse({ label: 'New label' })).toEqual({ label: 'New label' });
  expect(servicePatchSchema.safeParse({}).success).toBe(false);
  expect(addressPatchSchema.safeParse({}).success).toBe(false);
  expect(policyPatchSchema.safeParse({}).success).toBe(false);
});

it('requires coordinates for new addresses and a service for price sorting', () => {
  expect(addressSchema.safeParse({ label: 'Home', addressText: 'Cairo address', cityId: 1 }).success).toBe(false);
  expect(addressSchema.safeParse({ label: 'Home', addressText: 'Cairo address', cityId: 1, lat: '30.0', lng: '31.2' }).success).toBe(true);
  expect(addressPatchSchema.safeParse({ label: 'Historical label' }).success).toBe(true);
  expect(addressPatchSchema.safeParse({ lat: null, lng: null }).success).toBe(false);
  expect(expertsQuery.parse({})).toMatchObject({ sort: 'name_asc' });
  expect(expertsQuery.safeParse({ sort: 'price_asc' }).success).toBe(false);
  expect(expertsQuery.safeParse({ sort: 'price_desc', serviceId: '1' }).success).toBe(true);
  expect(expertsQuery.safeParse({ sort: 'created_desc' }).success).toBe(false);
});

it('validates strict, closed and bounded Polygon/MultiPolygon input', () => {
  const valid = {
    geometry: { type: 'Polygon', coordinates: [[[31, 30], [32, 30], [32, 31], [31, 30]]] },
    bounds: { south: '30', west: '31', north: '31', east: '32' },
    sourceRef: 'relation/test',
  };
  expect(cityBoundarySchema.safeParse(valid).success).toBe(true);
  expect(cityBoundarySchema.safeParse({ ...valid, geometry: { ...valid.geometry, extra: true } }).success).toBe(false);
  expect(cityBoundarySchema.safeParse({ ...valid, geometry: { type: 'Polygon', coordinates: [[[31, 30], [32, 30], [32, 31], [31, 31]]] } }).success).toBe(false);
  expect(cityBoundarySchema.safeParse({ ...valid, bounds: { south: '31', west: '31', north: '30', east: '32' } }).success).toBe(false);
  expect(cityBoundarySchema.safeParse({ ...valid, bounds: { south: '30', west: '31.1', north: '31', east: '32' } }).success).toBe(false);
  const tooComplex = Array.from({ length: 10_001 }, () => [31, 30] as [number, number]);
  expect(cityBoundarySchema.safeParse({ ...valid, geometry: { type: 'Polygon', coordinates: [tooComplex] } }).success).toBe(false);
});
