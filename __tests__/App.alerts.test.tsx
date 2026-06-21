/**
 * App.tsx 신발 교체 알림(checkShoeAlerts) 동작 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다(영속 플래그가 아니라 실제 알림 발화 여부):
 *   1) enabled=false  → 임계 초과 신발이 있어도 교체 알림이 뜨지 않는다.
 *   2) enabled=true + 임계 초과 → 교체 알림이 뜨고, 메시지에 신발 이름이 담긴다.
 *   3) 사용자가 정한 *새 임계값*에서 발화한다(기본 90%가 아니라 75%에서):
 *      80% 사용 신발은 기본값에선 조용하지만 임계 75%에선 알림이 뜬다.
 *   4) 임계값을 알림 패널에서 올리면 settings_alerts.thresholdPct가 영속된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n) return;
    if (typeof n.props?.accessibilityLabel === 'string') out += n.props.accessibilityLabel;
    if (!n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function mockBackend(shoes: ApiShoe[], runs: ApiRun[]) {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let res: any = {};
    if (u.includes('/api/auth')) res = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) res = shoes;
    else if (u.includes('/api/runs')) res = runs;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(res),
      text: () => Promise.resolve(JSON.stringify(res)),
    });
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(shoes: ApiShoe[], runs: ApiRun[]) {
  mockBackend(shoes, runs);
  await seedBootCache(shoes, runs); // Stage 3: 부팅은 캐시에서 읽는다
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  return {root: renderer.root};
}

function pressBy(root: ReactTestRenderer.ReactTestInstance, needle: string): ReactTestRenderer.ReactTestInstance {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  if (!hits.length) throw new Error(`no pressable contains "${needle}"`);
  return hits[0];
}

async function tap(node: ReactTestRenderer.ReactTestInstance) {
  await act(async () => {
    node.props.onPress();
  });
  await flush();
}

// 교체 알림(title='신발 교체 알림')만 추려 호출 인자를 본다. 다른 Alert(미완료 런 등)는
// fresh storage에선 뜨지 않지만, 타이틀로 필터해 견고하게 한다.
function replaceAlertCalls(spy: jest.SpyInstance): Array<{message: string}> {
  return spy.mock.calls
    .filter((c: any[]) => c[0] === '신발 교체 알림')
    .map((c: any[]) => ({message: String(c[1] ?? '')}));
}

let alertSpy: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

// 80% 사용 신발: max 600km, 이번 시즌 480km 주행 → percentUsed = 80.
const SHOE80: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
const RUNS80: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 480, run_date: '2026-05-20', duration: 7200}];

// 95% 사용 신발: 570/600.
const SHOE95: ApiShoe[] = [{id: 's1', name: 'Hoka Clifton', max_km: 600, start_km: 0}];
const RUNS95: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 570, run_date: '2026-05-20', duration: 7200}];

test('enabled=false → 임계 초과 신발이 있어도 교체 알림 미발생', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  await mount(SHOE95, RUNS95); // 95% > 90%지만 알림 꺼짐
  expect(replaceAlertCalls(alertSpy)).toHaveLength(0);
});

test('enabled=true + 임계 초과 → 교체 알림 발생(신발 이름 포함)', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 90}));
  await mount(SHOE95, RUNS95); // 95% ≥ 90%
  const calls = replaceAlertCalls(alertSpy);
  expect(calls).toHaveLength(1);
  expect(calls[0].message).toContain('Hoka Clifton');
  expect(calls[0].message).toContain('90%');
});

test('새 임계값(75%)에서 발화 — 기본값 90%였다면 조용했을 80% 신발', async () => {
  // 같은 80% 신발을 두 임계값으로 대조: 기본 90%는 조용, 사용자 75%는 발화.
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 90}));
  await mount(SHOE80, RUNS80);
  expect(replaceAlertCalls(alertSpy)).toHaveLength(0); // 80% < 90% → 기본값에선 조용

  // 임계값을 75%로 낮춘 설정으로 재마운트(상태 초기화)
  alertSpy.mockClear();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 75}));
  await mount(SHOE80, RUNS80);
  const calls = replaceAlertCalls(alertSpy);
  expect(calls).toHaveLength(1); // 80% ≥ 75% → 새 임계값에서 발화
  expect(calls[0].message).toContain('75%'); // 기본 90%가 아니라 사용자 임계값 75%
});

test('알림 패널에서 임계값 +스텝 → settings_alerts.thresholdPct 영속', async () => {
  const {root} = await mount(SHOE80, RUNS80);
  await tap(pressBy(root, '마이'));
  // 설정 행은 마이탭 헤더 ⚙️ 뒤의 '설정' 뷰로 분리됐다 — 먼저 연다.
  await tap(root.findAll((n: any) => n.props?.accessibilityLabel === '설정 열기')[0]);
  await tap(pressBy(root, '알림')); // 패널 펼치기(기본 enabled=true, 임계 90%)

  // 패널의 임계값 스테퍼 '+'(add)로 90 → 95
  await tap(pressBy(root, 'add'));

  const raw = await AsyncStorage.getItem('settings_alerts');
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw as string).thresholdPct).toBe(95);
});
