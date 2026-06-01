/**
 * 신발 교체 배지 + 신발별 알림 추적 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 임계 도달 신발(95% → 교체 tier)은 홈 히어로/신발 목록에 '교체' 배지가 뜬다.
 *   2) 주의 tier(80%)는 '주의' 배지, 양호(50%)는 배지가 없다(평상시 잡음 제거).
 *   3) keep-going 카피('지금 교체하면 부상 없이 계속')가 교체 알림에 담긴다.
 *   4) 신발별 추적: 이미 알린 신발은 재마운트해도 중복 알림이 없고, 같은 날 새로
 *      임계에 도달한 *다른* 신발만 알린다(기존 '하루 1회' 전역 게이트 교체).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

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
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  return {root: renderer.root};
}

function badgeCount(root: ReactTestRenderer.ReactTestInstance, label: '주의' | '교체'): number {
  return root.findAll((n: any) => n && n.props && n.props.testID === `tier-badge-${label}`).length;
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

// 95% 사용(교체 tier ≥90%): 570/600.
const SHOE95: ApiShoe[] = [{id: 's1', name: 'Hoka Clifton', max_km: 600, start_km: 0}];
const RUNS95: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 570, run_date: '2026-05-20', duration: 7200}];

// 80% 사용(주의 tier ≥75%, <90%): 480/600.
const SHOE80: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
const RUNS80: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 480, run_date: '2026-05-20', duration: 7200}];

// 50% 사용(양호): 300/600.
const SHOE50: ApiShoe[] = [{id: 's1', name: 'Asics Nimbus', max_km: 600, start_km: 0}];
const RUNS50: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 300, run_date: '2026-05-20', duration: 7200}];

test('임계 도달 신발(95%) → 홈 히어로에 교체 배지 노출', async () => {
  // 알림은 꺼도 배지는 tier만 따른다(설정과 무관). enabled=false로 알림 잡음 제거.
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  const {root} = await mount(SHOE95, RUNS95);
  expect(badgeCount(root, '교체')).toBeGreaterThanOrEqual(1);
  expect(badgeCount(root, '주의')).toBe(0);
});

test('주의 tier(80%)는 주의 배지, 양호(50%)는 배지 없음', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  const warn = await mount(SHOE80, RUNS80);
  expect(badgeCount(warn.root, '주의')).toBeGreaterThanOrEqual(1);
  expect(badgeCount(warn.root, '교체')).toBe(0);

  await AsyncStorage.clear();
  const good = await mount(SHOE50, RUNS50);
  expect(badgeCount(good.root, '주의')).toBe(0);
  expect(badgeCount(good.root, '교체')).toBe(0);
});

test('교체 알림에 keep-going 카피가 담긴다', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 90}));
  await mount(SHOE95, RUNS95);
  const calls = replaceAlertCalls(alertSpy);
  expect(calls).toHaveLength(1);
  expect(calls[0].message).toContain('Hoka Clifton');
  expect(calls[0].message).toContain('지금 교체하면 부상 없이 계속');
});

test('신발별 추적: 같은 신발 재알림 없음 + 같은 날 새 신발만 알림', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 90}));

  // 1) A(95%) 첫 도달 → 1회 알림.
  await mount(SHOE95, RUNS95);
  expect(replaceAlertCalls(alertSpy)).toHaveLength(1);

  // 2) 저장 유지한 채 재마운트 → A는 여전히 임계지만 중복 알림 없음.
  alertSpy.mockClear();
  await mount(SHOE95, RUNS95);
  expect(replaceAlertCalls(alertSpy)).toHaveLength(0);

  // 3) A + B 둘 다 임계 → B만 새로 알림(전역 '하루 1회'였다면 B는 묻혔을 것).
  alertSpy.mockClear();
  const shoesAB: ApiShoe[] = [
    {id: 's1', name: 'Hoka Clifton', max_km: 600, start_km: 0},
    {id: 's2', name: 'Saucony Endorphin', max_km: 600, start_km: 0},
  ];
  const runsAB: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 570, run_date: '2026-05-20', duration: 7200},
    {id: 'r2', shoe_id: 's2', km: 580, run_date: '2026-05-21', duration: 7200},
  ];
  await mount(shoesAB, runsAB);
  const calls = replaceAlertCalls(alertSpy);
  expect(calls).toHaveLength(1);
  expect(calls[0].message).toContain('Saucony Endorphin'); // 신규 B
  expect(calls[0].message).not.toContain('Hoka Clifton'); // 기존 A는 제외
});

// 정확히 90%(540/600 = 교체) 신발. 수명을 +50km 올리면 540/650=83% → 주의로 완화.
const SHOE_EXACT90: ApiShoe[] = [{id: 's1', name: 'Nike Vaporfly', max_km: 600, start_km: 0}];
const RUNS_EXACT90: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 540, run_date: '2026-05-20', duration: 7200}];

test('신발별 수명(max_km) 상향 → 교체 배지가 주의로 완화 + 백엔드 PATCH', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  const {root} = await mount(SHOE_EXACT90, RUNS_EXACT90);

  // 신발 탭으로 이동 후 카드 진입(상세). 진입 전: 90% → 교체 배지.
  // 탭은 아이콘명('footsteps')으로 특정한다('신발'은 '신발 추가' 버튼과 충돌).
  await tap(pressBy(root, 'footsteps'));
  await tap(pressBy(root, 'Vaporfly'));
  expect(badgeCount(root, '교체')).toBeGreaterThanOrEqual(1);

  // 상세 수명 스테퍼 '+'(add) → max_km 600 → 650. 낙관적 갱신 + 백엔드 PATCH.
  (globalThis.fetch as jest.Mock).mockClear();
  await tap(pressBy(root, 'add'));

  // 배지 완화: 540/650 = 83% → 교체 사라지고 주의로.
  expect(badgeCount(root, '교체')).toBe(0);
  expect(badgeCount(root, '주의')).toBeGreaterThanOrEqual(1);

  // 백엔드에 max_km=650 PATCH 전송(신발별 수명 영속).
  const patch = (globalThis.fetch as jest.Mock).mock.calls.find(
    (c: any[]) => /\/api\/shoes\/s1$/.test(String(c[0])) && c[1] && c[1].method === 'PATCH',
  );
  expect(patch).toBeTruthy();
  expect(JSON.parse(patch[1].body).max_km).toBe(650);
});
