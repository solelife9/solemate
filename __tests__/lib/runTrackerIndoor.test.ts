/**
 * 실내(트레드밀) 러닝 엔진 계약 — 2026-07-27 심사 B-13 근본 해결.
 *
 * 문제였던 것: 만보계 거리는 **GPS fix 가 한 번이라도 온 뒤 死구간을 메울 때만** 쓰였다
 * (`firstFixEmitted` 게이트). 실내는 fix 가 영영 오지 않으므로 거리가 0 에 멈췄고,
 * 그 km 가 신발 마모에도 안 잡혀 수명이 실제보다 길게 표시됐다.
 *
 * 실내 모드에서는 만보계가 **거리 정본**이다. GPS 를 켜지 않으므로 이중계산 위험도 없다.
 *
 * @format
 */
import {runTracker} from '../../lib/runTracker';

const SHOE = {id: 's1', name: 'Nike Pegasus'};

afterEach(() => {
  runTracker.stop();
});

describe('실내 모드 — 만보계가 거리 정본', () => {
  it('GPS fix 가 한 번도 없어도 거리가 쌓인다', () => {
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true});
    runTracker.feedPedometerDistance(0);      // 기준점
    runTracker.feedPedometerDistance(500);    // +500m
    runTracker.feedPedometerDistance(1200);   // +700m
    expect(runTracker.getDistanceKm()).toBeCloseTo(1.2, 3);
  });

  it('야외 모드에서는 fix 없이 거리가 쌓이지 않는다(기존 동작 보존)', () => {
    runTracker.start({goalKm: 0, shoe: SHOE});
    runTracker.feedPedometerDistance(0);
    runTracker.feedPedometerDistance(1200);
    expect(runTracker.getDistanceKm()).toBe(0);
  });

  it('센서가 리셋돼 누적이 줄면 기준만 다시 잡는다(점프 금지)', () => {
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true});
    runTracker.feedPedometerDistance(0);
    runTracker.feedPedometerDistance(800);
    runTracker.feedPedometerDistance(10); // 리셋
    runTracker.feedPedometerDistance(60); // 리셋 후 +50m
    expect(runTracker.getDistanceKm()).toBeCloseTo(0.85, 3);
  });

  it('일시정지 중에는 거리가 쌓이지 않는다', () => {
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true});
    runTracker.feedPedometerDistance(0);
    runTracker.feedPedometerDistance(300);
    runTracker.togglePause();
    runTracker.feedPedometerDistance(900); // 정지 중 이동 — 무시하되 기준은 흡수
    runTracker.togglePause();
    runTracker.feedPedometerDistance(1000); // 재개 후 +100m
    expect(runTracker.getDistanceKm()).toBeCloseTo(0.4, 3);
  });

  it('손상값(NaN·음수)은 무시한다', () => {
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true});
    runTracker.feedPedometerDistance(0);
    runTracker.feedPedometerDistance(NaN);
    runTracker.feedPedometerDistance(-5);
    runTracker.feedPedometerDistance(200);
    expect(runTracker.getDistanceKm()).toBeCloseTo(0.2, 3);
  });
});

describe('실내 모드 — GPS 개념이 사라진다', () => {
  it('死구간(stall)으로 판정하지 않는다', () => {
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true});
    // 야외라면 fix 가 없을 때 stall 로 잡히지만, 실내엔 GPS 자체가 없다.
    expect(runTracker.isStalled()).toBe(false);
  });

  it('경과 시간이 얼어붙지 않는다', () => {
    const t0 = 1_800_000_000_000;
    let now = t0;
    runTracker.setNow(() => now);
    runTracker.start({goalKm: 0, shoe: SHOE, indoor: true, t0});
    now = t0 + 65_000;
    // GPS 死구간 차감이 실내에 적용되면 시간이 0 근처로 깎인다 — 그러면 안 된다.
    expect(runTracker.getElapsed()).toBe(65);
    runTracker.setNow(() => Date.now());
  });
});
