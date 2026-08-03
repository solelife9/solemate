/**
 * 미완료 러닝 복구 프롬프트는 **게이트를 통과한 뒤에만** 뜬다 (QA 감사 Q-5).
 *
 * DialogHost 는 렌더 사다리 바깥(루트)에 있어 무엇이 그려지든 그 위에 뜬다. 그래서
 * 복구 프롬프트가 deps [] 로 마운트 즉시 돌던 동안은 **로그인 화면·부팅 스켈레톤 위로**
 * 떴다. 알림에는 이미 같은 가드가 있다(App.presentDueRef — "로그인 화면 위로 알림이 뜬다",
 * 2026-07-30 Android 실측). 이쪽이 더 나쁜 이유는 선택을 요구하기 때문이다: 사용자가 고른
 * '이어 달리기'가 세우는 overlay 는 인증·부팅 게이트보다 아래라 즉시 반영되지도 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as dialogLib from '../lib/dialog';
import App from '../App';
import {SNAPSHOT_KEY, ROUTE_KEY, RunSnapshot} from '../lib/runPersistence';

const SNAP: RunSnapshot = {
  dist: 3.2,
  elapsed: 900,
  pts: [
    {lat: 37.5, lon: 127.0},
    {lat: 37.503, lon: 127.0},
  ],
  pausedMs: 0,
  t0: 1_700_000_000_000,
  shoe: {id: 's1', name: 'Nike Pegasus'},
  goalKm: 5,
  goalMin: 0,
  pacePlan: [],
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_900_000,
};

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

async function seedSnapshot() {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(SNAP));
  await AsyncStorage.setItem(ROUTE_KEY, JSON.stringify(SNAP.pts));
}

const recoverCalls = (spy: jest.SpyInstance) =>
  spy.mock.calls.filter(c => String(c[0]).includes('완료하지 않은 러닝'));

afterEach(() => {
  delete (globalThis as any).__KEEGO_AUTH_USER__;
});

test('미로그인이면 복구 프롬프트를 띄우지 않는다 — 로그인 화면 위에 겹치지 않는다', async () => {
  await seedSnapshot();
  (globalThis as any).__KEEGO_AUTH_USER__ = null; // 로그인 게이트 앞
  const spy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    // 지금 보이는 건 로그인 화면이고...
    expect(textOf(renderer.root)).toContain('로그인하고 시작하기');
    // ...그 위에 복구 프롬프트가 겹치지 않는다.
    expect(recoverCalls(spy)).toHaveLength(0);
    // 스냅샷은 그대로 남아 있다(묻지 않았다고 버리는 게 아니다 — 로그인하면 묻는다).
    expect(await AsyncStorage.getItem(SNAPSHOT_KEY)).not.toBeNull();

    act(() => renderer.unmount());
  } finally {
    spy.mockRestore();
  }
});

test('로그인·부팅이 끝나면 복구 프롬프트를 한 번 띄운다', async () => {
  await seedSnapshot();
  const spy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    for (let i = 0; i < 8; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    const calls = recoverCalls(spy);
    expect(calls).toHaveLength(1); // 게이트가 열린 뒤 정확히 한 번(재실행에 중복 없음)
    expect(String(calls[0][1])).toContain('3.20km');
    const labels = (calls[0][2] as any[]).map(b => b.text);
    expect(labels).toEqual(expect.arrayContaining(['버리기', '기록 저장', '이어 달리기']));

    act(() => renderer.unmount());
  } finally {
    spy.mockRestore();
  }
});
