// ─── Route projection — pure geometry for the SVG course map ──────────────────
// Turns a recorded GPS route ([{lat,lon}] stored under AsyncStorage `route_<id>`)
// into screen-space points that fit a fixed SVG viewbox, with NO native deps and
// NO I/O. The course map (HistoryScreen RunDetail) renders the projected points
// as a single react-native-svg <Polyline>.
//
// Projection model: equirectangular. Longitude degrees are scaled by
// cos(midLatitude) so a 0.001° east step covers the same screen distance as a
// 0.001° north step (longitude degrees shrink toward the poles). The route is
// then scaled UNIFORMLY to fit inside the padded box (aspect ratio preserved, so
// the path is never stretched) and centered. Latitude is flipped because SVG y
// grows downward while latitude grows northward.

export interface LatLon {
  lat: number;
  lon: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ProjectRouteOptions {
  /** Viewbox width in SVG units. */
  width: number;
  /** Viewbox height in SVG units. */
  height: number;
  /** Inner margin kept clear on every side (default 0). */
  padding?: number;
}

export interface ProjectedRoute {
  /** Projected points in SVG space, in original order. */
  points: ScreenPoint[];
  /** `points` formatted as an SVG `points="x,y x,y …"` attribute string. */
  svgPoints: string;
  /** Echoed viewbox the points were projected into. */
  width: number;
  height: number;
}

const EMPTY = (width: number, height: number): ProjectedRoute => ({
  points: [],
  svgPoints: '',
  width,
  height,
});

/**
 * Parse the JSON blob persisted at `route_<id>` into clean {lat,lon} fixes.
 * Never throws: a missing, empty, malformed, or non-array blob yields []. Each
 * point is kept only when both lat and lon are finite numbers (mirrors
 * runPersistence.sanitizePoints so the map and the engine agree on what a valid
 * fix is).
 */
export function parseRoute(raw: string | null | undefined): LatLon[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LatLon[] = [];
  for (const p of parsed) {
    const lat = p && typeof (p as any).lat === 'number' ? (p as any).lat : parseFloat(String((p as any)?.lat));
    const lon = p && typeof (p as any).lon === 'number' ? (p as any).lon : parseFloat(String((p as any)?.lon));
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({lat, lon});
  }
  return out;
}

/**
 * Project a GPS route into a fixed SVG viewbox.
 *
 * Returns an EMPTY result (no points, '' svgPoints) when there is nothing to
 * draw — fewer than 2 valid fixes, or a non-positive drawable area — so callers
 * can hide the map gracefully on `svgPoints === ''`.
 *
 * Properties guaranteed for a valid route:
 *  - every projected point lies within `[padding, width-padding] × [padding,
 *    height-padding]` (inclusive);
 *  - aspect ratio is preserved (uniform scale) so the path is never distorted;
 *  - the path is centered in the padded box;
 *  - latitude is flipped (north is up on screen).
 */
export function projectRoute(points: LatLon[], opts: ProjectRouteOptions): ProjectedRoute {
  const {width, height} = opts;
  const padding = opts.padding ?? 0;
  if (!Array.isArray(points) || points.length < 2) return EMPTY(width, height);

  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  if (innerW <= 0 || innerH <= 0) return EMPTY(width, height);

  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }
  if (!Number.isFinite(minLat) || !Number.isFinite(minLon)) return EMPTY(width, height);

  // Equirectangular: shrink longitude by cos(latitude) so east/west and
  // north/south degrees map to equal on-screen distance.
  const midLat = (minLat + maxLat) / 2;
  const lonScale = Math.max(Math.cos((midLat * Math.PI) / 180), 1e-6);
  const spanX = (maxLon - minLon) * lonScale;
  const spanY = maxLat - minLat;

  // Degenerate route (single point repeated / perfectly straight in one axis):
  // collapse the zero span so the other axis still fits, and center the result.
  let scale: number;
  if (spanX <= 0 && spanY <= 0) {
    scale = 0; // all fixes identical → draw a dot at center
  } else if (spanX <= 0) {
    scale = innerH / spanY;
  } else if (spanY <= 0) {
    scale = innerW / spanX;
  } else {
    scale = Math.min(innerW / spanX, innerH / spanY);
  }

  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const offsetX = padding + (innerW - drawnW) / 2;
  const offsetY = padding + (innerH - drawnH) / 2;

  const projected: ScreenPoint[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const x = offsetX + (p.lon - minLon) * lonScale * scale;
    // flip latitude: max latitude (north) maps to the top (small y).
    const y = offsetY + (maxLat - p.lat) * scale;
    projected.push({x, y});
  }
  if (projected.length < 2) return EMPTY(width, height);

  const round = (n: number) => Math.round(n * 100) / 100;
  const svgPoints = projected.map(p => `${round(p.x)},${round(p.y)}`).join(' ');
  return {points: projected, svgPoints, width, height};
}
