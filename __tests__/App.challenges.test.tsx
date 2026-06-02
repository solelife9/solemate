/**
 * App.tsx 개인 챌린지 영속·데이터 격리(iron law) 통합 테스트.
 *
 * deliverable(2)의 핵심 계약을 관찰 가능한 동작으로 검증한다:
 *   1) 영속 라운드트립 — <App/>에서 챌린지를 만들면 신규 AsyncStorage 키
 *      `challenges_v1`에 기록되고, 재마운트(앱 재실행) 시 그 챌린지가 다시 로드돼
 *      프로필에 렌더된다. (키 오타·미영속 회귀를 잡는다.)
 *   2) 데이터 격리 — 기존 신발/런/설정 키가 있는 상태에서 챌린지를 만들고 지워도
 *      그 키들이 바이트 단위로 보존된다(덮어쓰기/clear 없음). 삭제는 다른 키를
 *      건드리지 않고 challenges_v1만 빈 배열로 둔다.
 *   3) challenges_v1 부재로 로드해도 기존 키가 손상/리셋되지 않는다.
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

function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string): ReactTestRenderer.ReactTestInstance {
  return root.find(
    (n: any) => n && n.props && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
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

const SHOES: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
const RUNS: ApiRun[] = [{id: 'r1', shoe_id: 's1', km: 5, run_date: '2026-05-31', duration: 1800}];

// 프로필로 가서 챌린지 폼을 열고 기본값(거리 50km/30일)으로 만든다.
async function createDefaultChallenge(root: ReactTestRenderer.ReactTestInstance) {
  await tap(pressBy(root, '프로필'));
  await tap(pressBy(root, '새 챌린지')); // 폼 열기
  await tap(pressBy(root, '챌린지 만들기'));
}

test('영속 라운드트립 — 챌린지 생성이 challenges_v1에 기록되고 재마운트 시 복원된다', async () => {
  const first = await mount(SHOES, RUNS);

  // 생성 전: 신규 키는 비어 있다.
  expect(await AsyncStorage.getItem('challenges_v1')).toBeNull();

  await createDefaultChallenge(first.root);

  // (a) 신규 키 challenges_v1에 well-formed 챌린지가 영속된다(키 오타 회귀 가드).
  const raw = await AsyncStorage.getItem('challenges_v1');
  expect(raw).toBeTruthy();
  const arr = JSON.parse(raw as string);
  expect(Array.isArray(arr)).toBe(true);
  expect(arr).toHaveLength(1);
  expect(arr[0].kind).toBe('distance');
  expect(arr[0].targetKm).toBe(50);
  expect(typeof arr[0].id).toBe('string');

  // 화면 즉시 반영: 프로필에 '50km 도전' 카드가 보인다(빈 상태 아님).
  expect(textOf(first.root)).toContain('50km 도전');

  // (b) 재마운트(앱 재실행): 스토리지는 유지 → 같은 챌린지가 다시 로드돼 렌더된다.
  const second = await mount(SHOES, RUNS);
  await tap(pressBy(second.root, '프로필'));
  expect(textOf(second.root)).toContain('50km 도전');
});

test('데이터 격리(iron law) — 생성·삭제가 기존 신발/런/설정 키를 보존한다', async () => {
  // 기존 사용자 데이터를 모사하는 로컬 키들을 미리 심는다(런 경로/시간·알림·설정).
  const seeded: Record<string, string> = {
    settings_unit: 'mi',
    goal_weekly_km: '25',
    settings_alerts: JSON.stringify({enabled: false, thresholdPct: 90}),
    route_r1: 'enc-polyline-payload',
    time_r1: '00:30:00',
    shoe_alert_notified: JSON.stringify({s1: true}),
  };
  for (const [k, v] of Object.entries(seeded)) await AsyncStorage.setItem(k, v);

  const {root} = await mount(SHOES, RUNS);
  await createDefaultChallenge(root);

  // 생성 후: challenges_v1은 생겼고, 기존 키는 전부 그대로다(덮어쓰기/clear 없음).
  expect(await AsyncStorage.getItem('challenges_v1')).toBeTruthy();
  for (const [k, v] of Object.entries(seeded)) {
    expect(await AsyncStorage.getItem(k)).toBe(v);
  }

  // 만든 챌린지를 삭제한다(라벨로 삭제 버튼을 찾는다).
  await tap(pressByLabel(root, '챌린지 삭제 50km 도전'));

  // 삭제 후: 기존 키는 여전히 그대로, challenges_v1은 비워질 뿐(키 제거/clear 아님).
  for (const [k, v] of Object.entries(seeded)) {
    expect(await AsyncStorage.getItem(k)).toBe(v);
  }
  const afterDel = await AsyncStorage.getItem('challenges_v1');
  expect(JSON.parse(afterDel as string)).toEqual([]);
  // 빈 상태 안내로 복귀(카드 사라짐).
  expect(textOf(root)).not.toContain('50km 도전');
});

test('challenges_v1 부재로 로드해도 기존 키가 손상/리셋되지 않는다', async () => {
  const seeded: Record<string, string> = {
    settings_unit: 'mi',
    goal_weekly_km: '40',
    route_r1: 'enc-polyline-payload',
  };
  for (const [k, v] of Object.entries(seeded)) await AsyncStorage.setItem(k, v);
  // challenges_v1은 일부러 심지 않는다(부재 경로).

  const {root} = await mount(SHOES, RUNS);
  await tap(pressBy(root, '프로필'));

  // 로드 경로가 다른 키를 건드리지 않았다.
  for (const [k, v] of Object.entries(seeded)) {
    expect(await AsyncStorage.getItem(k)).toBe(v);
  }
  // 빈 목록으로 안전 시작(크래시·리셋 없음).
  expect(textOf(root)).toContain('챌린지가 없어요');
});
