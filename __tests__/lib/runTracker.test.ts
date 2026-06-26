/**
 * lib/runTracker — shared GPS distance engine unit tests.
 *
 * Exercises an ISOLATED RunTracker instance (not the module singleton) with a
 * deterministic injected clock and synthetic fixes. Assertions are on observable
 * engine outputs (getDistanceKm / getElapsed / getState() / emitted events) —
 * the same contract both delivery paths (foreground watch + background task)
 * depend on. The pure decision logic (Kalman → segment gate → distance, auto
 * pause/resume) is reused unchanged from lib/*, so these guard the stateful
 * orchestration the engine adds: warmup, de-dup, pause accounting, permission stop.
 *
 * @format
 */

import {RunTracker, RawFix, RunTrackerEvent} from '../../lib/runTracker';

const LON = 127.0;

function fix(lat: number, lon: number, acc: number, ts: number): RawFix {
  return {coords: {latitude: lat, longitude: lon, accuracy: acc}, timestamp: ts};
}

// Build an engine with a controllable clock so elapsed/pause math is deterministic.
function makeEngine() {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  return {t, set: (v: number) => (clock = v)};
}

// Clear warmup at a single point P0 (idx 0..2 do not count distance).
function clearWarmup(t: RunTracker) {
  t.ingestFix(fix(37.5, LON, 5, 100000));
  t.ingestFix(fix(37.5, LON, 5, 102000));
  t.ingestFix(fix(37.5, LON, 5, 104000));
}

test('accumulates distance only after warmup, summing accepted segments', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  clearWarmup(t);
  expect(t.getDistanceKm()).toBe(0); // first 3 fixes are warmup → no distance

  t.ingestFix(fix(37.5003, LON, 5, 107000)); // ~33 m accepted
  const d1 = t.getDistanceKm();
  expect(d1).toBeGreaterThan(0);

  t.ingestFix(fix(37.5006, LON, 5, 110000)); // another ~33 m
  expect(t.getDistanceKm()).toBeGreaterThan(d1); // summed, not overwritten
});

test('de-dupes by timestamp: a non-newer fix (echoed by a second path) is ignored', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);

  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const d = t.getDistanceKm();

  // Same timestamp delivered again (foreground + background overlap) → dropped.
  t.ingestFix(fix(37.5006, LON, 5, 107000));
  expect(t.getDistanceKm()).toBe(d);
  // An older timestamp is also dropped.
  t.ingestFix(fix(37.5009, LON, 5, 106000));
  expect(t.getDistanceKm()).toBe(d);
});

test('manual pause freezes distance; resume lets it accumulate again', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);
  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const dRunning = t.getDistanceKm();
  expect(dRunning).toBeGreaterThan(0);

  t.togglePause();
  expect(t.getState().paused).toBe(true);
  t.ingestFix(fix(37.5006, LON, 5, 110000)); // moving fix while paused
  expect(t.getDistanceKm()).toBe(dRunning); // frozen

  t.togglePause();
  expect(t.getState().paused).toBe(false);
  t.ingestFix(fix(37.5009, LON, 5, 113000));
  expect(t.getDistanceKm()).toBeGreaterThan(dRunning); // engine restarts
});

test('elapsed is pause-adjusted, frozen while paused, and never negative', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  set(110000);
  expect(t.getElapsed()).toBe(10); // 10s of run time

  t.togglePause(); // pause at t=110000
  set(140000); // 30s pass while paused
  expect(t.getElapsed()).toBe(10); // frozen — paused time does not count

  t.togglePause(); // resume at t=140000 (pausedMs += 30000)
  set(145000);
  expect(t.getElapsed()).toBe(15); // 10s before + 5s after resume
  expect(t.getElapsed()).toBeGreaterThanOrEqual(0);
});

test('standing still auto-pauses, sustained motion auto-resumes', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  let ts = 100000;
  t.ingestFix(fix(37.5, LON, 5, ts));
  t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
  t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
  t.ingestFix(fix(37.5003, LON, 5, (ts += 2000))); // a real move
  expect(t.getState().autoPaused).toBe(false);

  // Stand still: repeated fixes at one point → slowSec crosses the 3s hold.
  for (let i = 0; i < 12; i++) t.ingestFix(fix(37.5003, LON, 5, (ts += 3000)));
  expect(t.getState().autoPaused).toBe(true);

  // Two sustained fast fixes (>1 m/s for ≥1s) → auto-resume.
  t.ingestFix(fix(37.50035, LON, 5, (ts += 800))); // ~6m/0.8s fast, fastSec 0.8 < 1 → still paused
  expect(t.getState().autoPaused).toBe(true);
  t.ingestFix(fix(37.5004, LON, 5, (ts += 800))); // fastSec ≥ 1 → resume
  expect(t.getState().autoPaused).toBe(false);
});

test('notifyPermissionRevoked stops accumulation and flags the state', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);
  t.ingestFix(fix(37.5003, LON, 5, 107000));
  const d = t.getDistanceKm();
  expect(d).toBeGreaterThan(0);

  t.notifyPermissionRevoked();
  expect(t.getState().permissionRevoked).toBe(true);
  expect(t.isActive()).toBe(false);

  // Further fixes are ignored — no garbage distance after revocation.
  t.ingestFix(fix(37.5009, LON, 5, 110000));
  expect(t.getDistanceKm()).toBe(d);
});

test('notifyPermissionRevoked freezes elapsed time — clock keeps ticking but time does not', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  set(120000); // 20s into the run
  expect(t.getElapsed()).toBe(20);

  t.notifyPermissionRevoked(); // time must freeze here, like distance does
  expect(t.getElapsed()).toBe(20);

  // 1s ticker keeps firing and wall clock keeps advancing — elapsed stays put.
  t.tick();
  set(200000); // 80s more pass on the wall clock
  t.tick();
  expect(t.getElapsed()).toBe(20); // frozen, not 100
  expect(t.getState().elapsed).toBe(20);
});

test('emits firstFix once and pause/resume events with the auto flag', () => {
  const {t} = makeEngine();
  const events: RunTrackerEvent[] = [];
  t.subscribe(ev => events.push(ev));
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

  clearWarmup(t);
  const firstFixes = events.filter(e => e.type === 'firstFix');
  expect(firstFixes.length).toBe(1); // emitted exactly once

  t.togglePause();
  t.togglePause();
  const paused = events.find(e => e.type === 'paused');
  const resumed = events.find(e => e.type === 'resumed');
  expect(paused).toMatchObject({type: 'paused', auto: false});
  expect(resumed).toMatchObject({type: 'resumed', auto: false});
});

test('GPS 공백 후 큰 점프(>300m·정상속도)는 거리 미계상하되 앵커를 전진시켜 거리계가 동결되지 않는다(#1)', () => {
  // 신호 공백(60s) 동안 주자가 ~555m 이동 → 복구 첫 fix 가 직전 앵커와 555m 떨어졌다.
  // 그 거리는 cap(300m) 초과라 계상하지 않되, 앵커를 그 fix 로 전진시켜야 한다. 전진하지
  // 않으면(옛 동작) 멀어지는 주자에 대해 이후 모든 fix 가 영구 cap 초과로 거부돼 거리계가
  // 런 끝까지 동결된다 — 이 테스트의 마지막 단언이 그걸 잡는다.
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  const F = (lat: number, ts: number) => {
    clock = ts;
    t.ingestFix(fix(lat, LON, 5, ts));
  };
  F(37.5, 100000);
  F(37.5, 102000);
  F(37.5, 104000); // warmup
  F(37.5003, 107000); // idx3 채택 ~33m
  const dBefore = t.getDistanceKm();
  expect(dBefore).toBeGreaterThan(0);
  // 60s 공백 후 ~555m 점프(속도 ~9m/s 정상, 정확도 양호) → re-anchor: 거리 미계상 + 앵커 전진
  F(37.5053, 167000);
  expect(t.getDistanceKm()).toBeCloseTo(dBefore, 5); // 점프 거리는 안 더해짐
  // 새 앵커(37.5053)에서 정상 이동(~42m/5s) → 다시 누적된다(동결됐다면 그대로였을 것).
  // (옛 동작이면 lastGood 가 37.5003 에 묶여 이 fix 도 588m 점프로 거부 → dist 동결)
  F(37.5056, 172000);
  expect(t.getDistanceKm()).toBeGreaterThan(dBefore);
});

test('현재(롤링) 페이스: 표본 충분하면 산출, 표본 부족·정지 시 null(#P0-1)', () => {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  const F = (lat: number, ts: number) => {
    clock = ts;
    t.ingestFix(fix(lat, LON, 5, ts));
  };
  // 시작 직후엔 현재 페이스 미정(표본 0~1).
  expect(t.getState().currentPaceSecPerKm).toBeNull();
  F(37.5, 100000);
  F(37.5, 102000);
  F(37.5, 104000); // warmup
  F(37.5003, 107000); // 첫 채택(샘플 1개) → 아직 null
  expect(t.getState().currentPaceSecPerKm).toBeNull();
  // 일정 페이스로 누적(약 22m/6s ≈ 3.7m/s) → 현재 페이스가 잡힌다.
  F(37.5005, 113000);
  F(37.5007, 119000);
  F(37.5009, 125000);
  F(37.5011, 131000);
  const cp = t.getState().currentPaceSecPerKm;
  expect(cp).not.toBeNull();
  expect(Number.isFinite(cp as number)).toBe(true);
  expect(cp as number).toBeGreaterThan(60); // 1:00/km 보다 느림(현실 범위)
  expect(cp as number).toBeLessThan(1200); // 20:00/km 보다 빠름
  // 일시정지 중엔 현재 페이스 의미 없음 → null.
  t.togglePause();
  expect(t.getState().currentPaceSecPerKm).toBeNull();
});

test('현재 페이스 OS 속도 보강(P0-6): 롤링 부족 시 속도로 채우고, 롤링이 생기면 롤링 우선', () => {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  const FS = (lat: number, ts: number, speed: number | null) => {
    clock = ts;
    t.ingestFix({coords: {latitude: lat, longitude: LON, accuracy: 5, speed}, timestamp: ts});
  };
  // 워밍업(롤링 표본 0)이라도 유효 OS 속도(2.5 m/s)면 현재 페이스를 보강한다 → 1000/2.5=400.
  FS(37.5, 100000, 2.5);
  FS(37.5, 102000, 2.5);
  const cpWarm = t.getState().currentPaceSecPerKm;
  expect(cpWarm).not.toBeNull();
  expect(cpWarm as number).toBeCloseTo(400, 0);
  // 무효 속도(-1, doppler 미정)면 보강하지 않는다 → (아직 롤링 없음) null.
  FS(37.5, 104000, -1);
  expect(t.getState().currentPaceSecPerKm).toBeNull();
  // 거리 누적이 충분해지면 롤링(거리기반)이 우선 — 엉뚱한 저속(0.6 m/s=1667초/km)을 무시하고
  // 현실 범위의 롤링 페이스를 반환한다(코어 불변 — 거리 누적엔 속도 미관여).
  FS(37.5003, 107000, 0.6);
  FS(37.5005, 113000, 0.6);
  FS(37.5007, 119000, 0.6);
  FS(37.5009, 125000, 0.6);
  const cpRoll = t.getState().currentPaceSecPerKm;
  expect(cpRoll).not.toBeNull();
  expect(cpRoll as number).toBeLessThan(1000); // 0.6m/s 보강(1667)이 아니라 롤링 우선
});

test('권한 회수 후 resumeFromPermissionRevoked: 거리 보존 + 재개 후 다시 누적 + elapsed 점프 없음(#6)', () => {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  const F = (lat: number, ts: number) => {
    clock = ts;
    t.ingestFix(fix(lat, LON, 5, ts));
  };
  F(37.5, 100000);
  F(37.5, 102000);
  F(37.5, 104000);
  F(37.5003, 107000);
  F(37.5006, 110000);
  const dBefore = t.getDistanceKm();
  expect(dBefore).toBeGreaterThan(0);
  clock = 110000;
  const elapsedBefore = t.getElapsed();

  // 주행 중 권한 회수 → active=false, elapsed 동결.
  t.notifyPermissionRevoked();
  expect(t.isActive()).toBe(false);
  clock = 170000; // 설정 다녀온 60s
  expect(t.getElapsed()).toBe(elapsedBefore); // 동결(증가 안 함)

  // 설정에서 재허용하고 복귀 → 재개.
  expect(t.resumeFromPermissionRevoked()).toBe(true);
  expect(t.isActive()).toBe(true);
  expect(t.getDistanceKm()).toBe(dBefore); // 거리 보존
  expect(t.getElapsed()).toBe(elapsedBefore); // 설정 다녀온 공백은 흡수 — elapsed 점프 없음

  // 재개 후: 첫 fix 는 새 앵커(거리 0 — 검증 불가한 공백 구간 거리는 계상하지 않는다),
  // 그다음 정상 이동부터 다시 누적된다(동결 방지). 칼만 2D 는 공백을 재측위로 처리해
  // 가짜 거리를 안 세므로 회복이 한 fix 더 걸린다(옛 1D 는 공백 일부를 계상했음).
  F(37.5009, 173000);
  F(37.5012, 176000);
  F(37.5015, 179000);
  expect(t.getDistanceKm()).toBeGreaterThan(dBefore);

  // 회수 상태가 아니면 no-op(false) — '처음부터 거부' 케이스 구분용.
  expect(t.resumeFromPermissionRevoked()).toBe(false);
});

// ── GPS 死구간(stall) 시간 제외 (P1-5: 페이스 왜곡 방지) ──────────────────────────
import {GPS_STALL_THRESHOLD_MS as TH} from '../../lib/gpsHealth';

describe('GPS stall 시간 elapsed 제외', () => {
  test('死구간 초과분은 elapsed 에서 빠진다(진행 중 + 종료 누적), 임계 이내는 정상', () => {
    const t = new RunTracker();
    let clock = 100000;
    t.setNow(() => clock);
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.ingestFix(fix(37.5, LON, 5, 100000)); // lastRecvMs=100000

    // 무신호 (임계 + 12s): 진행 중 stall — 타이머는 임계 초까지만 흐르고 멈춘다(거리 없이 안 늘어남).
    clock = 100000 + TH + 12000;
    expect(t.getElapsed()).toBe(Math.floor(TH / 1000));

    // fix 도착(간격 = 임계+12s) → 초과 12s 누적. elapsed 동일(역행 없음).
    t.ingestFix(fix(37.5, LON, 5, clock));
    expect(t.getElapsed()).toBe(Math.floor(TH / 1000));

    // 이후 5s 정상 러닝(간격 < 임계) → 5s 그대로 흐른다.
    clock += 5000;
    t.ingestFix(fix(37.5003, LON, 5, clock));
    expect(t.getElapsed()).toBe(Math.floor(TH / 1000) + 5);
  });

  test('공백 후 채택된 세그먼트의 시간은 elapsed 에서 빠지지 않는다 — 거리·시간 일관(#3)', () => {
    // 30s GPS 공백 뒤, 직전 앵커에서 ~150m 이동한 정상 fix(속도 5m/s, <300m)가 채택돼 거리가
    // 더해진다. 그 30s 는 실제 러닝 시간이므로 stall 로 빼면 안 된다(옛 동작은 빼서 페이스가
    // 비현실적으로 빨라졌다). elapsed 는 실제 경과(37s) 그대로여야 한다.
    const t = new RunTracker();
    let clock = 100000;
    t.setNow(() => clock);
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    const F = (lat: number, ts: number) => {
      clock = ts;
      t.ingestFix(fix(lat, LON, 5, ts));
    };
    F(37.5, 100000);
    F(37.5, 102000);
    F(37.5, 104000); // warmup(idx 0~2)
    F(37.5003, 107000); // idx3 채택 ~33m
    F(37.50165, 137000); // 30s 공백 후 ~150m(5m/s) 채택
    expect(t.getDistanceKm()).toBeGreaterThan(0);
    expect(t.getElapsed()).toBe(37); // 채택 공백은 stall 제외 안 함(옛 동작이면 15s)
  });

  test('정상 fix 간격(임계 이내)에서는 elapsed = 실시간(제외 0)', () => {
    const t = new RunTracker();
    let clock = 100000;
    t.setNow(() => clock);
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.ingestFix(fix(37.5, LON, 5, 100000));
    clock = 100000 + 3000; // 3s 무신호(임계 이내)
    expect(t.getElapsed()).toBe(3); // 제외 없음
    t.ingestFix(fix(37.5, LON, 5, clock));
    clock += 4000; // 또 4s
    expect(t.getElapsed()).toBe(7);
  });
});

// ── 크래시 복구 '이어 달리기' 시드 (P1-6) ──────────────────────────────
describe('recovery seed (이어 달리기)', () => {
  test('seedDist 부터 거리를 잇고, 공백을 가로지르는 허위 세그먼트를 만들지 않는다', () => {
    const {t, set} = makeEngine();
    // 호출자는 t0 = now − elapsed*1000 로 줘 경과시간을 잇는다.
    set(200000);
    t.start({
      goalKm: 5,
      shoe: {id: 's1', name: 'X'},
      t0: 200000 - 600 * 1000, // 10분 경과 지점에서 재개
      seedDist: 2.5,
      seedPts: [{lat: 37.4, lon: LON}, {lat: 37.45, lon: LON}], // 크래시 전 경로(멀리 떨어짐)
      seedLocation: '서울, 종로구',
    });

    // 재개 즉시: 거리는 시드값, 경과는 t0 기준으로 이어진다.
    expect(t.getDistanceKm()).toBe(2.5);
    expect(t.getElapsed()).toBe(600);

    // 재개 후 첫 fix(시드 경로와 한참 떨어진 지점) — 새 앵커가 될 뿐, 거리는 안 는다.
    set(203000);
    t.ingestFix(fix(37.5, LON, 5, 203000));
    expect(t.getDistanceKm()).toBe(2.5); // 공백을 가로지른 허위 거리 없음

    // 그 다음 실제 이동분만 누적된다.
    set(206000);
    t.ingestFix(fix(37.5003, LON, 5, 206000));
    expect(t.getDistanceKm()).toBeGreaterThan(2.5);
  });

  test('seedPts 는 경로 폴리라인을 잇고, firstFix 는 위치 시드가 있으면 억제된다', () => {
    const {t, set} = makeEngine();
    const events: RunTrackerEvent[] = [];
    t.subscribe(ev => events.push(ev));
    set(200000);
    t.start({
      goalKm: 5,
      shoe: {id: 's1', name: 'X'},
      t0: 200000 - 300 * 1000,
      seedDist: 1.2,
      seedPts: [{lat: 37.4, lon: LON}, {lat: 37.45, lon: LON}],
      seedLocation: '서울, 종로구',
    });
    // 경로점이 보존된다(지도 연속).
    expect(t.getPoints().length).toBe(2);

    // 재개 후 fix 들 — firstFix 이벤트가 발생하지 않아야 한다(위치 이미 앎).
    set(203000);
    t.ingestFix(fix(37.5, LON, 5, 203000));
    set(206000);
    t.ingestFix(fix(37.5003, LON, 5, 206000));
    expect(events.some(e => e.type === 'firstFix')).toBe(false);
  });

  test('시드 없는 일반 시작은 0 에서 출발한다(회귀 가드)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    expect(t.getDistanceKm()).toBe(0);
    expect(t.getPoints().length).toBe(0);
  });
});
