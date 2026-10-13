import { expect, it } from 'vitest';
import { boundaryCoversPoint, type BoundaryGeometry } from '../../src/shared/geojson.js';

const polygon: BoundaryGeometry = {
  type: 'Polygon',
  coordinates: [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
  ],
};

it('covers polygon interiors and outer or hole edges but excludes holes and outside points', () => {
  expect(boundaryCoversPoint(polygon, 2, 2)).toBe(true);
  expect(boundaryCoversPoint(polygon, 5, 0)).toBe(true);
  expect(boundaryCoversPoint(polygon, 3, 5)).toBe(true);
  expect(boundaryCoversPoint(polygon, 5, 5)).toBe(false);
  expect(boundaryCoversPoint(polygon, 11, 5)).toBe(false);
});

it('covers a point in any MultiPolygon member', () => {
  const multi: BoundaryGeometry = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      [[[10, 10], [12, 10], [12, 12], [10, 10]]],
    ],
  };
  expect(boundaryCoversPoint(multi, 10.5, 11)).toBe(true);
  expect(boundaryCoversPoint(multi, 5, 5)).toBe(false);
});
