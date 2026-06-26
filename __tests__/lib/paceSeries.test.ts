/**
 * lib/splits.buildPaceSeries — (거리,경과시간) 시계열 → 고운 페이스 시계열.
 * @format
 */
import {buildPaceSeries, PaceTrackPoint} from '../../lib/splits';

describe('buildPaceSeries', () => {
  test('표본 2점 미만이면 []', () => {
    expect(buildPaceSeries([])).toEqual([]);
    expect(buildPaceSeries([{d: 0, t: 0}])).toEqual([]);
  });

  test('일정 페이스(6분/km=360초/km) 트랙 → 모든 bin 페이스 ≈ 360', () => {
    // 0~1km 를 0.05km 간격, 매 0.05km 당 18초(=360s/km).
    const track: PaceTrackPoint[] = [];
    for (let i = 0; i <= 20; i++) track.push({d: i * 0.05, t: i * 18});
    const series = buildPaceSeries(track, 0.1);
    expect(series.length).toBeGreaterThanOrEqual(9); // ~10개(0.1~1.0km)
    for (const p of series) expect(Math.abs(p.paceSec - 360)).toBeLessThanOrEqual(1);
    // km 라벨이 0.1 간격으로 증가
    expect(series[0].km).toBeCloseTo(0.1, 5);
  });

  test('가속(페이스가 빨라짐) 트랙은 뒤 bin 페이스가 더 작다(빠름)', () => {
    // 앞 0.5km 는 400s/km, 뒤 0.5km 는 300s/km.
    const track: PaceTrackPoint[] = [{d: 0, t: 0}];
    let t = 0;
    for (let i = 1; i <= 10; i++) { t += 0.05 * 400; track.push({d: i * 0.05, t}); }      // 0.5km @400
    for (let i = 11; i <= 20; i++) { t += 0.05 * 300; track.push({d: i * 0.05, t}); }      // 0.5km @300
    const series = buildPaceSeries(track, 0.1);
    expect(series[0].paceSec).toBeGreaterThan(series[series.length - 1].paceSec);
  });

  test('거리 역행/정체 구간이 섞여도 깨지지 않는다', () => {
    const track: PaceTrackPoint[] = [
      {d: 0, t: 0}, {d: 0.1, t: 36}, {d: 0.1, t: 40}, {d: 0.05, t: 45}, {d: 0.3, t: 110},
    ];
    const series = buildPaceSeries(track, 0.1);
    expect(Array.isArray(series)).toBe(true);
    for (const p of series) expect(Number.isFinite(p.paceSec)).toBe(true);
  });
});
