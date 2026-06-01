/**
 * App.tsx 프로필 설정 4행 통합 테스트.
 *
 * 관찰 가능한 동작을 검증한다(화면에 무엇이 보이고 무엇이 영속되는가):
 *   1) 단위 행을 누르면 km↔mi 토글 → settings_unit이 영속되고, 프로필·홈 등
 *      전 화면의 거리 표기가 즉시 환산 단위로 바뀐다('마일' / 'mi 남음').
 *   2) 단위 선택은 영속되어 재마운트(앱 재실행) 후에도 복원된다.
 *   3) 목표 설정 스테퍼로 주간 목표를 바꾸면 홈의 주간 달성률(%)이 갱신된다.
 *   4) 알림 행 토글이 settings_alerts(enabled)에 영속된다.
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

beforeEach(async () => {
  await AsyncStorage.clear();
});

// 오늘 날짜(로컬)를 'YYYY-MM-DD'로. 주간 목표/달성률은 이번 주 런만 센다.
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const SHOES: ApiShoe[] = [
  {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0},
  {id: 's2', name: 'Hoka Clifton', max_km: 600, start_km: 0},
];
const RUNS: ApiRun[] = [
  {id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800},
  {id: 'r2', shoe_id: 's2', km: 5, run_date: '2026-05-01', duration: 1800},
];

test('단위 행 토글 → settings_unit 영속 + 전 화면 즉시 환산 반영', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '프로필')); // 프로필 탭

  // 초기 단위는 킬로미터(하드코딩 제거 — 실제 설정값을 표시)
  expect(textOf(root)).toContain('킬로미터');

  // 단위 행 탭 → km→mi
  await tap(pressBy(root, '단위'));

  // (a) 영속: settings_unit = 'mi'
  expect(await AsyncStorage.getItem('settings_unit')).toBe('mi');
  // (b) 프로필 화면 즉시 반영: 단위 표기가 '마일'로 바뀐다
  expect(textOf(root)).toContain('마일');
  expect(textOf(root)).not.toContain('킬로미터');

  // (c) 다른 화면(홈)도 즉시 환산 단위로: 'mi 남음'(km 아님)
  await tap(pressBy(root, '홈'));
  const home = textOf(root);
  expect(home).toContain('mi 남음');
  expect(home).not.toContain('km 남음');
});

test('단위 선택은 영속되어 재마운트(앱 재실행) 후에도 복원된다', async () => {
  const first = await mount(SHOES, RUNS);
  await tap(pressBy(first.root, '프로필'));
  await tap(pressBy(first.root, '단위')); // → mi
  expect(await AsyncStorage.getItem('settings_unit')).toBe('mi');

  // 재마운트: loadSettings가 mi를 복원해야 한다(스토리지는 유지)
  const second = await mount(SHOES, RUNS);
  await tap(pressBy(second.root, '프로필'));
  expect(textOf(second.root)).toContain('마일');
});

test('목표 설정 변경 → 홈 주간 달성률(%) 갱신', async () => {
  const goalShoes: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
  // 이번 주 15km 달림 → 기본 목표 30km 대비 50%
  const goalRuns: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 15, run_date: todayIso(), duration: 3600}];
  const {root} = await mount(goalShoes, goalRuns);

  // 홈 초기: 15 / 30 = 50%
  expect(textOf(root)).toContain('50%');

  // 프로필 → 목표 설정 펼치기 → 스테퍼 '−'로 목표 30→25km
  await tap(pressBy(root, '프로필'));
  await tap(pressBy(root, '목표 설정'));
  await tap(pressBy(root, 'remove')); // 스테퍼 감소 버튼

  // 영속 확인: goal_weekly_km = 25
  expect(await AsyncStorage.getItem('goal_weekly_km')).toBe('25');

  // 홈 복귀: 15 / 25 = 60%
  await tap(pressBy(root, '홈'));
  expect(textOf(root)).toContain('60%');
});

test('알림 행 토글 → settings_alerts(enabled=false) 영속 + 표기 갱신', async () => {
  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '프로필'));

  // 알림 행을 펼친다(초기 '켜짐')
  expect(textOf(root)).toContain('켜짐');
  await tap(pressBy(root, '알림'));

  // 패널의 토글을 눌러 끈다
  await tap(pressBy(root, '신발 교체 알림'));

  // 영속: settings_alerts.enabled = false
  const raw = await AsyncStorage.getItem('settings_alerts');
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw as string).enabled).toBe(false);
  // 행 표기 '꺼짐'
  expect(textOf(root)).toContain('꺼짐');
});
