import {DistanceSmoother} from '../../lib/distanceSmoother';
import {calcDist} from '../../lib/geo';

// 로컬 미터 → 위경도(위도 방향만 쓰면 1m ≈ 1/111320°).
const LAT0 = 37.5;
const LON0 = 127.0;
const M = 111320;
const pt = (northM: number, eastM: number = 0) => ({
  lat: LAT0 + northM / M,
  lon: LON0 + eastM / (M * Math.cos((LAT0 * Math.PI) / 180)),
});

const rawKm = (pts: {lat: number; lon: number}[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += calcDist(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }
  return s;
};

describe('DistanceSmoother', () => {
  test('W=1 은 평활 없음 — 원 폴리라인 거리와 동일', () => {
    const s = new DistanceSmoother(1);
    const pts = [pt(0), pt(3), pt(7), pt(12)];
    pts.forEach(p => s.push(p));
    expect(s.distKm()).toBeCloseTo(rawKm(pts), 12);
  });

  test('직선 경로는 평활해도 거리가 보존된다(공선 평균은 선 위)', () => {
    const s = new DistanceSmoother(5);
    const pts = Array.from({length: 30}, (_, i) => pt(i * 3));
    pts.forEach(p => s.push(p));
    s.flush();
    expect(s.distKm()).toBeCloseTo(rawKm(pts), 6);
  });

  test('직선 + 좌우 지터: 평활 거리가 원 거리보다 짧고 참(직선)에 가깝다', () => {
    const s = new DistanceSmoother(5);
    // 3m/스텝 전진 + ±2m 좌우 톱니(전형적 GPS 지터의 거리 부풀림 패턴).
    const pts = Array.from({length: 40}, (_, i) => pt(i * 3, i % 2 === 0 ? 2 : -2));
    pts.forEach(p => s.push(p));
    s.flush();
    const truth = (39 * 3) / 1000;
    expect(s.distKm()).toBeLessThan(rawKm(pts)); // 지터 소거
    expect(Math.abs(s.distKm() - truth) / truth).toBeLessThan(0.05); // 참 ±5% (원거리는 +66%)
  });

  test('무손실: 짧은 구간(2점·3점)도 끝점이 원좌표라 거리가 붕괴하지 않는다', () => {
    const s2 = new DistanceSmoother(5);
    s2.push(pt(0));
    s2.push(pt(10));
    s2.flush();
    expect(s2.distKm()).toBeCloseTo(10 / 1000, 4); // n=2 → 원거리 전부(±5cm, 도→미터 환산 오차)

    const s3 = new DistanceSmoother(5);
    [pt(0), pt(5), pt(10)].forEach(p => s3.push(p));
    s3.flush();
    expect(s3.distKm()).toBeCloseTo(10 / 1000, 4); // 직선 3점 → 참거리 보존
  });

  test('flush 는 구간을 끊는다 — 구간 사이 공백을 가로지르는 거리 미계상', () => {
    const s = new DistanceSmoother(5);
    [pt(0), pt(3), pt(6)].forEach(p => s.push(p));
    s.flush();
    const before = s.distKm();
    // 1km 떨어진 곳에서 새 구간 — 공백 1km 는 더해지면 안 된다.
    [pt(1000), pt(1003), pt(1006)].forEach(p => s.push(p));
    s.flush();
    expect(s.distKm() - before).toBeCloseTo(6 / 1000, 4);
  });

  test('distKm 은 단조 증가(중간 판독이 뒤로 가지 않는다)', () => {
    const s = new DistanceSmoother(5);
    let prev = 0;
    for (let i = 0; i < 25; i++) {
      s.push(pt(i * 3, i % 2 === 0 ? 2 : -2));
      expect(s.distKm()).toBeGreaterThanOrEqual(prev);
      prev = s.distKm();
    }
    s.flush();
    expect(s.distKm()).toBeGreaterThanOrEqual(prev);
  });

  test('빈 구간 flush 는 no-op', () => {
    const s = new DistanceSmoother(5);
    s.flush();
    expect(s.distKm()).toBe(0);
    s.push(pt(0));
    s.flush();
    s.flush();
    expect(s.distKm()).toBe(0); // 1점 구간 = 이동 없음
  });
});
