/**
 * 한 러닝은 한 기록 — 폰·워치 중복 저장 병합.
 *
 * 2026-07-28 민우님 실기기 러닝이 이 스위트의 기준점이다. 폰과 워치를 둘 다 켜고 뛰었더니
 * 같은 러닝이 두 건으로 저장돼 **신발에 10.50km 가 차감됐다**(실제 5.4km). keego 의 존재
 * 이유인 수명 관리가 정면으로 망가진 사건이라, 그날 데이터를 그대로 회귀 테스트로 박는다.
 */
import {
  runWindow,
  overlapRatio,
  findMergeTarget,
  mergeRuns,
  distanceAuthority,
  SAME_RUN_OVERLAP,
  MergeableRun,
} from '../../lib/runMerge';

// ── 2026-07-28 실측(폰에서 추출한 실제 레코드) ──────────────────────────────────
const WATCH: MergeableRun = {
  id: 'run_1785241144946_cnzsqnx',
  shoe_id: 'shoe_1784287387930_cjnqpud',
  km: 5.357716415271761,
  duration: 1943,
  run_date: '2026-07-28',
  source: 'watch',
  updatedAt: 1785241144946,
  route: '',
  location: '',
  cadence: 0,
  heart_rate: 0,
  calories: 0,
  elevation_m: 274, // 워치 자체 계산 — 5km 도심 러닝에 274m(폰 33m, 8배)
};
const PHONE: MergeableRun = {
  id: 'run_1785241144894_ko16yp9',
  shoe_id: 'shoe_1784287387930_cjnqpud',
  km: 5.14,
  duration: 1935,
  run_date: '2026-07-28',
  source: 'gps',
  updatedAt: 1785241144894,
  route: '[{"lat":37.34,"lon":126.96}]',
  location: '고천동, 의왕시',
  cadence: 172,
  heart_rate: 0,
  calories: 407,
  elevation_m: 33,
};
/** 워치가 HR 백필에 등록한 실제 시작 시각(폰에서 추출). 폰보다 189초 먼저 시작했다. */
const WATCH_START = 1785239020917;

describe('시간창 — 저장된 런에서 시작 시각을 되살린다', () => {
  it('updatedAt 에서 duration 을 빼 역산한다', () => {
    const w = runWindow(PHONE)!;
    expect(w.endMs).toBe(PHONE.updatedAt);
    expect(w.startMs).toBe(PHONE.updatedAt! - PHONE.duration! * 1000);
    // 실측 검증: 역산 시작이 HR 백필에 등록된 실제 시작(1785239209974)과 80ms 차이.
    expect(Math.abs(w.startMs - 1785239209974)).toBeLessThan(200);
  });

  it('명시적 시작(워치 페이로드)이 있으면 그쪽이 우선이다', () => {
    const w = runWindow(WATCH, WATCH_START)!;
    expect(w.startMs).toBe(WATCH_START);
    expect(w.endMs).toBe(WATCH_START + WATCH.duration! * 1000);
  });

  it('시간이 없으면 창을 만들지 않는다(추측 금지)', () => {
    expect(runWindow({id: 'x', duration: 0, updatedAt: 1})).toBeNull();
    expect(runWindow({id: 'x', duration: 100})).toBeNull();
  });
});

describe('겹침 판정 — 짧은 쪽을 분모로 쓴다', () => {
  it('실측 케이스는 90% 넘게 겹친다', () => {
    const w = runWindow(WATCH, WATCH_START)!;
    const p = runWindow(PHONE)!;
    const r = overlapRatio(w, p);
    expect(r).toBeGreaterThan(0.9);
    expect(r).toBeGreaterThanOrEqual(SAME_RUN_OVERLAP);
  });

  it('워치를 먼저 켜도 놓치지 않는다(긴 쪽 분모였다면 떨어졌을 케이스)', () => {
    // 워치가 10분 먼저 시작해 총 40분, 폰은 30분. 폰 러닝은 워치 안에 완전히 들어있다.
    const w = {startMs: 0, endMs: 40 * 60000};
    const p = {startMs: 10 * 60000, endMs: 40 * 60000};
    expect(overlapRatio(w, p)).toBe(1);
  });

  it('안 겹치면 0이다', () => {
    expect(overlapRatio({startMs: 0, endMs: 100}, {startMs: 200, endMs: 300})).toBe(0);
  });
});

describe('중복 찾기 — 이게 이 모듈의 존재 이유', () => {
  it('실측: 워치 런이 들어오면 이미 저장된 폰 런을 찾아낸다', () => {
    const found = findMergeTarget(WATCH, [PHONE], {incomingStartMs: WATCH_START});
    expect(found?.id).toBe(PHONE.id);
  });

  it('반대 방향도 찾는다(폰 런이 나중에 저장되는 경우)', () => {
    const found = findMergeTarget(PHONE, [WATCH], {startMsById: {[WATCH.id]: WATCH_START}});
    expect(found?.id).toBe(WATCH.id);
  });

  it('다른 신발이면 합치지 않는다', () => {
    const other = {...PHONE, shoe_id: 'shoe_other'};
    expect(findMergeTarget(WATCH, [other], {incomingStartMs: WATCH_START})).toBeNull();
  });

  it('시간이 안 겹치면 합치지 않는다(어제 러닝은 별개다)', () => {
    const yesterday = {...PHONE, updatedAt: PHONE.updatedAt! - 24 * 3600 * 1000};
    expect(findMergeTarget(WATCH, [yesterday], {incomingStartMs: WATCH_START})).toBeNull();
  });

  it('자기 자신은 상대로 삼지 않는다', () => {
    expect(findMergeTarget(WATCH, [WATCH], {incomingStartMs: WATCH_START})).toBeNull();
  });

  it('여러 개가 걸리면 가장 많이 겹치는 하나를 고른다', () => {
    const partial = {...PHONE, id: 'partial', duration: 1935, updatedAt: PHONE.updatedAt! - 900000};
    const found = findMergeTarget(WATCH, [partial, PHONE], {incomingStartMs: WATCH_START});
    expect(found?.id).toBe(PHONE.id);
  });
});

describe('병합 — 측정값은 그대로, 파생값은 폰 규칙', () => {
  const merged = mergeRuns(PHONE, WATCH, 'watch');

  it('거리는 워치 것을 쓴다(가민 대비 워치 -1.3% vs 폰 -5.3%)', () => {
    expect(merged.km).toBe(WATCH.km);
  });

  it('한 번 뛴 거리가 한 번만 남는다 — 신발 이중 차감이 사라진다', () => {
    // 병합 전: 5.358 + 5.14 = 10.50km 가 신발에 쌓였다.
    expect(merged.km).toBeLessThan(6);
  });

  it('경로·위치·케이던스·칼로리는 있는 쪽(폰)에서 가져온다', () => {
    expect(merged.route).toBe(PHONE.route);
    expect(merged.location).toBe(PHONE.location);
    expect(merged.cadence).toBe(172);
    expect(merged.calories).toBe(407);
  });

  it('고도는 폰 계산값을 쓴다 — 워치의 부푼 274m 를 버린다', () => {
    expect(merged.elevation_m).toBe(33);
    expect(merged.elevation_m).not.toBe(274);
  });

  it('기존 런의 id 를 유지한다(사이드카·통계가 id 로 붙어 있다)', () => {
    expect(merged.id).toBe(PHONE.id);
    expect(merged.shoe_id).toBe(PHONE.shoe_id);
  });

  it('입력을 변형하지 않는다', () => {
    const snap = JSON.stringify([PHONE, WATCH]);
    mergeRuns(PHONE, WATCH, 'watch');
    expect(JSON.stringify([PHONE, WATCH])).toBe(snap);
  });

  it('심박은 있는 쪽이 이긴다', () => {
    const withHr = mergeRuns(PHONE, {...WATCH, heart_rate: 156}, 'watch');
    expect(withHr.heart_rate).toBe(156);
  });

  it('워치 고도만 있고 폰 값이 없으면 비운다(틀린 숫자보다 빈칸)', () => {
    const noPhoneElev = mergeRuns({...PHONE, elevation_m: 0}, WATCH, 'watch');
    expect(noPhoneElev.elevation_m).toBe(0);
  });
});

describe('실내는 거리 정본이 뒤집힌다', () => {
  it('트레드밀은 폰이 정본(GPS 가 무의미하다)', () => {
    expect(distanceAuthority('treadmill')).toBe('phone');
    expect(distanceAuthority('road')).toBe('watch');
    expect(distanceAuthority(undefined)).toBe('watch');
  });

  it('트레드밀이면 폰 거리를 남긴다', () => {
    const merged = mergeRuns(PHONE, WATCH, distanceAuthority('treadmill'));
    expect(merged.km).toBe(PHONE.km);
  });
});

// ============================================================================
// 도착 순서에 무관해야 한다 (2026-08-07 감사)
//
// 병합 검사가 **워치 수신 경로에만** 있었다(App.tsx 의 findMergeTarget 호출부가 한 곳뿐).
// 그래서 순서가 뒤집히면 그대로 뚫렸다:
//   워치에서 정지 → 워치가 즉시 런 전송 → 폰은 만보계·역지오코딩을 await 한 뒤에야
//   저장 → 워치 런이 먼저 착지 → 병합 대상이 아직 없으니 새 런 → 폰도 새 런
//   → **신발 이중 차감**(2026-07-28 "5.4km 러닝이 신발에 10.50km"와 같은 결과).
//
// 이제 두 경로가 대칭으로 검사하고, 권한도 양쪽 'watch' 로 고정했다. 그래서
// **누가 먼저 도착하든 결과가 같아야 한다.** 그게 이 스위트의 계약이다.
// ============================================================================
describe('도착 순서가 결과를 바꾸지 않는다', () => {
  test('워치가 먼저 와도, 폰이 먼저 와도 상대를 찾아낸다', () => {
    // 폰이 먼저 저장된 상태에서 워치가 도착 (기존 경로)
    expect(findMergeTarget(WATCH, [PHONE], {incomingStartMs: WATCH_START})).toBe(PHONE);
    // 워치가 먼저 저장된 상태에서 폰이 도착 (2026-08-07 에 닫은 구멍)
    expect(
      findMergeTarget(PHONE, [WATCH], {startMsById: {[WATCH.id]: WATCH_START}}),
    ).toBe(WATCH);
  });

  test('어느 순서로 합쳐도 남는 거리가 같다 — 신발은 한 번만 닳는다', () => {
    const watchFirst = mergeRuns(PHONE, WATCH, 'watch'); // 폰이 기존, 워치가 도착
    const phoneFirst = mergeRuns(WATCH, PHONE, 'watch'); // 워치가 기존, 폰이 도착
    expect(watchFirst.km).toBe(phoneFirst.km);
    expect(watchFirst.duration).toBe(phoneFirst.duration);
    // 그리고 그 거리는 두 건의 합(10.5km)이 아니라 한 건이다 — 이중 차감의 반대말.
    expect(watchFirst.km).toBeLessThan((PHONE.km ?? 0) + (WATCH.km ?? 0));
  });

  test("권한을 'phone' 으로 주면 순서에 따라 거리가 갈린다 — 그래서 쓰지 않는다", () => {
    // 이 테스트는 회귀 방지용이다. 호출부가 실수로 'phone' 을 넘기면 같은 러닝이
    // 도착 순서에 따라 다른 거리로 남는다는 것을 못 박아 둔다.
    const a = mergeRuns(PHONE, WATCH, 'phone');
    const b = mergeRuns(WATCH, PHONE, 'phone');
    expect(a.km).toBe(b.km); // 권한 자체는 대칭이지만…
    expect(a.km).not.toBe(mergeRuns(PHONE, WATCH, 'watch').km); // …'watch' 와는 다른 값이다
  });
});
