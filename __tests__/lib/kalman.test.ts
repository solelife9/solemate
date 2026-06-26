import {KalmanFilter} from '../../lib/kalman';

describe('KalmanFilter', () => {
  test('first fix passes through unchanged', () => {
    const kf = new KalmanFilter();
    const out = kf.process(37.5, 127.0, 10, 1000);
    expect(out).toEqual({lat: 37.5, lon: 127.0});
  });

  test('subsequent fix is smoothed between previous and new measurement', () => {
    const kf = new KalmanFilter();
    kf.process(37.5, 127.0, 10, 1000);
    const out = kf.process(37.6, 127.1, 10, 2000);
    // smoothed estimate lies strictly between the old and the new point
    expect(out.lat).toBeGreaterThan(37.5);
    expect(out.lat).toBeLessThan(37.6);
    expect(out.lon).toBeGreaterThan(127.0);
    expect(out.lon).toBeLessThan(127.1);
  });

  test('high measurement accuracy (low error) trusts the new point more', () => {
    const noisy = new KalmanFilter();
    noisy.process(0, 0, 50, 1000);
    const noisyOut = noisy.process(1, 0, 50, 2000); // large acc → distrust

    const precise = new KalmanFilter();
    precise.process(0, 0, 1, 1000);
    const preciseOut = precise.process(1, 0, 1, 2000); // small acc → trust

    expect(preciseOut.lat).toBeGreaterThan(noisyOut.lat);
  });

  // ── 2-D constant-velocity 동작 ──────────────────────────────────────────────
  const M = 111320; // 위도 1도 ≈ 111,320m
  const pathLenM = (pts: {lat: number; lon: number}[]) => {
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += Math.abs(pts[i].lat - pts[i - 1].lat) * M;
    return s;
  };

  test('정지 + 지터: 평활 트랙의 경로 길이가 원시보다 짧다(가짜 거리↓)', () => {
    const kf = new KalmanFilter();
    const lat0 = 37.5;
    const offsets = [0, 5, -4, 6, -5, 4, -6, 5, -3, 4]; // ±~5m 지터
    const raw = offsets.map(m => ({lat: lat0 + m / M, lon: 127.0}));
    const sm = offsets.map((m, i) => kf.process(lat0 + m / M, 127.0, 10, 1000 + i * 1000));
    expect(pathLenM(sm)).toBeLessThan(pathLenM(raw)); // 노이즈 흡수 → 더 짧음
  });

  test('등속 직선: speedMps 가 실제 속도(3 m/s)에 근접', () => {
    const kf = new KalmanFilter();
    const v = 3.0;
    for (let i = 0; i <= 12; i++) kf.process(37.5 + (v * i) / M, 127.0, 5, 1000 + i * 1000);
    expect(kf.speedMps()).not.toBeNull();
    expect(Math.abs((kf.speedMps() as number) - v)).toBeLessThan(1);
  });

  test('순간 이상치(시간 공백 없음)는 다운웨이트되어 출력이 스파이크에 덜 끌린다', () => {
    const kf = new KalmanFilter();
    for (let i = 0; i <= 6; i++) kf.process(37.5 + (3 * i) / M, 127.0, 5, 1000 + i * 1000);
    const cosLat = Math.cos((37.5 * Math.PI) / 180);
    const spikeLon = 127.0 + 80 / (M * cosLat); // ~80m 옆으로 튐
    const out = kf.process(37.5 + (3 * 7) / M, spikeLon, 5, 8000);
    const outOffsetM = (out.lon - 127.0) * M * cosLat;
    expect(outOffsetM).toBeLessThan(40); // 스파이크(80m)의 절반도 못 미침 = 다운웨이트
  });

  test('긴 공백(>8s) 후 fix 는 재측위(passthrough) — overshoot 없음', () => {
    const kf = new KalmanFilter();
    for (let i = 0; i <= 5; i++) kf.process(37.5 + (3 * i) / M, 127.0, 5, 1000 + i * 1000);
    const jumped = kf.process(37.55, 127.0, 5, 66000); // 60s 공백 후 점프
    expect(jumped.lat).toBeCloseTo(37.55, 6);
  });

  test('reset() makes the next fix pass through again', () => {
    const kf = new KalmanFilter();
    kf.process(10, 10, 5, 1000);
    kf.process(11, 11, 5, 2000);
    kf.reset();
    const out = kf.process(20, 20, 5, 3000);
    expect(out).toEqual({lat: 20, lon: 20});
  });
});
