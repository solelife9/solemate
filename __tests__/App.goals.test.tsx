/**
 * App.tsx 홈 화면 챌린지 카드 통합 테스트.
 *
 * 주간목표가 챌린지 카드로 교체되었다. 홈 화면에 챌린지 카드가 렌더링되고
 * 진행 중인 챌린지가 없으면 빈 상태가 표시됨을 검증한다.
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
    if (typeof n === 'string') { out += n; return; }
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

const SHOE: ApiShoe[] = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];

beforeEach(async () => {
  await AsyncStorage.clear();
});

test('홈 화면에 챌린지 카드가 렌더링된다', async () => {
  const {root} = await mount(SHOE, []);
  const card = root.findAll((n: any) => n?.props?.testID === 'home-challenges-card');
  expect(card.length).toBeGreaterThan(0);
});

test('챌린지가 없으면 빈 상태 안내 문구가 표시된다', async () => {
  const {root} = await mount(SHOE, []);
  expect(textOf(root.children[0] as any)).toContain('진행 중인 챌린지가 없어요');
});
