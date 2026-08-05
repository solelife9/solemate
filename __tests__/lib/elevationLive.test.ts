/**
 * 러닝 중 실시간 고도 누적 — 상승률 상한이 **실제로 작동하는가**.
 *
 * 왜 이 파일이 생겼나(2026-08-05 실측):
 *   같은 러닝을 두 기기가 재고 서버 백업을 열어 봤더니 —
 *     안드로이드   구간 고도 7 / 13 / 12 / 0 / 0 m      합계   32 m   (NRC 38m 과 일치)
 *     아이폰      구간 고도 359 / 311 / 283 / 372 / 446 m  합계 1,814 m
 *   5km 러닝에 1,814m 는 63층 건물을 매 km 오른 셈이다.
 *
 * `lib/elevation` 에는 2026-08-04 에 상승률 상한(분당 30m 초과 = 센서 이상)이 들어갔는데,
 * **그 상한은 `atMs` 를 받았을 때만 작동**한다. 그런데 `lib/runTracker` 의 호출부 세 곳이
 * 전부 시각을 넘기지 않아 상한이 통째로 잠들어 있었다 — 임계 히스테리시스(±3m)만 남고,
 * 그건 파일 주석이 스스로 "구조적 약점"이라 적어둔 상태다: 1Hz 표본이 임계 근처에서
 * 진동하면 **올라갈 때마다 적립되고 내려갈 때는 기준만 낮아진다.**
 *
 * 그래서 이 테스트는 `lib/elevation` 이 아니라 **엔진을 통해** 검증한다. 순수 함수만
 * 검증하면 인자를 안 넘기는 이번 같은 버그를 영영 못 잡는다.
 *
 * @format
 */

import {RunTracker, RawFix} from '../../lib/runTracker';

const LON = 127.0;
const LAT0 = 37.5;
/** 위도 1도 ≈ 111km → 5m ≈ 0.000045도. 1초에 5m = 6'40"/km 페이스. */
const STEP_DEG = 0.000045;

function fix(lat: number, alt: number | null, ts: number): RawFix {
  return {
    coords: {latitude: lat, longitude: LON, accuracy: 5, altitude: alt},
    timestamp: ts,
  } as RawFix;
}

function makeEngine() {
  const t = new RunTracker();
  let clock = 100000;
  t.setNow(() => clock);
  return {t, set: (v: number) => (clock = v)};
}

/** 워밍업 3픽스를 같은 자리에서 흘려보낸다(거리·고도 미계상 구간). */
function warmup(t: RunTracker, alt: number) {
  t.ingestFix(fix(LAT0, alt, 100000));
  t.ingestFix(fix(LAT0, alt, 101000));
  t.ingestFix(fix(LAT0, alt, 102000));
}

/**
 * 1Hz 로 앞으로 달리면서 고도만 흔든다.
 * @param swingM 진동 폭(m). 임계(3m)보다 커야 옛 코드에서 적립됐다.
 */
function runWithJitter(t: RunTracker, set: (v: number) => void, seconds: number, swingM: number) {
  const base = 100;
  for (let i = 0; i < seconds; i++) {
    const ts = 103000 + i * 1000;
    set(ts);
    t.ingestFix(fix(LAT0 + STEP_DEG * (i + 1), base + (i % 2 === 0 ? 0 : swingM), ts));
  }
}

test('평지에서 1Hz 고도 잡음이 진동해도 상승분이 쌓이지 않는다 (상승률 상한 활성)', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  warmup(t, 100);

  // 30분치. 8m 진동은 임계(3m)를 넘으므로 상한이 없으면 매 상승마다 적립된다.
  runWithJitter(t, set, 1800, 8);

  const gain = t.getElevationGain();
  // 상한이 없던 시절: 900회 상승 × 8m ≈ 7,200m. 지금은 사람이 낼 수 없는 상승률
  // (8m/1s = 480m/분)이라 전부 기준만 옮기고 버린다.
  expect(gain).toBeLessThan(50);
});

test('진짜 오르막(분당 20m)은 그대로 집계된다 — 상한이 실제 등반을 깎지 않는다', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  warmup(t, 100);

  // 10분 동안 분당 20m 상승(총 200m) — 사람이 낼 수 있는 범위(상한 30m/분) 안.
  const base = 100;
  for (let i = 0; i < 600; i++) {
    const ts = 103000 + i * 1000;
    set(ts);
    t.ingestFix(fix(LAT0 + STEP_DEG * (i + 1), base + (i * 20) / 60, ts));
  }

  const gain = t.getElevationGain();
  // 임계 히스테리시스라 3m 단위로 끊겨 약간 모자라게 잡힌다 — 실제 200m 의 80% 이상이면 충분.
  expect(gain).toBeGreaterThan(160);
  expect(gain).toBeLessThan(240);
});

test('고도가 없는 기기(altitude=null)에서도 깨지지 않는다', () => {
  const {t, set} = makeEngine();
  t.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  warmup(t, 100);
  for (let i = 0; i < 60; i++) {
    const ts = 103000 + i * 1000;
    set(ts);
    t.ingestFix(fix(LAT0 + STEP_DEG * (i + 1), null, ts));
  }
  expect(t.getElevationGain()).toBe(0);
});
