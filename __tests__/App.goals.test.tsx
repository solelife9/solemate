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
import App from '../App';

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

// 주간 목표 달성 링의 진행도(0~1)를 strokeDashoffset에서 역산한다. 목표 링은
// stroke=8(히어로 7·픽커 3.5와 구분)이고 진행 원만 strokeDasharray를 가진다.
function goalRingProgress(root: ReactTestRenderer.ReactTestInstance): number {
  const arcs = root.findAll(
    (n: any) =>
      n.type &&
      n.type.displayName === 'Circle' &&
      n.props.strokeWidth === 8 &&
      n.props.strokeDasharray != null,
  );
  if (!arcs.length) throw new Error('goal ring progress arc not found');
  const dash = Number(arcs[0].props.strokeDasharray);
  const off = Number(arcs[0].props.strokeDashoffset);
  return 1 - off / dash;
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
  expect(goalRingProgress(root)).toBeCloseTo(0.5, 2);
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
  expect(goalRingProgress(root)).toBeCloseTo(1, 2);
});
