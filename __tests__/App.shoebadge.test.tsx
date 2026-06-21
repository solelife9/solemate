/**
 * 신발 교체 배지 + 신발별 알림 추적 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다(컨디션 표시는 모든 화면이 wearTier 4단계 칩으로 통일 —
 * 최상의 컨디션/좋은 상태/교체 고려/교체 권장. TierBadge 3단계는 폐지):
 *   1) 95%(used/max) → wearTier consider(교체 고려) 칩.
 *   2) tier별 칩: 80%=교체 고려, 50%=좋은 상태.
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
import {seedBootCache} from './helpers/bootSeed';

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
  await seedBootCache(shoes, runs); // Stage 3: 부팅은 캐시에서 읽는다
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  return {root: renderer.root};
}

// 모든 화면이 wearTier 4단계 칩(best/good/consider/replace)으로 통일됨(TierBadge 3단계 폐지).
// 홈 히어로(home-cond-*)·목록 카드(cond-dot-*)·상세(detail-cond-*) 의 해당 tier 칩 수를 센다.
type WearKey = 'best' | 'good' | 'consider' | 'replace';
function condChip(root: ReactTestRenderer.ReactTestInstance, key: WearKey): number {
  return root.findAll((n: any) => {
    const id = n && n.props && n.props.testID;
    return id === `home-cond-${key}` || id === `cond-dot-${key}` || id === `detail-cond-${key}`;
  }).length;
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
  if ((out === '' || node.props?.accessibilityRole === 'tab') && typeof node.props?.accessibilityLabel === 'string') return node.props.accessibilityLabel;
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

test('임계 도달 신발(95%) → 홈 히어로에 wearTier 칩(교체 고려)', async () => {
  // 칩은 설정과 무관하게 사용률(used/max%) tier만 따른다. enabled=false로 알림 잡음 제거.
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  const {root} = await mount(SHOE95, RUNS95);
  // 95% → consider(교체 고려). (3단계 '교체' 배지 폐지 — 4단계 wearTier 칩으로 통일.)
  expect(condChip(root, 'consider')).toBeGreaterThanOrEqual(1);
  expect(condChip(root, 'best')).toBe(0);
  expect(textOf(root)).toContain('교체 고려');
});

test('마모 tier별 wearTier 칩: 80%=교체 고려, 50%=좋은 상태', async () => {
  await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: false, thresholdPct: 90}));
  const consider = await mount(SHOE80, RUNS80); // 480/600 = 80% → consider
  expect(condChip(consider.root, 'consider')).toBeGreaterThanOrEqual(1);

  await AsyncStorage.clear();
  const good = await mount(SHOE50, RUNS50); // 300/600 = 50% → good
  expect(condChip(good.root, 'good')).toBeGreaterThanOrEqual(1);
  expect(condChip(good.root, 'consider')).toBe(0);
  expect(textOf(good.root)).toContain('좋은 상태');
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

// (수명 상향→칩 완화 테스트 제거 — 회사 변경으로 신발 상세의 수명(max_km) 조정 UI 가
//  제거됨. 더는 UI 로 max_km 을 바꿀 수 없어 테스트 불가.)
