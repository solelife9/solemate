// 트랙/랩 순수 엔진 검증 — 거리 스냅·자동랩 감지·랩→시계열.
import {
  snapLapDistance,
  detectAutoLaps,
  lapsToTrack,
  lapDistanceKm,
  haversineM,
  type GeoPoint,
} from '../../lib/laps';
import {bestEffortSec} from '../../lib/bestEfforts';

describe('snapLapDistance — 표준 스냅', () => {
  test('400 트랙: GPS 오차 흡수(401·388·412 → 400)', () => {
    expect(snapLapDistance(401).meters).toBe(400);
    expect(snapLapDistance(388).meters).toBe(400);
    expect(snapLapDistance(412).meters).toBe(400);
    expect(snapLapDistance(401).snapped).toBe(true);
  });
  test('200 실내·300 트랙 스냅', () => {
    expect(snapLapDistance(205).meters).toBe(200);
    expect(snapLapDistance(291).meters).toBe(300);
  });
  test('표준에서 먼 값은 측정값(커스텀)', () => {
    const s = snapLapDistance(250);
    expect(s.meters).toBe(250);
    expect(s.snapped).toBe(false);
  });
  test('비정상 입력은 400 안전 폴백', () => {
    expect(snapLapDistance(0).meters).toBe(400);
    expect(snapLapDistance(NaN).meters).toBe(400);
  });
});

describe('haversineM', () => {
  test('같은 점 0, 위도 0.001°≈111m', () => {
    expect(haversineM(37.5, 127, 37.5, 127)).toBeCloseTo(0, 3);
    expect(haversineM(37.5, 127, 37.501, 127)).toBeGreaterThan(100);
    expect(haversineM(37.5, 127, 37.501, 127)).toBeLessThan(120);
  });
});

describe('detectAutoLaps — 출발점 복귀 감지', () => {
  // 출발점 근처(반경 안)에서 멀어졌다가(반경 밖) 돌아오는 걸 1랩으로. 3바퀴 트랙 합성.
  function loop(nLaps: number): GeoPoint[] {
    const pts: GeoPoint[] = [];
    let t = 0;
    const start = {lat: 37.5000, lon: 127.0000};
    for (let lap = 0; lap < nLaps; lap++) {
      // 출발점(반경 안)
      pts.push({lat: start.lat, lon: start.lon, t: t++});
      // 반대편(약 100m 밖) — 위도 +0.0009 ≈ 100m
      pts.push({lat: start.lat + 0.0009, lon: start.lon, t: t++});
      pts.push({lat: start.lat + 0.0004, lon: start.lon, t: t++});
      // 복귀(반경 안)
      pts.push({lat: start.lat + 0.00002, lon: start.lon, t: t++}); // ≈2m
    }
    return pts;
  }

  test('3바퀴 → 3랩', () => {
    expect(detectAutoLaps(loop(3), 12).length).toBe(3);
  });
  test('출발 반경 안에서 떠는 노이즈는 랩 아님', () => {
    const start = {lat: 37.5, lon: 127};
    const jitter: GeoPoint[] = [
      {lat: start.lat, lon: start.lon, t: 0},
      {lat: start.lat + 0.00005, lon: start.lon, t: 1}, // ≈5m, 반경 안
      {lat: start.lat, lon: start.lon, t: 2},
      {lat: start.lat + 0.00003, lon: start.lon, t: 3},
    ];
    expect(detectAutoLaps(jitter, 12).length).toBe(0);
  });
  test('점 부족·빈 입력 방어', () => {
    expect(detectAutoLaps([], 12)).toEqual([]);
    expect(detectAutoLaps([{lat: 37.5, lon: 127, t: 0}], 12)).toEqual([]);
  });
});

describe('lapsToTrack + lapDistanceKm — 시계열/거리', () => {
  test('랩 시각 → (d,t), 시작점 포함', () => {
    const tr = lapsToTrack([90, 185, 280], 0.4); // 400m 랩, 랩당 ~90초
    expect(tr).toEqual([
      {d: 0, t: 0},
      {d: 0.4, t: 90},
      {d: 0.8, t: 185},
      {d: 1.2, t: 280},
    ]);
  });
  test('시간 비단조 방어(뒤로 가는 값 스킵)', () => {
    const tr = lapsToTrack([90, 80, 200], 0.4);
    // 80<90 스킵 → 인덱스는 이어지지만 d 는 랩 순번 기반이라 두 유효점만.
    expect(tr.map(p => p.t)).toEqual([0, 90, 200]);
  });
  test('총 거리 = 랩수 × 랩거리', () => {
    expect(lapDistanceKm(10, 0.4)).toBeCloseTo(4, 6); // 400m×10 = 4km
    expect(lapDistanceKm(0, 0.4)).toBe(0);
  });
});

describe('통합 — 랩 시계열이 bestEfforts 엔진에 그대로 먹힌다', () => {
  test('트랙 세션 랩 → 1km/5K 베스트에포트', () => {
    // 400m 랩 × 15바퀴 = 6km. 랩당 100초(=250s/km 일정).
    const lapTimes: number[] = [];
    for (let i = 1; i <= 15; i++) lapTimes.push(i * 100);
    const track = lapsToTrack(lapTimes, 0.4);
    // 1km = 2.5랩 = 250초.
    expect(bestEffortSec(track, 1)).toBeCloseTo(250, 0);
    // 5K = 12.5랩 = 1250초.
    expect(bestEffortSec(track, 5)).toBeCloseTo(1250, 0);
  });
});
