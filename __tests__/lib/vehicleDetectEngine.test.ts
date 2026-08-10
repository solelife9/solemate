// 차량 감지 — **엔진을 통과하는 실제 동작**으로 검증한다.
//
// 왜 이 파일이 따로 있나 (2026-08-10)
// ----------------------------------------------------------------------------
// `__tests__/lib/vehicleDetect.test.ts` 는 순수 함수를, `__tests__/vehicleWiring.test.ts`
// 는 배선(import·호출 순서)을 본다. 둘 다 초록이면서도 **런타임에는 한 줄도 안 도는**
// 상태가 실제로 존재했다 — 그게 이 기능이 세 달 가까이 잠들어 있던 방식이다.
//
// 그래서 여기서는 `runTracker` 에 좌표를 먹여 **누적이 실제로 쌓이는지**를 본다.
// 소스를 읽지 않고, 함수를 직접 부르지도 않는다.
//
// 재현하는 상황(2026-08-07 사고): 차를 타고 가며 앱을 켜 뒀다.
//   · 걸음 표본은 온다(폰이 주머니에 있고 센서는 살아 있다) — 그런데 **늘지 않는다.**
//   · 걸음 정지 게이트가 **일부러 풀린다**(칼만 속도 ≥ STEP_GATE_MAX_SPEED_MPS=2.5 —
//     걸음 센서가 동결된 진짜 러너의 거리를 죽이지 않으려는 안전선). 그 구멍이 사고 경로다.
//
// ⚠️ **시내 주행 속도로 재현한다(8 m/s ≈ 29km/h).** 처음엔 고속(13.9 m/s)으로 짰는데
// 거리가 0 이었다 — `MAX_SEG_SPEED_MPS = 12` 가 그 세그먼트를 통째로 거부하기 때문이다.
// 즉 **고속 주행은 더 앞단 GPS 필터가 이미 막고 있고**, 차량 감지가 실제로 담당하는
// 구간은 사람 속도와 겹치는 시내 주행이다(그래서 VEHICLE_SLOW_SPEED_MPS=3.0 이 있다).
// 이 사실을 모르고 짠 테스트는 '통과하지만 아무것도 증명하지 않는' 테스트가 된다.
import {runTracker} from '../../lib/runTracker';
import {vehicleVerdict, VEHICLE_SUSTAIN_FAST_MS} from '../../lib/vehicleDetect';

const SHOE = {id: 's1', name: 'Nike Pegasus'};
const LON = 127.0;

/** 시내 주행 속도(m/s ≈ 29km/h). MAX_SEG_SPEED_MPS(12) 아래 · VEHICLE_SPEED_MPS(6.5) 위. */
const CITY_MPS = 8;

/** 위도 1도 ≈ 111.32km. 원하는 미터만큼 북쪽으로 민다. */
const latAfter = (m: number) => 37.5 + m / 111_320;

const fix = (lat: number, tMs: number) => ({
  coords: {latitude: lat, longitude: LON, accuracy: 5, speed: null},
  timestamp: tMs,
});

/**
 * 차량 주행을 먹인다. 시계(now)와 fix 시각을 함께 전진시키고, 걸음 표본은 **매 초 같은
 * 값**으로 먹인다 — "표본은 신선한데 걸음이 안 는다" = 사람이 아니다.
 */
function driveFor(seconds: number, speedMps: number, startMs: number) {
  let t = startMs;
  let dist = 0;
  for (let i = 0; i < seconds; i++) {
    t += 1000;
    dist += speedMps;
    runTracker.setNow(() => t);
    runTracker.feedSteps(1000, t); // 누적 그대로 = 증가 없음
    runTracker.ingestFix(fix(latAfter(dist), t));
  }
  return t;
}

describe('차 안에서 켜 둔 앱', () => {
  afterEach(() => {
    runTracker.stop();
  });

  it('의심 거리가 실제로 쌓인다 — 순수 함수가 아니라 엔진을 통과해서', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    // 시내 주행 속도로 충분히 오래 — 빠른 속도 확정 임계(20초)를 넉넉히 넘긴다.
    driveFor(Math.ceil(VEHICLE_SUSTAIN_FAST_MS / 1000) + 90, CITY_MPS, t0);

    const st = runTracker.getVehicleState();
    expect(st.flaggedKm).toBeGreaterThan(0);
  });

  it('저장 시점에 사용자에게 묻는다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    driveFor(Math.ceil(VEHICLE_SUSTAIN_FAST_MS / 1000) + 90, CITY_MPS, t0);

    const km = runTracker.getDistanceKm();
    expect(vehicleVerdict(runTracker.getVehicleState(), km).ask).toBe(true);
  });

  it('거리를 조용히 버리지 않는다 — 세어 둘 뿐이다(Iron Law)', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    driveFor(Math.ceil(VEHICLE_SUSTAIN_FAST_MS / 1000) + 90, CITY_MPS, t0);
    // 판정은 '묻는다'까지다. 엔진이 스스로 거리를 깎으면 오판 시 진짜 러닝이 사라진다.
    expect(runTracker.getDistanceKm()).toBeGreaterThan(0);
  });
});

describe('진짜 러너는 걸리지 않는다', () => {
  afterEach(() => {
    runTracker.stop();
  });

  it('걸음이 계속 늘면 아무리 빨라도 차량이 아니다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    let t = t0;
    let dist = 0;
    let steps = 1000;
    for (let i = 0; i < 200; i++) {
      t += 1000;
      dist += 4.5; // 3'42"/km — 엘리트 페이스
      steps += 3; // 걸음이 늘고 있다 = 사람이다
      runTracker.setNow(() => t);
      runTracker.feedSteps(steps, t);
      runTracker.ingestFix(fix(latAfter(dist), t));
    }
    expect(runTracker.getVehicleState().flaggedKm).toBe(0);
    expect(vehicleVerdict(runTracker.getVehicleState(), runTracker.getDistanceKm()).ask).toBe(false);
  });

  it('걸음 표본이 아예 없으면 판정하지 않는다 — 모르면 사용자 편', () => {
    // 권한 거부·센서 없는 기기. 가를 근거가 없으므로 의심하지 않는다.
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    let t = t0;
    let dist = 0;
    for (let i = 0; i < 200; i++) {
      t += 1000;
      dist += CITY_MPS;
      runTracker.setNow(() => t);
      runTracker.ingestFix(fix(latAfter(dist), t)); // feedSteps 없음
    }
    expect(runTracker.getVehicleState().flaggedKm).toBe(0);
  });
});

describe('OS 판정이 휴리스틱을 이긴다(1순위)', () => {
  afterEach(() => {
    runTracker.stop();
  });

  it('OS 가 "사람"이라고 하면 백스톱이 차량이라 해도 안 센다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    runTracker.setOsActivityVerdict(false); // OS: 사람이다
    driveFor(Math.ceil(VEHICLE_SUSTAIN_FAST_MS / 1000) + 90, CITY_MPS, t0);
    // flaggedKm 은 백스톱이 쌓지만, **지금 차량인가**의 최종 답은 OS 가 이긴다.
    expect(runTracker.vehicleFlagged()).toBe(false);
  });

  it('OS 가 "차량"이라고 하면 백스톱이 조용해도 차량이다', () => {
    const t0 = 1_700_000_000_000;
    runTracker.setNow(() => t0);
    runTracker.start({goalKm: 0, shoe: SHOE, autoPause: false, t0});
    runTracker.setOsActivityVerdict(true);
    let t = t0;
    let dist = 0;
    let steps = 1000;
    for (let i = 0; i < 30; i++) {
      t += 1000;
      dist += 3;
      steps += 3; // 걸음이 늘고 있다 — 백스톱은 사람이라 본다
      runTracker.setNow(() => t);
      runTracker.feedSteps(steps, t);
      runTracker.ingestFix(fix(latAfter(dist), t));
    }
    expect(runTracker.vehicleFlagged()).toBe(true);
  });

  it('러닝을 새로 시작하면 지난 판정을 물려받지 않는다', () => {
    runTracker.start({goalKm: 0, shoe: SHOE});
    runTracker.setOsActivityVerdict(true);
    runTracker.stop();
    runTracker.start({goalKm: 0, shoe: SHOE});
    expect(runTracker.vehicleFlagged()).toBe(false);
    expect(runTracker.getVehicleState().flaggedKm).toBe(0);
  });
});
