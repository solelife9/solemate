import {buildSplits} from '../../lib/splits';
import type {LatLon} from '../../lib/route';

// 적도(lat=0) 위 경도 이동으로 알려진 거리의 점열을 만든다(haversine 가법적).
const R = 6371;
const lonForKm = (km: number) => (km / R) * (180 / Math.PI);

// startLon 에서 regionKm 만큼을 count 개 점으로 균등 분할해 잇는다.
function appendRegion(pts: LatLon[], startLon: number, regionKm: number, count: number): number {
  const span = lonForKm(regionKm);
  for (let j = 1; j <= count; j++) pts.push({lat: 0, lon: startLon + span * (j / count)});
  return startLon + span;
}

describe('buildSplits', () => {
  test('경로가 2점 미만이면 빈 배열', () => {
    expect(buildSplits([], 5, 1500)).toEqual([]);
    expect(buildSplits([{lat: 0, lon: 0}], 5, 1500)).toEqual([]);
  });

  test('소요 시간이 0/음수면 빈 배열', () => {
    const pts: LatLon[] = [{lat: 0, lon: 0}];
    appendRegion(pts, 0, 3, 300);
    expect(buildSplits(pts, 3, 0)).toEqual([]);
    expect(buildSplits(pts, 3, -10)).toEqual([]);
  });

  test('균등 3km/900초 → km 1·2·3, 각 구간 ~300초(5분/km)·고도 0', () => {
    const pts: LatLon[] = [{lat: 0, lon: 0}];
    appendRegion(pts, 0, 3, 300); // 301점, 300세그먼트
    const splits = buildSplits(pts, 3, 900);
    expect(splits.length).toBe(3);
    expect(splits.map(s => s.km)).toEqual([1, 2, 3]);
    for (const s of splits) {
      expect(s.elevM).toBe(0);
      expect(s.paceSec).toBeGreaterThanOrEqual(290);
      expect(s.paceSec).toBeLessThanOrEqual(310);
    }
  });

  test('점밀도가 높은(천천히 달린) 구간이 더 느린 페이스로 잡힌다', () => {
    // km1: 200점으로 1km(조밀=느림), km2: 50점으로 1km(성김=빠름).
    const pts: LatLon[] = [{lat: 0, lon: 0}];
    let lon = appendRegion(pts, 0, 1, 200);
    appendRegion(pts, lon, 1, 50);
    const splits = buildSplits(pts, 2, 600);
    expect(splits.length).toBe(2);
    expect(splits[0].paceSec).toBeGreaterThan(splits[1].paceSec);
  });

  test('0.5km 미만 자투리는 버린다', () => {
    // 1.4km → 1개 구간(1.0)만, 0.4 자투리 폐기.
    const pts: LatLon[] = [{lat: 0, lon: 0}];
    appendRegion(pts, 0, 1.4, 140);
    const splits = buildSplits(pts, 1.4, 420);
    expect(splits.length).toBe(1);
    expect(splits[0].km).toBe(1);
  });
});
