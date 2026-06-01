import {projectRoute, parseRoute, LatLon} from '../../lib/route';

// A small L-shaped route near Seoul used across the projection tests.
const SEOUL: LatLon[] = [
  {lat: 37.5665, lon: 126.978},
  {lat: 37.5675, lon: 126.978},
  {lat: 37.5675, lon: 126.979},
];

describe('parseRoute', () => {
  test('parses a well-formed [{lat,lon}] blob', () => {
    const raw = JSON.stringify([{lat: 37.5, lon: 126.9}, {lat: 37.6, lon: 127.0}]);
    expect(parseRoute(raw)).toEqual([{lat: 37.5, lon: 126.9}, {lat: 37.6, lon: 127.0}]);
  });

  test('empty / null / non-array / malformed JSON all degrade to []', () => {
    expect(parseRoute(null)).toEqual([]);
    expect(parseRoute(undefined)).toEqual([]);
    expect(parseRoute('')).toEqual([]);
    expect(parseRoute('not json')).toEqual([]);
    expect(parseRoute('{"lat":1,"lon":2}')).toEqual([]); // object, not array
  });

  test('drops fixes with non-finite lat/lon', () => {
    const raw = JSON.stringify([
      {lat: 37.5, lon: 126.9},
      {lat: 'x', lon: 126.9},
      {lat: null, lon: 1},
      {lat: 37.6, lon: 127.0},
    ]);
    expect(parseRoute(raw)).toEqual([{lat: 37.5, lon: 126.9}, {lat: 37.6, lon: 127.0}]);
  });
});

describe('projectRoute', () => {
  test('fewer than 2 valid points → empty (map hidden)', () => {
    expect(projectRoute([], {width: 100, height: 100}).svgPoints).toBe('');
    expect(projectRoute([{lat: 37.5, lon: 126.9}], {width: 100, height: 100}).svgPoints).toBe('');
  });

  test('non-positive drawable area → empty', () => {
    const r = projectRoute(SEOUL, {width: 10, height: 10, padding: 6});
    expect(r.svgPoints).toBe('');
    expect(r.points).toEqual([]);
  });

  test('produces one projected point per input fix', () => {
    const r = projectRoute(SEOUL, {width: 200, height: 200});
    expect(r.points).toHaveLength(SEOUL.length);
    expect(r.svgPoints.split(' ')).toHaveLength(SEOUL.length);
  });

  test('every projected point stays inside the padded viewbox', () => {
    const pad = 12;
    const r = projectRoute(SEOUL, {width: 240, height: 160, padding: pad});
    for (const p of r.points) {
      expect(p.x).toBeGreaterThanOrEqual(pad - 1e-6);
      expect(p.x).toBeLessThanOrEqual(240 - pad + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(pad - 1e-6);
      expect(p.y).toBeLessThanOrEqual(160 - pad + 1e-6);
    }
  });

  test('flips latitude so north is up (smaller y) on screen', () => {
    // two points differing only in latitude; the northern one must map higher.
    const pts: LatLon[] = [{lat: 37.56, lon: 126.97}, {lat: 37.58, lon: 126.97}];
    const r = projectRoute(pts, {width: 100, height: 100, padding: 10});
    const [south, north] = r.points;
    expect(north.y).toBeLessThan(south.y);
    // pure north-south line → both share the same x (centered).
    expect(north.x).toBeCloseTo(south.x, 6);
  });

  test('uniform scale preserves aspect ratio (square route stays square)', () => {
    // A 0.001° lat × 0.001° lon box. Because longitude is cos-corrected, the
    // on-screen box is wider in lat than lon, but BOTH axes use ONE scale, so the
    // drawn width/height ratio equals the (cos-corrected) geographic ratio — not
    // the viewbox ratio — confirming no stretching to fill.
    const box: LatLon[] = [
      {lat: 37.5, lon: 126.9},
      {lat: 37.501, lon: 126.9},
      {lat: 37.501, lon: 126.901},
      {lat: 37.5, lon: 126.901},
    ];
    const r = projectRoute(box, {width: 300, height: 100, padding: 0});
    const xs = r.points.map(p => p.x);
    const ys = r.points.map(p => p.y);
    const drawnW = Math.max(...xs) - Math.min(...xs);
    const drawnH = Math.max(...ys) - Math.min(...ys);
    const lonScale = Math.cos((37.5005 * Math.PI) / 180);
    // geographic aspect: (0.001 * lonScale) / 0.001 = lonScale
    expect(drawnW / drawnH).toBeCloseTo(lonScale, 3);
  });

  test('a straight east-west line projects without NaN and centers vertically', () => {
    const line: LatLon[] = [{lat: 37.5, lon: 126.9}, {lat: 37.5, lon: 126.91}];
    const r = projectRoute(line, {width: 200, height: 80, padding: 10});
    expect(r.points).toHaveLength(2);
    for (const p of r.points) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
      expect(p.y).toBeCloseTo(40, 6); // collapsed span → centered at mid-height
    }
    expect(r.svgPoints).not.toContain('NaN');
  });

  test('svgPoints is a space-separated "x,y" string in input order', () => {
    const r = projectRoute(SEOUL, {width: 100, height: 100, padding: 5});
    const pairs = r.svgPoints.split(' ');
    expect(pairs).toHaveLength(SEOUL.length);
    pairs.forEach((pair, i) => {
      const [x, y] = pair.split(',').map(Number);
      expect(x).toBeCloseTo(r.points[i].x, 2);
      expect(y).toBeCloseTo(r.points[i].y, 2);
    });
  });
});
