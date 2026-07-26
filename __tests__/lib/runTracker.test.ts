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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SNAPSHOT_KEY, ROUTE_KEY} from '../../lib/runPersistence';

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

  // 5점 중심 평활(2026-07-11): 거리는 채택 fix 2개째부터 확정된다(~2s 지연,
  // 꼬리는 경계/stop() flush 가 계상 — 유실 아님).
  t.ingestFix(fix(37.5003, LON, 5, 107000)); // ~33 m accepted — 아직 평활 버퍼
  expect(t.getDistanceKm()).toBe(0);

  t.ingestFix(fix(37.5006, LON, 5, 110000)); // another ~33 m → 첫 확정
  const d1 = t.getDistanceKm();
  expect(d1).toBeGreaterThan(0);

  // 5점 창이 완전히 차는 채택 4개째부터는 fix 마다 ~2 fix 지연으로 꾸준히 확정된다.
  t.ingestFix(fix(37.5009, LON, 5, 113000));
  t.ingestFix(fix(37.5012, LON, 5, 116000));
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

  // 일시정지 = 구간 경계: 평활 꼬리(직전 채택분)를 flush 로 계상한 값이 동결값.
  t.togglePause();
  const dRunning = t.getDistanceKm();
  expect(dRunning).toBeGreaterThan(0);
  expect(t.getState().paused).toBe(true);
  t.ingestFix(fix(37.5006, LON, 5, 110000)); // moving fix while paused
  expect(t.getDistanceKm()).toBe(dRunning); // frozen

  t.togglePause();
  expect(t.getState().paused).toBe(false);
  // C1: 재개 첫 fix 는 새 앵커 — pre-pause 위치(37.5003)에서 재개 위치(37.5009)까지의 유령
  // 거리를 계상하지 않는다(일시정지 구간 이동은 거리 아님). 동결값 그대로.
  t.ingestFix(fix(37.5009, LON, 5, 113000));
  expect(t.getDistanceKm()).toBe(dRunning);
  // 그다음 실제 이동분부터 다시 누적된다(평활 확정은 채택 2개째부터).
  t.ingestFix(fix(37.5012, LON, 5, 116000));
  t.ingestFix(fix(37.5015, LON, 5, 119000));
  expect(t.getDistanceKm()).toBeGreaterThan(dRunning); // engine restarts
});

test('C1: 일시정지 중 멀리 이동해도 재개 시 유령 거리를 합산하지 않는다', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);
  t.ingestFix(fix(37.5003, LON, 5, 107000)); // 러닝 중 ~33m

  // 일시정지 후 주자가 ~330m 떨어진 곳으로 이동(예: 화장실). 정지 중 fix 는 거리 미반영.
  // (동결값은 pause flush 로 평활 꼬리까지 계상된 값.)
  t.togglePause();
  const dRunning = t.getDistanceKm();
  expect(dRunning).toBeGreaterThan(0);
  t.ingestFix(fix(37.5033, LON, 5, 140000));
  expect(t.getDistanceKm()).toBe(dRunning);

  // 재개: 첫 fix 가 330m 떨어진 지점이어도 유령 330m 를 더하면 안 된다(새 앵커).
  t.togglePause();
  t.ingestFix(fix(37.5033, LON, 5, 143000));
  expect(t.getDistanceKm()).toBe(dRunning); // 유령 거리 없음 — 재개 첫 fix 는 앵커일 뿐
  // 재개 지점에서 실제 이동분만 누적된다(칼만이 330m 공백을 재측위로 흡수 → 정착에 몇 fix).
  t.ingestFix(fix(37.5036, LON, 5, 146000));
  t.ingestFix(fix(37.5039, LON, 5, 149000));
  t.ingestFix(fix(37.5042, LON, 5, 152000));
  expect(t.getDistanceKm()).toBeGreaterThan(dRunning);
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

  t.notifyPermissionRevoked();
  expect(t.getState().permissionRevoked).toBe(true);
  expect(t.isActive()).toBe(false);
  // 회수 시 평활 꼬리를 flush 해 지금까지 달린 거리(~33m)를 전부 계상한 값이 동결값.
  const dFrozen = t.getDistanceKm();
  expect(dFrozen).toBeGreaterThan(0);

  // Further fixes are ignored — no garbage distance after revocation.
  t.ingestFix(fix(37.5009, LON, 5, 110000));
  expect(t.getDistanceKm()).toBe(dFrozen);
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
  F(37.5006, 110000); // 채택 ~33m — 평활 확정 시작(dist > 0)
  const dBefore = t.getDistanceKm();
  expect(dBefore).toBeGreaterThan(0);
  // 57s 공백 후 ~522m 점프(속도 ~9m/s 정상, 정확도 양호) → re-anchor: 점프 거리 미계상 +
  // 앵커 전진. 이때 직전 구간의 평활 꼬리(≤ ~35m)는 flush 로 계상된다(점프 555m 가
  // 더해졌다면 +0.5km 이상이었을 것 — 아래 상한이 그걸 잡는다).
  F(37.5053, 167000);
  const dAfterJump = t.getDistanceKm();
  expect(dAfterJump - dBefore).toBeLessThan(0.06); // 점프 거리는 안 더해짐(꼬리만)
  // 새 앵커(37.5053)에서 정상 이동 → 다시 누적된다(동결됐다면 그대로였을 것).
  // (옛 동작이면 lastGood 가 37.5006 에 묶여 이후 fix 도 점프로 거부 → dist 동결)
  F(37.5056, 172000);
  F(37.5059, 177000);
  expect(t.getDistanceKm()).toBeGreaterThan(dAfterJump);
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
  clock = 110000;
  const elapsedBefore = t.getElapsed();

  // 주행 중 권한 회수 → active=false, elapsed 동결. 거리는 평활 꼬리까지 flush 된 값.
  t.notifyPermissionRevoked();
  const dBefore = t.getDistanceKm();
  expect(dBefore).toBeGreaterThan(0);
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
    t.stop(); // 평활(5점 중심) 꼬리 flush — 최종 거리는 stop() 후 읽는다(제품 handleStop 동일)
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

    // 그 다음 실제 이동분만 누적된다(평활 꼬리는 stop() 이 계상 — 유실 없음).
    set(206000);
    t.ingestFix(fix(37.5003, LON, 5, 206000));
    t.stop();
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

// ── C1 팬텀 드리프트 억제(2026-07-03) — 정지 표류는 0, 저속 이동은 무손실 ──────────
// ── 걸음 정지 게이트(2026-07-11) — 걸음수가 늘지 않으면 거리 동결 ────────────────
describe('걸음 정지 게이트(feedSteps)', () => {
  // 저속 표류 fix: 10m/5s(≈2m/s — 칼만 속도 상한 2.5 미만, 플로어 4m 는 통과)를 만들어
  // 'GPS 만으론 걷기와 구분 불가한 정지 표류'를 모사한다.
  const driftRun = (t: RunTracker, feed: (ts: number) => void) => {
    let ts = 100000;
    t.ingestFix(fix(37.5, LON, 5, ts));
    t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
    t.ingestFix(fix(37.5, LON, 5, (ts += 2000)));
    for (let i = 0; i < 24; i++) {
      ts += 5000;
      feed(ts);
      t.ingestFix(fix(37.5 + (i + 1) * 0.00009, LON, 5, ts)); // ~10m/5s 표류
    }
    return ts;
  };

  test('표본 신선 + 걸음수 불변 → 12s 후 거리 동결(게이트 ON)', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.feedSteps(500, 100000); // 기준 표본
    driftRun(t, ts => {
      set(ts);
      t.feedSteps(500, ts); // 걸음수 불변(서 있음) — 표본은 5s 마다 신선
    });
    t.stop();
    // 게이트 성립(12s) 전 초반 표류 일부만 계상될 수 있다 — 이후는 전부 동결.
    expect(t.getDistanceKm()).toBeLessThan(0.05); // 표류 총 ~240m 중 극히 일부만
  });

  test('걸음수가 계속 늘면(걷기) 게이트가 걸리지 않는다 — 저속 이동 무손실', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    let steps = 500;
    driftRun(t, ts => {
      set(ts);
      t.feedSteps((steps += 9), ts); // 5s 마다 +9걸음(~105spm 걷기)
    });
    t.stop();
    expect(t.getDistanceKm()).toBeGreaterThan(0.2); // 표류 ~240m 대부분 계상
  });

  test('표본이 스테일하면(센서 중단) 게이트는 꺼진다 — 현행 동작 유지', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.feedSteps(500, 100000); // 이후 표본 없음 → 15s 뒤 스테일
    driftRun(t, ts => set(ts));
    t.stop();
    expect(t.getDistanceKm()).toBeGreaterThan(0.2); // 게이트 미작동(안전 기본값)
  });

  test('정지 후 걸음이 다시 늘면 게이트가 풀리고 거리도 다시 쌓인다', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    let ts = 100000;
    const F = (lat: number) => {
      set(ts);
      t.ingestFix(fix(lat, LON, 5, ts));
    };
    t.feedSteps(500, ts);
    F(37.5);
    ts += 2000; F(37.5);
    ts += 2000; F(37.5);
    // 정지 구간: 걸음수 불변 30s — 표류해도 동결.
    for (let i = 0; i < 6; i++) {
      ts += 5000;
      t.feedSteps(500, ts);
      F(37.5 + (i + 1) * 0.00009);
    }
    t.stop();
    const frozen = t.getDistanceKm();
    // 재출발: 걸음수 증가 재개 → 게이트 해제, 이동 계상.
    // (stop() 후엔 새 엔진처럼 재시작해 검증 — 인제스트 재개 대신 신규 런으로 단순화.)
    const {t: t2, set: set2} = makeEngine();
    t2.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    let ts2 = 100000;
    let steps2 = 500;
    t2.feedSteps(steps2, ts2);
    t2.ingestFix(fix(37.5, LON, 5, ts2));
    t2.ingestFix(fix(37.5, LON, 5, (ts2 += 2000)));
    t2.ingestFix(fix(37.5, LON, 5, (ts2 += 2000)));
    for (let i = 0; i < 6; i++) {
      ts2 += 5000;
      set2(ts2);
      t2.feedSteps(steps2, ts2); // 정지
      t2.ingestFix(fix(37.5 + (i + 1) * 0.00009, LON, 5, ts2));
    }
    for (let i = 0; i < 8; i++) {
      ts2 += 5000;
      set2(ts2);
      t2.feedSteps((steps2 += 14), ts2); // 재출발(~170spm)
      t2.ingestFix(fix(37.5 + 0.00054 + (i + 1) * 0.0001, LON, 5, ts2));
    }
    t2.stop();
    expect(t2.getDistanceKm()).toBeGreaterThan(frozen + 0.05); // 재개 후 누적 재개
  });
});

test('정지 중 GPS 표류(±2m 원형 wandering, acc 8m)는 거리를 쌓지 않는다 — C1', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);

  // 한 점 주위 ±2m(위도 ~0.000018°) 표류를 30초간 1Hz 로 — 겉보기 속도 최대 ~2m/s 라
  // 자동일시정지(0.6m/s)를 피할 수 있는 전형적 도심 멀티패스 패턴.
  const drift = [0.000018, -0.000015, 0.00001, -0.000018, 0.000012, -0.00001];
  for (let i = 0; i < 30; i++) {
    const dy = drift[i % drift.length];
    t.ingestFix(fix(37.5 + dy, LON, 8, 106000 + i * 1000));
  }
  // 정확도 비례 하한(8m×0.35=2.8m)이 ±2m 변위를 전부 노이즈로 거른다.
  expect(t.getDistanceKm()).toBe(0);
});

test('저속 이동(≈1.4m/s 걷기, acc 8m)은 앵커 합산으로 무손실 계상된다', () => {
  const {t} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  clearWarmup(t);

  // 1Hz 로 위도 +0.0000126°(≈1.4m)씩 60초 = 실이동 ≈84m. 각 세그먼트(1.4m)는 하한
  // (8m×0.8=6.4m) 미만이라 개별 거부되지만, 앵커가 보존돼 ~5fix 마다 7m 로 합산 채택된다
  // (2026-07-11 하한 0.35→0.8: 유예 단위만 굵어질 뿐 무손실 불변). 평활 꼬리는 stop() 계상.
  for (let i = 1; i <= 60; i++) {
    t.ingestFix(fix(37.5 + i * 0.0000126, LON, 8, 106000 + i * 1000));
  }
  t.stop();
  const d = t.getDistanceKm() * 1000; // m
  expect(d).toBeGreaterThan(70); // 무손실(±기하 오차·마지막 하한 미만 유예분 허용)
  expect(d).toBeLessThan(95);
});

// ── 자동 일시정지 설정(#16) — 끄면 정지해도 자동으로 멈추지 않는다 ────────────────
test('autoPause:false 면 장시간 정지에도 자동 일시정지가 걸리지 않는다', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, autoPause: false, shoe: {id: 's1', name: 'X'}, t0: 100000});
  let ts = 100000;
  const F = (lat: number) => {
    set(ts);
    t.ingestFix(fix(lat, LON, 5, ts));
  };
  F(37.5); ts += 2000; F(37.5); ts += 2000; F(37.5); ts += 2000;
  F(37.5003); // 실이동
  for (let i = 0; i < 12; i++) { ts += 3000; F(37.5003); } // 36s 정지
  expect(t.getState().autoPaused).toBe(false);
  expect(t.getState().paused).toBe(false);
  // 수동 일시정지는 여전히 동작한다.
  t.togglePause();
  expect(t.getState().paused).toBe(true);
});

// 회귀(2026-07-14): 수동 일시정지 중 GPS 무신호였다가 재개하면, 재개 직후 새 fix 가
// 오기 전까지 getElapsed 의 ongoingStallMs 가 '일시정지 창'을 진행 중 死구간으로 다시
// 빼버려(pausedMs 로 이미 뺀 창을 이중 차감) 경과시간이 0 으로 붕괴하고, 그 순간 정지·
// 저장하면 저장 시간까지 과소였다. exitPause 가 lastRecvMs=now 로 리셋해 막는다.
test('수동 일시정지 중 GPS 무신호 후 재개해도 경과시간이 붕괴하지 않는다(이중 차감 방지)', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  // 0~10초: 정상 수신(5초 간격 < 8초 임계 → stall 없음). lastRecvMs 가 계속 갱신된다.
  set(100000); t.ingestFix(fix(37.5, LON, 5, 100000));
  set(105000); t.ingestFix(fix(37.5, LON, 5, 105000));
  set(110000); t.ingestFix(fix(37.5, LON, 5, 110000));
  // 10초 지점에서 수동 일시정지.
  set(110000); t.togglePause();
  // 90초 동안 건물 안 — fix 0개(무신호). 그 사이 lastRecvMs 는 110000 에 머문다.
  set(200000);
  t.togglePause(); // 재개

  // 재개 직후(새 fix 전) 경과시간 = 실제 러닝 시간 ~10초. 0 으로 붕괴하면 회귀.
  const elapsed = t.getElapsed();
  expect(elapsed).toBeGreaterThanOrEqual(9);
  expect(elapsed).toBeLessThanOrEqual(11);
  // 그 순간 정지·저장해도 동일(getElapsedFinal = getElapsed).
  expect(t.getElapsedFinal()).toBe(elapsed);
});

describe('오토포즈 소급 정산 + 걸음 보조(2026-07-18 비교런 근본수정)', () => {
  // 신호대기 시나리오: 달리다가 멈추면 감지가 홀드/지터만큼 늦어도, 일시정지 시작이
  // '마지막 확실한 이동' 시점으로 소급돼 감지 지연이 경과시간에 쌓이지 않는다.
  test('감지 지연이 elapsed 에 쌓이지 않는다(마지막 이동 시점으로 소급)', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    // 워밍업 소진 + 이동 확립(1.4m/s 급 — 재개 임계 이상 → lastDefiniteMove 갱신).
    let ts = 100000;
    let lat = 37.5;
    for (let i = 0; i < 8; i++) {
      set(ts); t.ingestFix(fix(lat, LON, 5, ts));
      ts += 2000; lat += 0.000025; // ~2.8m / 2s ≈ 1.4 m/s
    }
    // 마지막 보폭의 '도착' fix(아래 정지 루프 첫 fix)까지가 이동 — 그 시각이 소급 앵커.
    const lastMoveTs = ts;
    // 정지: 같은 자리 fix 가 이어짐 — 지터 유령속도 없이 0m/s(간명 시나리오).
    // 홀드 3s + 표본 간격 때문에 감지는 몇 초 뒤 tick 에서 떨어진다.
    for (let i = 0; i < 4; i++) {
      set(ts); t.ingestFix(fix(lat, LON, 5, ts)); ts += 2000;
    }
    expect(t.pausedFlag()).toBe(true); // 오토포즈 진입
    // 소급 검증: 일시정지 8초 뒤 elapsed 는 '마지막 이동'까지의 러닝 시간과 같아야 한다
    // (감지 지연 몇 초가 러닝 시간으로 계상되면 실패 — 비교런 +30s 재현 케이스).
    set(ts + 8000);
    const runningSec = Math.floor((lastMoveTs - 100000) / 1000);
    expect(t.getElapsed()).toBeLessThanOrEqual(runningSec + 1); // 소급 성공(±1s 반올림)
    expect(t.getElapsed()).toBeGreaterThanOrEqual(runningSec - 1);
  });

  test('걸음 정지가 GPS 지터 유령 속도를 눌러 감지가 리셋되지 않는다', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    let ts = 100000;
    let lat = 37.5;
    for (let i = 0; i < 8; i++) {
      set(ts); t.ingestFix(fix(lat, LON, 5, ts));
      t.feedSteps(100 + i * 3, ts); // 달리는 동안 걸음 증가
      ts += 2000; lat += 0.000025;
    }
    // 정지: 걸음수 동결 공급 + GPS 는 지터로 0.9m/s 유령 이동(임계 0.6 이상 — 원래는
    // slowSec 리셋으로 영영 감지 못 하던 케이스).
    const stopSteps = 100 + 7 * 3;
    for (let i = 0; i < 6; i++) {
      set(ts);
      t.feedSteps(stopSteps, ts); // 걸음 안 늚
      t.ingestFix(fix(lat, LON, 5, ts));
      ts += 2000; lat += 0.0000162; // ~1.8m / 2s ≈ 0.9 m/s 유령
    }
    expect(t.pausedFlag()).toBe(true); // 걸음 보조 없인 불가능한 감지
  });

  test('수동 일시정지는 소급하지 않는다(누른 순간 그대로)', () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    let ts = 100000; let lat = 37.5;
    for (let i = 0; i < 8; i++) { set(ts); t.ingestFix(fix(lat, LON, 5, ts)); ts += 2000; lat += 0.000025; }
    set(ts);
    const beforePause = t.getElapsed();
    t.togglePause(); // 수동
    set(ts + 10000);
    expect(t.getElapsed()).toBe(beforePause); // 누른 시점에서 정지(소급 X)
  });
});

// ── #16 CMPedometer 死구간 융합 ─────────────────────────────────────────────
// 코어 원칙: GPS 가 정본, CMPedometer 는 GPS 死구간(stall)에서만 유실분을 메운다.
// 순수 가산 + 死구간 한정이라 이중계산 불가·GPS 경로 회귀 0. Iron Law: 단조 증가.
describe('feedPedometerDistance — CMPedometer 死구간 융합(#16)', () => {
  test('GPS 死구간에서만 보행거리로 메운다(첫 표본=기준, 이후 델타 가산)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t); // lastRecvMs=100000, firstFixEmitted=true, dist=0
    const d0 = t.getDistanceKm();
    t.feedPedometerDistance(1000, 100000); // 첫 표본 = 기준(가산 없음)
    expect(t.getDistanceKm()).toBe(d0);
    expect(t.getPedometerFillKm()).toBe(0);
    t.feedPedometerDistance(1050, 109000); // gap 9000>8000 → 死구간, +50m 채움
    expect(t.getPedometerFillKm()).toBeCloseTo(0.05, 6);
    expect(t.getDistanceKm()).toBeCloseTo(d0 + 0.05, 6);
  });

  test('GPS 정상(비stall) 구간에선 더하지 않는다(이중계산 방지)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.feedPedometerDistance(1000, 100000); // 기준
    t.feedPedometerDistance(1200, 103000); // gap 3000<8000 → GPS 적산 중이라 무시
    expect(t.getPedometerFillKm()).toBe(0);
  });

  test('첫 GPS fix 이전엔 융합하지 않는다(콜드스타트 대체 금지)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.feedPedometerDistance(1000, 100000);
    t.feedPedometerDistance(2000, 200000); // 시간이 흘러도 fix 없으면 무시
    expect(t.getDistanceKm()).toBe(0);
    expect(t.getPedometerFillKm()).toBe(0);
  });

  test('일시정지 중엔 융합하지 않고, 재개 시 catch-up 점프도 없다', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.feedPedometerDistance(1000, 100000); // 기준
    t.togglePause();
    t.feedPedometerDistance(1300, 110000); // 死구간이지만 일시정지 → 무시(기준만 흡수)
    expect(t.getPedometerFillKm()).toBe(0);
    t.togglePause();
    t.feedPedometerDistance(1320, 120000); // 재개 후 +20m 만 메운다(1300→1320)
    expect(t.getPedometerFillKm()).toBeCloseTo(0.02, 6);
  });

  test('센서 리셋(감소)·음수·NaN 은 안전하게 무시(단조 증가·throw 없음)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.feedPedometerDistance(1000, 100000);
    const before = t.getDistanceKm();
    t.feedPedometerDistance(-5, 109000);   // 음수 무시
    t.feedPedometerDistance(NaN, 109000);  // NaN 무시
    t.feedPedometerDistance(500, 109000);  // 리셋(감소) → 기준만 갱신, 가산 없음
    expect(t.getDistanceKm()).toBe(before);
    expect(t.getPedometerFillKm()).toBe(0);
    t.feedPedometerDistance(560, 110000);  // 새 기준(500)에서 +60m
    expect(t.getPedometerFillKm()).toBeCloseTo(0.06, 6);
  });
});

// ── 스냅샷 쓰기 스로틀(2026-07-26 성능) ────────────────────────────────────────
// persist() 는 ingestFix(≈1Hz)와 3초 인터벌 양쪽에서 불린다. 이전엔 부를 때마다 무조건
// 경로 전체를 복제·직렬화·기록해, 비용이 러닝 길이에 비례해 커지며 JS 스레드를 막았다.
// 지금은 스칼라 3초 · 경로 15초로 스스로 조절한다. 아래는 그 계약을 관측 가능한 결과
// (AsyncStorage 에 실제로 쓰인 키/값)로 고정한다.
describe('스냅샷 쓰기 스로틀', () => {
  const flush = () => new Promise(r => setImmediate(r));
  const readState = async () => {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : null;
  };
  const readRoute = async () => {
    const raw = await AsyncStorage.getItem(ROUTE_KEY);
    return raw ? JSON.parse(raw) : null;
  };

  beforeEach(async () => { await AsyncStorage.clear(); });

  test('러닝 시작 직후 첫 저장은 스로틀되지 않는다(시작 직후 크래시가 가장 위험)', async () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.persist();
    await flush();
    expect(await readState()).not.toBeNull();
  });

  test('스칼라는 3초 주기로만 실제 기록된다(그 사이 호출은 무시)', async () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.persist();                    // 첫 저장(dist 0)
    await flush();

    set(101000);                    // +1초 — 스로틀 구간
    t.persist();
    await flush();
    const at1s = await readState();

    set(104000);                    // +4초 — 주기 경과
    t.persist();
    await flush();
    const at4s = await readState();

    // 1초 시점 호출은 기록을 갱신하지 않았고(savedAt 동일), 4초 시점엔 갱신됐다.
    expect(at1s.savedAt).toBe(100000);
    expect(at4s.savedAt).toBe(104000);
  });

  test('경로는 15초 주기 — 그 사이 스칼라만 갱신돼도 경로 키는 유지된다', async () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.persist();
    await flush();
    const first = await readRoute();
    expect(Array.isArray(first)).toBe(true);

    // +5초: 스칼라 주기는 지났지만 경로 주기(15초)는 아직 — 경로는 그대로 남아 있어야 한다.
    set(105000);
    t.persist();
    await flush();
    expect(await readRoute()).toEqual(first);
    expect((await readState()).savedAt).toBe(105000); // 스칼라는 갱신됨
  });

  test('일시정지·정지는 스로틀을 무시하고 즉시 확정한다', async () => {
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.persist();
    await flush();

    set(100500);      // 스로틀 한참 안쪽(0.5초)
    t.togglePause();   // 사용자가 앱을 내릴 확률이 가장 높은 순간 → force 저장
    await flush();
    expect((await readState()).savedAt).toBe(100500);
  });
});

// ── 경로 접근자 계약(2026-07-26 F-02) ─────────────────────────────────────────
// getPoints() 가 내부 배열을 그대로 돌려주던 시절엔 소비자가 변화를 관측할 수 없었다 —
// 엔진은 push 로 제자리 변형하므로 참조가 늘 같고, React 는 Object.is 로 '안 바뀜'으로
// 판단해 리렌더를 건너뛴다(그 상태에서 memo 를 붙이면 지도가 영영 멈춘다).
// 대신 복사는 비싸므로, 개수·양끝만 필요한 소비자(트랙 자동랩)용 접근자를 따로 둔다.
describe('경로 접근자', () => {
  test('getPoints 는 복사본이라 소비자가 엔진 내부를 오염시킬 수 없다', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);

    const a = t.getPoints();
    expect(a.length).toBeGreaterThan(0);
    a.push({lat: 0, lon: 0}); // 소비자가 반환값을 건드려도
    expect(t.getPointCount()).toBe(a.length - 1); // 엔진은 영향받지 않는다
  });

  test('새 fix 가 들어오면 getPoints 는 이전과 다른 참조를 준다(리렌더가 걸린다)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);

    const before = t.getPoints();
    t.ingestFix(fix(37.5009, LON, 5, 106000));
    const after = t.getPoints();
    expect(after).not.toBe(before); // 참조가 다르다 = React 가 변화를 본다
    expect(after.length).toBeGreaterThan(before.length);
  });

  test('개수·첫점·끝점 접근자는 배열 복사 없이 같은 값을 준다', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.ingestFix(fix(37.5009, LON, 5, 106000));

    const pts = t.getPoints();
    expect(t.getPointCount()).toBe(pts.length);
    expect(t.getFirstPoint()).toEqual(pts[0]);
    expect(t.getLastPoint()).toEqual(pts[pts.length - 1]);
  });

  test('경로가 비면 첫점·끝점은 null(호출부가 옵셔널 체이닝 없이 분기할 수 있게)', () => {
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    expect(t.getPointCount()).toBe(0);
    expect(t.getFirstPoint()).toBeNull();
    expect(t.getLastPoint()).toBeNull();
  });
});

// ── 스냅샷 쓰기 실패 계측(2026-07-26 F-04) ───────────────────────────────────
// 저장이 실패하면 '크래시 복구 불가 상태로 달리고 있다'는 뜻이다. 이전엔 .catch(()=>{})
// 로 흔적 없이 사라져, "러닝이 통째로 없어졌다"는 CS 의 원인을 추적할 수 없었다.
// 동시에 관측성 코드가 러닝을 막아서도 안 된다(throw 금지).
describe('스냅샷 쓰기 실패', () => {
  test('저장이 실패하면 원격 계측에 남고, 엔진은 계속 달린다', async () => {
    const {recordError: fbRecordError} = require('@react-native-firebase/crashlytics');
    (fbRecordError as jest.Mock).mockClear();
    const spy = jest
      .spyOn(AsyncStorage, 'setMany')
      .mockRejectedValueOnce(new Error('storage full'));

    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    t.persist();
    await new Promise(r => setImmediate(r));

    expect(fbRecordError).toHaveBeenCalled();
    // 실패해도 엔진은 살아 있다(거리 누적 계속).
    clearWarmup(t);
    expect(t.isActive()).toBe(true);

    spy.mockRestore();
  });
});

// ── 백업 실패 경고(2026-07-26 생명주기 감사) ──────────────────────────────────
// 저장이 실패해도 러닝은 계속돼야 한다(앱이 죽는 것보다 낫다). 하지만 그건 **크래시 복구가
// 불가능한 상태로 달리는 중**이라는 뜻이고, 폰이 꺼지면 그 러닝은 사라진다. 사용자가
// 알아야 조치(저장 공간 정리)할 수 있으므로 화면에 한 줄로 알린다.
// 한 번의 실패는 일시적일 수 있어 즉시 경고하지 않는다(연속 3회부터).
describe('스냅샷 저장 연속 실패 경고', () => {
  const flush = () => new Promise(r => setImmediate(r));

  test('실패해도 러닝은 계속된다(거리 누적 불변)', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setMany').mockRejectedValue(new Error('SQLITE_FULL'));
    const {t} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    clearWarmup(t);
    t.persist();
    await flush();
    expect(t.isActive()).toBe(true);
    spy.mockRestore();
  });

  test('1~2회 실패는 경고하지 않고, 3회째부터 snapshotFailing 이 참이다', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setMany').mockRejectedValue(new Error('SQLITE_FULL'));
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});

    t.persist(); await flush();
    expect(t.getState().snapshotFailing).toBe(false);
    set(104000); t.persist(); await flush();
    expect(t.getState().snapshotFailing).toBe(false);
    set(108000); t.persist(); await flush();
    expect(t.getState().snapshotFailing).toBe(true);

    spy.mockRestore();
  });

  test('한 번이라도 저장에 성공하면 경고가 내려간다(일시적 실패에서 회복)', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setMany').mockRejectedValue(new Error('SQLITE_FULL'));
    const {t, set} = makeEngine();
    t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
    for (const at of [100000, 104000, 108000]) {
      set(at); t.persist();

      await flush();
    }
    expect(t.getState().snapshotFailing).toBe(true);

    spy.mockRestore(); // 저장 공간 확보됨
    set(112000); t.persist(); await flush();
    expect(t.getState().snapshotFailing).toBe(false);
  });
});
