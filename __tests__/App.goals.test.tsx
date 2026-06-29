/**
 * App.tsx 홈 화면 진척 띠(ProgressionStrip) 통합 테스트.
 *
 * [설계 변경] 홈 하단 챌린지 카드(home-challenges-card)는 제거되고, 챌린지는 히어로
 * 위 진척 띠(ProgressionStrip, testID=home-progression)로 일원화되었다
 * (HomeScreen.rn.tsx:547-548 "챌린지는 상단 진척 띠로 일원화 — 하단 중복 카드 제거").
 * 진척 띠는 progression 주입 시 항상 렌더되고, 활성 챌린지가 없으면 챌린지 줄
 * (home-challenge)만 숨긴다(HomeScreen.rn.tsx:100-112). 더 이상 "진행 중인 챌린지가
 * 없어요" 빈 상태 문구는 존재하지 않는다. 따라서 새 설계대로 검증을 갱신한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {seedBootCache} from './helpers/bootSeed';
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
  // Firestore 정본 부팅: 화면 데이터는 REST 가 아니라 부팅 캐시에서 읽는다. 신발을 시드해야
  // 온보딩 게이트(!onboarded && shoes.length===0)도 건너뛴다(App.tsx:1490, 597-608).
  await seedBootCache(shoes, runs);
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

test('홈 화면에 진척 띠(ProgressionStrip)가 렌더링된다', async () => {
  // 챌린지는 하단 카드 대신 히어로 위 진척 띠로 일원화됨(HomeScreen.rn.tsx:547-548).
  // progression 은 App 이 항상 주입하므로(App.tsx:1194,524) 띠가 렌더된다.
  const {root} = await mount(SHOE, []);
  const strip = root.findAll((n: any) => n?.props?.testID === 'home-progression');
  expect(strip.length).toBeGreaterThan(0);
});

test('수락한 챌린지가 없으면 진척 띠의 챌린지 줄(home-challenge)은 숨겨진다', async () => {
  // 빈 상태 문구는 폐지됨. 활성 챌린지가 없으면 진척 띠는 챌린지 줄만 숨긴다
  // (HomeScreen.rn.tsx:100 — {ch && (...)}). 띠 자체는 랭크 칩으로 계속 보인다.
  const {root} = await mount(SHOE, []);
  const challengeRow = root.findAll((n: any) => n?.props?.testID === 'home-challenge');
  expect(challengeRow.length).toBe(0);
});
