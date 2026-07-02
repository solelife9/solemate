/**
 * App.tsx 홈 화면 진척 노출 통합 테스트.
 *
 * [설계 변경 — MVP 홈 다이어트] 진척 띠(ProgressionStrip)는 홈에서 제거되었다.
 * 진척(랭크·챌린지·업적)의 집은 마이탭/진척 화면이고, 홈에 남는 진척 표면은 인사 옆
 * 장착 타이틀 pill(home-equipped-title) 하나뿐이다. 홈은 '오늘 신발 고르고 뛴다'
 * 저니에 집중한다(HomeScreen.rn.tsx 홈 다이어트 주석 참조). 이 계약을 회귀 가드한다:
 * 진척 띠/챌린지 줄이 홈에 다시 스며들면 즉시 깨진다.
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

test('홈 화면에 진척 띠(ProgressionStrip)가 없다 — 진척의 집은 마이탭', async () => {
  const {root} = await mount(SHOE, []);
  const strip = root.findAll((n: any) => n?.props?.testID === 'home-progression');
  expect(strip.length).toBe(0);
});

test('홈 화면에 챌린지 줄(home-challenge)도 없다 — 주간 목표는 이번 주 카드가 담당', async () => {
  const {root} = await mount(SHOE, []);
  const challengeRow = root.findAll((n: any) => n?.props?.testID === 'home-challenge');
  expect(challengeRow.length).toBe(0);
});
