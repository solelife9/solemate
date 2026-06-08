/**
 * App.tsx 홈 화면 주간 목표 달성 링 + 연속 러닝 스트릭 통합 테스트.
 *
 * 관찰 가능한 동작을 실 런 데이터로 검증한다(keep-going 동기 표시):
 *   1) 이번 주 실제 런 합(km) / 주간 목표 → 달성률(%)이 홈에 뜨고, 그 달성률이
 *      Ring(primitives 재사용)의 진행도(strokeDashoffset)에 실제로 반영된다.
 *   2) 오늘까지 끊김 없이 이어진 연속 러닝 일수(currentStreak)가 'N일 연속'으로 뜬다.
 *   3) 오늘 달리지 않았으면 스트릭이 끊겨(0일) '오늘 달리고 스트릭 시작' 유도가 뜬다.
 *   4) 목표를 채우거나 초과하면(>=100%) 달성률이 100%로 가득 찬 링으로 표시된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {StyleSheet} from 'react-native';
import App from '../App';
import {ACCENT, GOOD} from '../theme';

type ApiShoe = {id: string; name: string; max_km: number; start_km: number; retired?: boolean};
type ApiRun = {id: string; shoe_id: string; km: number; run_date: string; duration: number};

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

// 오늘에서 days일 전(로컬)을 'YYYY-MM-DD'로. ymdLocal(App 내부)과 동일 규칙이라
// 주간 윈도(월~일)·스트릭 판정이 테스트 실행 요일과 무관하게 일치한다.
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = isoOffset(0);

// 주간 목표 진행도(0~1)를 진행 바(testID='goal-progress')의 width(%)에서 읽는다.
// (4) 리스킨에서 목표 표시가 SVG 링 → 헤어라인 진행 바로 바뀌어, 바 채움으로 검증한다.
function goalBarPct(root: ReactTestRenderer.ReactTestInstance): number {
  const bars = root.findAll((n: any) => n?.props?.testID === 'goal-progress');
  if (!bars.length) throw new Error('goal progress bar not found');
  const w = (StyleSheet.flatten(bars[0].props.style) || {}).width;
  return typeof w === 'string' ? parseFloat(w) / 100 : 0;
}

// 진행 바의 채움색(상태색). 달성(>=100%) 시 GOOD(녹색), 미달성 시 ACCENT —
// '단순 채움'이 아니라 '상태 전환'을 검증한다.
function goalBarColor(root: ReactTestRenderer.ReactTestInstance): string | undefined {
  const bars = root.findAll((n: any) => n?.props?.testID === 'goal-progress');
  if (!bars.length) throw new Error('goal progress bar not found');
  return (StyleSheet.flatten(bars[0].props.style) || {}).backgroundColor as string | undefined;
}

const SHOE: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('이번 주 실 런 합 / 목표 → 달성률(%)이 홈 + 링 진행도에 반영된다', async () => {
  // 이번 주 합 15km, 기본 목표 30km → 50%. 모든 런을 오늘 날짜로 둬 주간 윈도 안에 보장.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 9, run_date: TODAY, duration: 3000},
    {id: 'r2', shoe_id: 's1', km: 6, run_date: TODAY, duration: 2000},
  ];
  const {root} = await mount(SHOE, runs);

  // (a) 화면에 달성률 텍스트 50%가 뜬다(실 데이터 합 15 / 목표 30).
  expect(textOf(root)).toContain('50%');
  // (b) 그 50%가 Ring 진행도에 실제로 반영된다(하드코딩/막대가 아닌 데이터 구동 링).
  expect(goalBarPct(root)).toBeCloseTo(0.5, 2);
});

test('오늘까지 이어진 연속 러닝 일수가 "N일 연속"으로 뜬다', async () => {
  // 오늘·어제·그제 각각 달림 → 끊김 없는 3일 연속.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 4, run_date: isoOffset(0), duration: 1500},
    {id: 'r2', shoe_id: 's1', km: 4, run_date: isoOffset(1), duration: 1500},
    {id: 'r3', shoe_id: 's1', km: 4, run_date: isoOffset(2), duration: 1500},
  ];
  const {root} = await mount(SHOE, runs);

  expect(textOf(root)).toContain('3일 연속');
});

test('오늘 달리지 않으면 스트릭 0 → "오늘 달리고 스트릭 시작" 유도', async () => {
  // 어제·그제만 달림(오늘 미달림) → 오늘 기준 스트릭은 0(끊김).
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 4, run_date: isoOffset(1), duration: 1500},
    {id: 'r2', shoe_id: 's1', km: 4, run_date: isoOffset(2), duration: 1500},
  ];
  const {root} = await mount(SHOE, runs);

  const txt = textOf(root);
  expect(txt).toContain('오늘 달리고 스트릭 시작');
  expect(txt).not.toContain('일 연속');
});

test('목표를 채우면(>=100%) 달성률 100% 가득 찬 링으로 표시된다', async () => {
  // 이번 주 30km = 기본 목표 30km → 정확히 100%.
  const runs: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 30, run_date: TODAY, duration: 9000}];
  const {root} = await mount(SHOE, runs);

  expect(textOf(root)).toContain('100%');
  expect(goalBarPct(root)).toBeCloseTo(1, 2);
});

test('주간 윈도우 밖 런은 달성률에서 제외된다(전체합이 아님)', async () => {
  // 이번 주: 오늘 15km → 목표 30km의 50%. 주간 밖: 10일 전 21km(지난주/그 전).
  // weeklyProgress가 윈도를 무시하고 전체를 더하면 36/30=120%가 떠 50% 단언이 깨진다
  // → 식별력 있는(수정 전 구현이면 실패) 케이스.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 15, run_date: TODAY, duration: 4500},
    {id: 'r2', shoe_id: 's1', km: 21, run_date: isoOffset(10), duration: 6300},
  ];
  const {root} = await mount(SHOE, runs);

  const txt = textOf(root);
  expect(txt).toContain('50%'); // 주간분(15/30)만 반영
  expect(txt).not.toContain('120%'); // 전체합(36/30)이 아님
  expect(goalBarPct(root)).toBeCloseTo(0.5, 2); // 링 진행도도 주간분만
});

test('스트릭은 중간 gap을 넘어 세지 않는다(오늘+그제 → 1일 연속)', async () => {
  // 오늘 달림, 어제 빠짐, 그제 달림. 오늘 기준 끊김 없는 연속은 1일뿐 —
  // gap을 무시하고 distinct day 수를 세면 2가 떠 단언이 깨진다.
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 5, run_date: isoOffset(0), duration: 1800},
    {id: 'r2', shoe_id: 's1', km: 5, run_date: isoOffset(2), duration: 1800},
  ];
  const {root} = await mount(SHOE, runs);

  const txt = textOf(root);
  expect(txt).toContain('1일 연속');
  expect(txt).not.toContain('2일 연속');
  expect(txt).not.toContain('3일 연속');
});

test('목표 초과(>100%)는 실제 %를 보이되 링은 over-fill하지 않는다', async () => {
  // 이번 주 45km / 목표 30km = 150%.
  const runs: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 45, run_date: TODAY, duration: 13500}];
  const {root} = await mount(SHOE, runs);

  // 표시 정책: 실제 달성률(150%)을 그대로 노출(100%로 잘라 숨기지 않음).
  expect(textOf(root)).toContain('150%');
  // 진행 바 채움은 100%에서 클램프(width: min(100, pct)%) — >1로 과채움되지 않는다.
  expect(goalBarPct(root)).toBeCloseTo(1, 2);
});

test('정확히 100%면 링이 GOOD(달성) 상태색으로 전환된다', async () => {
  // 이번 주 30km = 목표 30km → 정확히 100%, 달성 상태.
  const runs: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 30, run_date: TODAY, duration: 9000}];
  const {root} = await mount(SHOE, runs);

  const color = goalBarColor(root);
  expect(color).toBe(GOOD); // 달성 시 바가 GOOD(녹색) 상태색으로 전환
  expect(color).not.toBe(ACCENT); // 미달성 강조색(ACCENT)이 아님 — 단순 채움이 아닌 상태 전환
});

test('스트릭은 단위(mi) 토글과 무관한 절대 일수다', async () => {
  // mi로 로드된 상태여도 연속 일수 표시는 동일('2일 연속'). 거리만 환산, 일수는 불변.
  await AsyncStorage.setItem('settings_unit', 'mi');
  const runs: ApiRun[] = [
    {id: 'r1', shoe_id: 's1', km: 5, run_date: isoOffset(0), duration: 1800},
    {id: 'r2', shoe_id: 's1', km: 5, run_date: isoOffset(1), duration: 1800},
  ];
  const {root} = await mount(SHOE, runs);

  expect(textOf(root)).toContain('2일 연속');
});
