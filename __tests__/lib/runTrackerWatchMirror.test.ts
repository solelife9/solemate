/**
 * 폰+워치 동시 러닝 — **진짜 미러링**(2026-08-09).
 *
 * 예전엔 폰으로 시작해도 워치가 자기 워크아웃을 독립적으로 돌렸다. 미러링이 아니라
 * **두 기기가 각자 잰 것**이라:
 *   · 러닝 중 두 화면이 다른 숫자를 보여줬다(실측 폰 5.14 / 워치 5.358)
 *   · 종료 시 병합에서 워치 값이 이겨 **본 것과 남는 것이 달라졌다**
 *
 * 업계는 기록자를 시작할 때 하나로 정한다(애플=워치 전용, 가민=시계, 스트라바=겹치면 거부).
 * 그래서 워치가 붙어 있으면 워치가 기록자다.
 *
 * 이 스위트가 지키는 것은 그 규칙 자체보다 **Iron Law** 다 — 거리는 줄지 않고, 유실되지 않고,
 * 워치가 끊겨도 얼어붙지 않는다.
 * @format
 */
import {RunTracker} from '../../lib/runTracker';

const S = 1000;
let now = 1_000_000;
const setNow = (t: number) => {
  now = t;
};

function mk(): RunTracker {
  const t = new RunTracker();
  t.setNow(() => now);
  t.start({goalKm: 0, goalMin: 0, shoe: {id: 's1', name: 'Test'}});
  return t;
}

beforeEach(() => setNow(1_000_000));

describe('워치가 기록자다', () => {
  test('워치 거리가 그대로 폰 거리가 된다 — 두 화면이 같아진다', () => {
    const t = mk();
    t.feedWatchDistance(1.234, now);
    expect(t.getDistanceKm()).toBeCloseTo(1.234, 6);
    expect(t.getDistanceSource()).toBe('watch');
  });

  test('워치가 없으면 폰이 기록자다', () => {
    const t = mk();
    expect(t.getDistanceSource()).toBe('phone');
  });
});

describe('★ Iron Law — 거리는 줄지 않는다', () => {
  test('워치가 더 작은 값을 보내면 무시한다', () => {
    const t = mk();
    t.feedWatchDistance(3.0, now);
    t.feedWatchDistance(2.0, now + S);   // 역행 표본
    expect(t.getDistanceKm()).toBeCloseTo(3.0, 6);
  });

  test('같은 값을 반복해도 늘지 않는다(중복 배달)', () => {
    const t = mk();
    t.feedWatchDistance(2.5, now);
    t.feedWatchDistance(2.5, now + S);
    t.feedWatchDistance(2.5, now + 2 * S);
    expect(t.getDistanceKm()).toBeCloseTo(2.5, 6);
  });

  test.each([
    ['0', 0], ['음수', -1], ['NaN', NaN], ['Infinity', Infinity],
  ])('%s 는 버린다', (_l, v) => {
    const t = mk();
    t.feedWatchDistance(1.0, now);
    t.feedWatchDistance(v as number, now + S);
    expect(t.getDistanceKm()).toBeCloseTo(1.0, 6);
  });
});

describe('일시정지 중에는 받지 않는다', () => {
  test('정지 구간의 워치 거리는 무시된다', () => {
    const t = mk();
    t.feedWatchDistance(1.0, now);
    t.togglePause();
    expect(t.pausedFlag()).toBe(true);
    t.feedWatchDistance(5.0, now + S);
    expect(t.getDistanceKm()).toBeCloseTo(1.0, 6);
  });

  test('재개하면 다시 받는다', () => {
    const t = mk();
    t.feedWatchDistance(1.0, now);
    t.togglePause();
    t.feedWatchDistance(5.0, now + S);
    t.togglePause();
    expect(t.pausedFlag()).toBe(false);
    t.feedWatchDistance(1.8, now + 2 * S);
    expect(t.getDistanceKm()).toBeCloseTo(1.8, 6);
  });
});

describe('★ 워치가 끊기면 폰이 이어받는다 — 얼어붙지 않는다', () => {
  test('마지막 표본 뒤 20초가 지나면 기록자가 폰으로 돌아온다', () => {
    const t = mk();
    t.feedWatchDistance(2.0, now);
    expect(t.getDistanceSource()).toBe('watch');

    setNow(now + 19_000);
    expect(t.getDistanceSource()).toBe('watch');   // 아직 살아 있다

    setNow(now + 21_000);
    expect(t.getDistanceSource()).toBe('phone');   // 끊긴 것으로 본다
  });

  test('폰이 이어받아도 그때까지의 거리는 그대로다 — 되돌아가지 않는다', () => {
    const t = mk();
    const base = now;
    t.feedWatchDistance(4.2, base);
    setNow(base + 30_000);
    expect(t.getDistanceSource()).toBe('phone');
    expect(t.getDistanceKm()).toBeCloseTo(4.2, 6);  // 유실 0
  });

  test('워치가 돌아오면 다시 기록자가 된다', () => {
    const t = mk();
    const base = now;
    t.feedWatchDistance(4.2, base);
    setNow(base + 30_000);
    expect(t.getDistanceSource()).toBe('phone');
    t.feedWatchDistance(4.9, now);
    expect(t.getDistanceSource()).toBe('watch');
    expect(t.getDistanceKm()).toBeCloseTo(4.9, 6);
  });
});

describe('★ 새 러닝이 지난 거리에서 시작하지 않는다', () => {
  test('start() 가 워치 상태를 지운다', () => {
    const t = mk();
    t.feedWatchDistance(7.5, now);
    expect(t.getDistanceKm()).toBeCloseTo(7.5, 6);

    t.start({goalKm: 0, goalMin: 0, shoe: {id: 's1', name: 'Test'}});
    expect(t.getDistanceKm()).toBe(0);
    expect(t.getDistanceSource()).toBe('phone');

    // 지난 런보다 작은 값도 정상 채택돼야 한다(누적 기준이 리셋됐으므로).
    t.feedWatchDistance(0.3, now + S);
    expect(t.getDistanceKm()).toBeCloseTo(0.3, 6);
  });
});

describe('러닝 중이 아닐 때는 받지 않는다', () => {
  test('start 전에는 무시', () => {
    const t = new RunTracker();
    t.setNow(() => now);
    t.feedWatchDistance(3, now);
    expect(t.getDistanceKm()).toBe(0);
  });
});

describe('★ 폰 값을 가리지 않는다 — 정확도를 계속 잴 수 있어야 한다', () => {
  // 워치를 찰 때마다 폰 값이 사라지면 폰 GPS 가 얼마나 정확한지 영영 못 잰다.
  // 그러면 "폰이 워치보다 3% 짧다" 같은 걸 알아내 보정할 근거 자체가 없어진다.
  // 워치는 폰 정확도를 가리는 뚜껑이 아니라 대조할 기준선이어야 한다.
  const LON = 127.0;
  const fix = (lat: number, ts: number) =>
    ({coords: {latitude: lat, longitude: LON, accuracy: 5}, timestamp: ts} as never);

  /**
   * 워밍업(첫 3픽스는 거리 미계상) 후 북쪽으로 n 스텝 이동시킨다.
   * 한 스텝 = 위도 0.0001° ≈ 11m, 2초 간격 → 약 5.5m/s(3'02"/km). 엘리트지만 사람 범위다.
   * ⚠️ 더 크게 잡으면 엔진이 "사람이 낼 수 없는 속도"로 걸러 거리가 0 이 된다
   *    (MAX_SEG_SPEED_MPS=12). 처음에 0.0005°(2초에 55m = 시속 100km)로 짰다가 겪었다.
   */
  function walk(t: RunTracker, n: number, fromTs: number) {
    t.ingestFix(fix(37.5, fromTs));
    t.ingestFix(fix(37.5, fromTs + 2000));
    t.ingestFix(fix(37.5, fromTs + 4000));
    for (let i = 1; i <= n; i++) t.ingestFix(fix(37.5 + i * 0.0001, fromTs + 4000 + i * 2000));
  }

  test('워치가 기록자여도 폰은 자기 거리를 계속 센다', () => {
    const t = mk();
    walk(t, 6, now);
    const phoneBefore = t.getPhoneDistanceKm();
    expect(phoneBefore).toBeGreaterThan(0);

    // 워치가 기록자가 된다 — 화면 거리는 워치 값으로 간다.
    t.feedWatchDistance(99, now);
    expect(t.getDistanceKm()).toBeCloseTo(99, 6);

    // 그래도 폰은 계속 잰다.
    walk(t, 6, now + 40_000);
    expect(t.getPhoneDistanceKm()).toBeGreaterThan(phoneBefore);
    // 그리고 그 값은 워치 값(99km)에 오염되지 않는다.
    expect(t.getPhoneDistanceKm()).toBeLessThan(10);
  });

  test('워치가 없으면 두 값이 같다', () => {
    const t = mk();
    walk(t, 6, now);
    expect(t.getPhoneDistanceKm()).toBeCloseTo(t.getDistanceKm(), 9);
  });

  test('새 러닝에서 폰 값도 0 으로 돌아간다', () => {
    const t = mk();
    walk(t, 4, now);
    expect(t.getPhoneDistanceKm()).toBeGreaterThan(0);
    t.start({goalKm: 0, goalMin: 0, shoe: {id: 's1', name: 'Test'}});
    expect(t.getPhoneDistanceKm()).toBe(0);
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 엔진만 맞고 채널이 안 이어지면 화면은 여전히 폰 값을 보여준다 — 눈으로는 워치를 차고
// 뛰어 봐야 알고, 그건 TestFlight 를 거쳐야 한다. 소스 레벨로 못 박는다.
describe('배선 — 워치 거리가 실제로 엔진까지 온다', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '../..', p), 'utf8');

  test('워치가 거리를 보낸다', () => {
    expect(read('ios/SoleMateWatch Watch App/WatchLink.swift')).toContain('func sendDistance');
    // 융합이 끝난 최종값을 보내야 두 화면이 같아진다(recomputeDistance 뒤).
    expect(read('ios/SoleMateWatch Watch App/WorkoutManager.swift'))
      .toContain('WatchLink.shared.sendDistance');
  });

  test('폰 네이티브가 받아 이벤트로 올린다', () => {
    const m = read('ios/SoleMate/WatchSessionModule.swift');
    expect(m).toContain('"wkm"');
    expect(m).toContain('onWatchDistance');
    // supportedEvents 에 없으면 RN 이 이벤트를 버린다 — 조용히 아무 일도 안 일어난다.
    expect(/supportedEvents\(\)[^\n]*onWatchDistance/.test(m)).toBe(true);
  });

  test('JS 포트와 화면이 이어져 있다', () => {
    expect(read('lib/watchSession.ts')).toContain('onWatchDistance');
    expect(read('screens/RunEngine.tsx')).toMatch(/onWatchDistance\([^)]*feedWatchDistance/);
  });

  test('키 이름이 워치와 폰에서 같다 — 한 글자만 달라도 조용히 안 온다', () => {
    expect(read('ios/SoleMateWatch Watch App/WatchLink.swift')).toContain('["wkm": km]');
    expect(read('ios/SoleMate/WatchSessionModule.swift')).toContain('payload["wkm"]');
  });
});
