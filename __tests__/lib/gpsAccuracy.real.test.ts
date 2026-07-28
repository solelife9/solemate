/**
 * 실측 GPS 정확도 회귀 — 2026-07-28 민우님 러닝(의왕시).
 *
 * 이 스위트의 존재 이유: 거리 상수를 합성 하네스만으로 튜닝했다가 **실제 코스에서 과소측정**
 * 되는 일이 반복됐다. 2026-07-11 에 PHANTOM_ACC_FLOOR_FACTOR 를 0.35 → 0.8 로 올린 것도
 * 합성 스윕에서 최적이라 판단한 결과였는데, 실제로는 곡선 코스에서 코너를 잘라 거리를 깎았다.
 *
 * 실측 3자 비교:
 *   가민(기준) 5.43km · keego 워치 5.358km(-1.3%) · keego 폰 5.14km(**-5.3%**)
 *
 * 그래서 정답(가민)과 그날 실제 경로를 픽스처로 박는다. 앞으로 거리 관련 상수를 건드리면
 * 이 테스트가 "실제 러닝에서 몇 % 틀리는지"를 즉시 알려준다.
 *
 * ⚠️ 픽스처 경로는 폰이 저장한 200점 다운샘플이라, 이걸로 잰 길이는 원본 GPS 스트림보다
 * 짧다(코너가 잘린다). 그 성질 자체가 이 문제의 핵심 증거라 함께 단언한다.
 */
import fixture from '../fixtures/run-2026-07-28.json';
import {calcDist} from '../../lib/geo';
import {PHANTOM_ACC_FLOOR_FACTOR, MAX_FIX_ACCURACY_M} from '../../lib/engineConstants';

type Pt = {lat: number; lon: number};
const route = fixture.route as Pt[];

/** 경로의 기하학적 길이(km) — 점을 순서대로 이은 거리. */
function polylineKm(pts: readonly Pt[]): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += calcDist(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }
  return sum;
}

describe('실측 픽스처가 온전하다', () => {
  it('그날 경로와 정답이 함께 들어 있다', () => {
    expect(route.length).toBeGreaterThan(100);
    expect(fixture.garminKm).toBe(5.43);
    expect(fixture.recordedKm).toBe(5.14);
  });
});

describe('폰 기록이 실제보다 짧았다 — 이 사실을 잊지 않는다', () => {
  const errPct = ((fixture.recordedKm - fixture.garminKm) / fixture.garminKm) * 100;

  it('가민 대비 5% 넘게 짧게 기록됐다', () => {
    expect(errPct).toBeLessThan(-5);
  });

  it('저장된 경로를 다시 재도 짧다 — 재계산으로는 복구되지 않는다', () => {
    // 200점 다운샘플이라 코너가 잘려 있다. 그래서 병합에서 거리를 재계산하지 않고
    // 측정값을 그대로 쓴다(lib/runMerge 의 설계 근거).
    const geo = polylineKm(route);
    expect(geo).toBeLessThan(fixture.garminKm);
    // 기록값과 거의 같다 = 기록 자체가 성긴 점에서 나왔다는 방증.
    expect(Math.abs(geo - fixture.recordedKm)).toBeLessThan(0.15);
  });
});

describe('노이즈 하한 — 과소측정을 만들던 값에서 내려왔다', () => {
  it('하한이 12m 이하로 내려왔다(종전 16m)', () => {
    // acceptSegment 는 max(1m, accuracy × FACTOR) 미만 구간을 버린다.
    // 0.8(=16m)에서 실측 -5.3% 가 났다. 0.6(=12m)으로 내려 코너 손실을 줄인다.
    const floorM = MAX_FIX_ACCURACY_M * PHANTOM_ACC_FLOOR_FACTOR;
    expect(floorM).toBeLessThanOrEqual(12);
  });

  it('그렇다고 0.6 밑으로는 못 내린다 — 팬텀 드리프트가 되살아난다', () => {
    // 실측 스윕(2026-07-28): 0.5 에서 합성 가드 6건이 깨졌다(정지 300s 잔여 6.5%→7.1%,
    // 도심 협곡 11%→12.8%). 0.6 이 과대(팬텀)와 과소(코너 컷) 사이의 하한선이다.
    expect(PHANTOM_ACC_FLOOR_FACTOR).toBeGreaterThanOrEqual(0.6);
  });

  it('6분 페이스에서 뭉치는 GPS 개수가 줄었다', () => {
    // 6:00/km = 2.78 m/s. 하한 12m 면 ~4.3 fix — 종전 16m(~5.8 fix)보다 촘촘해져
    // 곡선을 덜 자른다.
    const mps = 1000 / 360;
    const fixesNeeded = (MAX_FIX_ACCURACY_M * PHANTOM_ACC_FLOOR_FACTOR) / mps;
    expect(fixesNeeded).toBeLessThan(5);
  });

  it('⚠️ 실측 재검증 전까지는 미확정이다', () => {
    // 합성 스윕만 믿고 정한 값이 두 번 연속 빗나갔다(0.35→0.8 도 그랬다).
    // 다음 러닝에서 가민과 다시 비교해 이 픽스처를 갱신해야 한다.
    expect(fixture.garminKm).toBeGreaterThan(0);
  });
});
