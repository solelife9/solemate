/**
 * App.tsx auto-pause/resume integration tests.
 *
 * Drives the real App to the live-run screen, then injects synthetic GPS fixes
 * through the registered watchPosition callback (same harness as
 * App.gps.test.tsx). Assertions are on observable run-screen state — the live
 * status label ("자동 일시정지") and the displayed distance — so they verify the
 * end-to-end wiring of lib/autoPause's decideAutoPause into the run engine:
 *
 *   1) Standing still for >3s auto-pauses the run (label flips to 자동 일시정지).
 *   2) While paused, distance does NOT accumulate (the audit#4 / freeze fix).
 *   3) The displayed elapsed timer freezes while paused — it does not advance and
 *      never goes negative/garbage (audit#4: elapsed = max(0, now-t0-pausedMs)
 *      with the pauseStartRef guard, verified here at the App/UI level).
 *   4) After auto-resume both the distance engine AND the clock restart — km()
 *      climbs above the paused value (guards the "label clears but engine stays
 *      frozen" bug).
 *
 * Cadence is intentionally out of scope here: 케이던스는 일시정지 그리드에서
 * 제거됐다(2026-07-12 사용자 확정 — 완주 리캡 전용). 여기서는 자동일시정지 화면에
 * 케이던스 지표가 등장하지 않는다는 '부재'만 가드한다(값 검증은 App.cadence.test).
 *
 * @format
 */

import React from 'react';
import {runTracker} from '../lib/runTracker';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) {
      body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

function readKm(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d+\.\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('km readout not found');
  return parseFloat(node.props.children as string);
}

// Read the displayed elapsed timer (fmtTime → "MM:SS" while under an hour) and
// return it as whole seconds. fmtPace renders as `m'ss"` (apostrophe/quote, no
// colon) so the MM:SS shape is unique to the time metric on the run screen.
function readElapsedSec(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d{1,2}:\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('elapsed readout not found');
  const [m, s] = (node.props.children as string).trim().split(':').map(Number);
  return m * 60 + s;
}

const isAutoPaused = (root: ReactTestRenderer.ReactTestInstance) =>
  textOf(root).includes('자동 일시정지');

async function startRun() {
  mockBackendWithShoe();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]); // Stage 3: 부팅 캐시 시드
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // home → goal
  // 2nd 프레스가 카운트다운(준비·3·2·1·GO)을 띄운다. onDone 타이머를 제어하려면
  // 카운트다운이 fake 타이머 하에서 mount/advance 돼야 하므로, 이 헬퍼가 real/fake
  // 양쪽 테스트에서 불리는 점을 고려해 진입 동안만 fake 를 보장하고 원복한다.
  const fakeAlready = typeof (setTimeout as any).clock === 'object';
  if (!fakeAlready) jest.useFakeTimers();
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(onDone)
  });
  if (!fakeAlready) jest.useRealTimers();

  const calls = (Location.watchPositionAsync as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  // expo watchPositionAsync(options, callback, errorHandler) → callback is arg 1.
  const onPos = calls[calls.length - 1][1] as (p: any) => void;

  // GPS fix 의 timestamp 는 **앱과 같은 시계**(epoch ms)다 — 엔진이 '런 시작 이전 시각의
  // 위치 = 캐시된 위치'를 버린다(2026-08-10, 지도가 엉뚱한 곳에서 시작하던 버그). 테스트도
  // 그 현실을 그대로 모델링해야 한다.
  //
  // 기준을 `Date.now()` 로 잡으면 안 된다: 위 카운트다운이 가짜 타이머로 6초를 진행시킨
  // 뒤 실제 시계로 돌아오므로, 런 시작 시각이 '지금'보다 **미래**에 있다. 실제 시작
  // 시각을 읽어 기준으로 삼는다. 호출부는 100000·102000 같은 읽기 쉬운 상대 시각을 그대로 쓴다.
  const tsBase = runTracker.getStartMs() - 100000;
  const emit = (lat: number, lon: number, accuracy: number, timestamp: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: lon, accuracy}, timestamp: tsBase + timestamp});
    });

  return {renderer, root, emit, km: () => readKm(root)};
}

const LON = 127.0;

test('standing still for over 3s auto-pauses the run', async () => {
  const {renderer, root, emit} = await startRun();

  // Warmup at P0 (idx0..2) then one real move so the run is genuinely running.
  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5003, LON, 5, (t += 2000)); // ~33m move → counts as motion
  expect(isAutoPaused(root)).toBe(false);

  // Now stand still: many fixes at the same point, 3s apart. Once the Kalman
  // residual settles below the 0.6 m/s floor, slowSec crosses the 3s hold → pause.
  for (let i = 0; i < 12; i++) {
    await emit(37.5003, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);

  act(() => renderer.unmount());
});

test('distance does not accumulate while auto-paused, then auto-resumes on sustained movement', async () => {
  const {renderer, root, emit, km} = await startRun();

  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5003, LON, 5, (t += 2000));
  for (let i = 0; i < 12; i++) {
    await emit(37.5003, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);
  const kmAtPause = km();

  // A moving fix while paused but BELOW the 1s resume hold (dt=0.8s): the run must
  // stay paused AND must not add distance (accumulation is frozen during pause).
  await emit(37.50035, LON, 5, (t += 800)); // ~6m in 0.8s → fast, fastSec=0.8 < 1
  expect(isAutoPaused(root)).toBe(true);
  expect(km()).toBe(kmAtPause);

  // A second moving fix pushes sustained fast time past 1s → auto-resume.
  await emit(37.5004, LON, 5, (t += 800)); // fastSec ≥ 1 → resume
  expect(isAutoPaused(root)).toBe(false);

  act(() => renderer.unmount());
});

test('displayed elapsed timer freezes while auto-paused — never advances, never negative/garbage', async () => {
  // Fake timers let us drive the once-per-second elapsed interval and the
  // Date.now() clock it reads (elapsed = max(0, now - t0 - pausedMs)). The GPS
  // fixes below use their own pos.timestamp axis (independent of Date.now), so
  // the auto-pause machine and the wall clock advance separately — exactly as on
  // device. We anchor system time to the fixes' base so t0 ≈ 100000.
  jest.useFakeTimers();
  jest.setSystemTime(100000);
  try {
    const {renderer, root, emit} = await startRun();

    // Warmup at P0 then one real move so the run is genuinely running.
    let t = 100000;
    await emit(37.5, LON, 5, t);
    await emit(37.5, LON, 5, (t += 2000));
    await emit(37.5, LON, 5, (t += 2000));
    await emit(37.5003, LON, 5, (t += 2000));
    expect(isAutoPaused(root)).toBe(false);

    // Advance the wall clock 10s while RUNNING: the interval must move the timer
    // forward (proving it is live before we pause it).
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    const elapsedRunning = readElapsedSec(root);
    expect(elapsedRunning).toBeGreaterThan(0);

    // Stand still → auto-pause. These fixes only advance pos.timestamp, not the
    // wall clock. NOTE(#3): when a fix arrives after a >threshold no-fix window and
    // its segment is counted, the engine no longer subtracts that window as GPS
    // "stall" (counted distance ⇒ real running time ⇒ time must count). So the
    // earlier ongoing-stall (the 10s wall advance with no fix) reconciles into
    // elapsed here — elapsedAtPause may step UP to the true run time, never down.
    // The timer must not regress, must be a finite integer, and (the real point of
    // this test) must FREEZE for the paused window asserted below.
    for (let i = 0; i < 12; i++) {
      await emit(37.5003, LON, 5, (t += 3000));
    }
    expect(isAutoPaused(root)).toBe(true);
    const elapsedAtPause = readElapsedSec(root);
    // 계약 진화(2026-07-18 소급 정산): 오토포즈 전환 '순간'에는 감지 지연분(상한 10s)만큼
    // 타이머가 뒤로 정리될 수 있다 — 멈춘 시점부터 일시정지로 계상하는 정확 회계(비교런
    // +30s 근본수정). 여전히 음수/쓰레기 금지·상한 밖 되감김 금지, 이후 동결은 불변.
    // 2026-08-10: 단언을 양방향 밴드로 고쳤다. 바로 위 NOTE(#3)가 이미 "elapsedAtPause
    // may step UP to the true run time" 이라고 적어 뒀는데 단언은 `<= elapsedRunning`,
    // 즉 **위로는 못 간다**로 걸려 있었다. 서로 반대였다.
    //
    // 그게 통과하던 이유가 따로 있었다: 이 파일의 fix 시각이 앱 시계와 다른 기준이라
    // (100000 vs Date.now()), 소급 정산의 `max(pauseStart − 10s, lastDefiniteMove)` 가
    // **언제나 하한(10s 되감기)에 붙었다.** 즉 소급 정산 경로가 한 번도 진짜로 실행된 적이
    // 없었고, 단언은 그 부작용을 계약으로 굳혀 두고 있었다. 시계를 현실화하니 드러났다.
    //
    // 진짜 계약: 전환 순간엔 감지 지연분(상한 10s)만큼 뒤로 정리되거나, 스톨로 잡아 뒀던
    // 시간이 실제 러닝 시간으로 되돌아오며 앞으로 갈 수 있다. 어느 쪽이든 그 밴드 밖으로
    // 튀면 안 되고, **이후 동결**(아래)이 이 테스트의 본론이다.
    expect(Math.abs(elapsedAtPause - elapsedRunning)).toBeLessThanOrEqual(10);
    expect(elapsedAtPause).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(elapsedAtPause)).toBe(true);

    // Now burn 30s of wall time WHILE PAUSED. The interval keeps firing but the
    // pauseStartRef-guarded branch must not setElapsed → the displayed timer is
    // frozen, stays non-negative, and is a finite integer (not NaN/garbage).
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    const elapsedWhilePaused = readElapsedSec(root);
    expect(elapsedWhilePaused).toBe(elapsedAtPause); // frozen — did not advance
    expect(elapsedWhilePaused).toBeGreaterThanOrEqual(0); // never negative
    expect(Number.isInteger(elapsedWhilePaused)).toBe(true); // not garbage/NaN

    // 케이던스는 일시정지 그리드에서 제거됐다(2026-07-12 사용자 확정 — 완주 리캡 전용).
    // 자동일시정지 화면에 케이던스 지표가 값을 날조해 등장하지 않는지(부재)를 가드한다.
    expect(
      root.findAll(n => typeof n.type === 'string').some(n => textOf(n) === '케이던스'),
    ).toBe(false);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

test('distance engine restarts after auto-resume — km climbs above the paused value (not just the label clearing)', async () => {
  const {renderer, root, emit, km} = await startRun();

  // Warmup at P0, then an accepted ~22m/6s move(5점 평활 버퍼로 들어간다).
  let t = 100000;
  await emit(37.5, LON, 5, t);
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5, LON, 5, (t += 2000));
  await emit(37.5002, LON, 5, (t += 6000)); // ~22m over 6s ≈ 3.7 m/s → accepted

  // Stand still → auto-pause. 일시정지 = 구간 경계라 평활 꼬리(위 22m)가 flush 로
  // 계상돼 km > 0, 정지 동안 그 값에 동결된다.
  for (let i = 0; i < 12; i++) {
    await emit(37.5002, LON, 5, (t += 3000));
  }
  expect(isAutoPaused(root)).toBe(true);
  const kmAtPause = km();
  expect(kmAtPause).toBeGreaterThan(0);
  await emit(37.5002, LON, 5, (t += 3000)); // 정지 중 추가 fix — 여전히 동결
  expect(km()).toBe(kmAtPause);

  // Two sustained fast fixes (>1.0 m/s for ≥1s) → auto-resume.
  await emit(37.50025, LON, 5, (t += 800)); // ~6m/0.8s fast, fastSec 0.8 < 1 → still paused
  expect(isAutoPaused(root)).toBe(true);
  await emit(37.5003, LON, 5, (t += 800)); // fastSec ≥ 1 → resume
  expect(isAutoPaused(root)).toBe(false);

  // A further accepted move after resume must accumulate: if the engine were
  // frozen (label-only resume bug), km() would stay at kmAtPause forever.
  // (5점 평활 + 정지 후 재가속은 칼만이 몇 fix 에 걸쳐 따라잡으므로, 실제 러닝
  //  속도(~4.8 m/s — 11 m/s 같은 스프린트를 쓰면 따라잡기 구간 속도가 12 m/s
  //  점프 컷을 스쳐 거부된다)로 연속 fix 를 보내 확정 증가를 검증한다.)
  await emit(37.50043, LON, 5, (t += 3000)); // ~14.5m/3s ≈ 4.8 m/s
  await emit(37.50056, LON, 5, (t += 3000));
  await emit(37.50069, LON, 5, (t += 3000));
  await emit(37.50082, LON, 5, (t += 3000));
  expect(km()).toBeGreaterThan(kmAtPause);

  act(() => renderer.unmount());
});
