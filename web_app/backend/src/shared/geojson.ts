export type Position = [number, number];
export type PolygonGeometry = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type BoundaryGeometry = PolygonGeometry | MultiPolygonGeometry;
export type BoundaryBounds = { south: string; west: string; north: string; east: string };

const EPSILON = 1e-12;

function onSegment(point: Position, start: Position, end: Position): boolean {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > EPSILON) return false;
  return x >= Math.min(x1, x2) - EPSILON && x <= Math.max(x1, x2) + EPSILON
    && y >= Math.min(y1, y2) - EPSILON && y <= Math.max(y1, y2) + EPSILON;
}

function classifyRing(point: Position, ring: Position[]): 'outside' | 'inside' | 'boundary' {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = ring[i]!;
    const previous = ring[j]!;
    if (onSegment(point, previous, current)) return 'boundary';
    const crosses = (current[1] > point[1]) !== (previous[1] > point[1]);
    if (crosses) {
      const intersectionX = ((previous[0] - current[0]) * (point[1] - current[1]))
        / (previous[1] - current[1]) + current[0];
      if (point[0] < intersectionX) inside = !inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

function polygonCoversPoint(polygon: Position[][], point: Position): boolean {
  const outer = classifyRing(point, polygon[0]!);
  if (outer === 'outside') return false;
  if (outer === 'boundary') return true;
  for (const hole of polygon.slice(1)) {
    const result = classifyRing(point, hole);
    if (result === 'boundary') return true;
    if (result === 'inside') return false;
  }
  return true;
}

/** GeoJSON uses [longitude, latitude]. Polygon and hole edges are covered. */
export function boundaryCoversPoint(geometry: BoundaryGeometry, lat: number, lng: number): boolean {
  const point: Position = [lng, lat];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => polygonCoversPoint(polygon, point));
}
