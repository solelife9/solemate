/**
 * 위치 권한을 **카운트다운 전에** 확인한다 + 실내는 아예 묻지 않는다 (QA 후속, 2026-08-04).
 *
 * 예전 순서: 홈 → 목표 → 카운트다운(3·2·1·GO) → 러닝 화면 → 그제서야 권한 확인.
 * 세리머니를 다 돌린 뒤 "안 됩니다"를 말하는 셈이라, 시작한 줄 알고 달리다 아무것도 안
 * 남는 일이 가능했다. 게다가 러닝 화면의 게이트는 indoor 를 보지 않아서, **GPS 를 쓰지도
 * 않는 실내(트레드밀) 러닝이 위치 권한 때문에 시작조차 되지 않았다** — 실내 거리는 걸음이
 * 정본인데(runTracker.indoorMode).
 *
 * 여기서 못 박는 계약 셋:
 *   1) 이미 거부된 상태면 카운트다운에 들어가지 않고 설정으로 안내한다(2지선다).
 *   2) 설정에서 허용하고 돌아오면 **그 러닝이 바로 시작된다**(홈부터 다시 짚게 하지 않는다).
 *   3) 실내 러닝은 위치 권한을 묻지도, 요구하지도 않는다.
 *
 * @format
 */

import React from 'react';
import {Linking, AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import * as dialogLib from '../lib/dialog';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

const SHOE = {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0};

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

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** 홈 → 목표 화면까지. 그 다음 '러닝 시작'은 각 테스트가 직접 누른다. */
async function toGoalScreen() {
  await seedBootCache([SHOE]);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  pressByText(renderer.root, '러닝 시작'); // 홈 → 목표
  await flush();
  return {renderer, root: renderer.root};
}

const denied = () =>
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false,
    canAskAgain: false,
    status: 'denied',
  });

beforeEach(() => {
  jest.clearAllMocks();
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    status: 'granted',
  });
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: true,
    status: 'granted',
  });
  (Location.watchPositionAsync as jest.Mock).mockResolvedValue({remove: jest.fn()});
});

test('이미 거부된 상태면 카운트다운에 들어가지 않고 설정으로 안내한다', async () => {
  denied();
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toGoalScreen();
    pressByText(root, '러닝 시작'); // 목표 → (권한 게이트)
    await flush();

    // 세리머니도, 러닝 화면도 없다 — 목표 화면에 그대로 있다('러닝 중'은 라이브 런의 표식).
    expect(textOf(renderer.root)).not.toContain('러닝 중');
    expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBe(0);

    // 대신 왜 못 달리는지 말하고 설정으로 보낸다(2지선다 — 잘못된 데이터가 생길 여지 0).
    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('위치 권한이 꺼져'));
    expect(call).toBeTruthy();
    expect(String(call![1])).toContain('거리·페이스·코스');
    const labels = (call![2] as any[]).map(b => b.text);
    expect(labels).toEqual(['취소', '설정 열기']);

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});

test('설정에서 허용하고 돌아오면 기다리던 러닝이 바로 시작된다 — 홈부터 다시 짚지 않는다', async () => {
  denied();
  const handlers: ((s: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type: any, cb: any) => {
    if (type === 'change') handlers.push(cb);
    return {remove: jest.fn()} as any;
  });
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toGoalScreen();
    pressByText(root, '러닝 시작');
    await flush();

    // '설정 열기' → OS 설정으로 보내고, 그 목표를 들고 기다린다.
    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('위치 권한이 꺼져'))!;
    const openBtn = (call[2] as any[]).find(b => b.text === '설정 열기');
    await act(async () => {
      openBtn.onPress();
    });
    expect(Linking.openSettings).toHaveBeenCalled();
    await flush();

    // 사용자가 설정에서 허용하고 앱으로 돌아온다.
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      status: 'granted',
    });
    jest.useFakeTimers();
    await act(async () => {
      handlers.forEach(h => h('active'));
    });
    await flush();
    // 카운트다운이 떠 있다 → 그대로 러닝으로.
    await act(async () => {
      jest.advanceTimersByTime(6000);
    });
    jest.useRealTimers();
    await flush();

    expect(textOf(renderer.root)).toContain('러닝 중'); // 라이브 런 진입
    expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBeGreaterThan(0);

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});

test('실내 러닝은 위치 권한을 묻지도 요구하지도 않는다 — 거리는 걸음이 정본이다', async () => {
  denied();
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toGoalScreen();

    // 목표 화면에서 '실내'로 전환.
    const indoorSeg = root.findAll(
      n => typeof n.props.onPress === 'function' && textOf(n).trim() === '실내',
    )[0];
    expect(indoorSeg).toBeTruthy();
    await act(async () => {
      indoorSeg.props.onPress();
    });

    jest.useFakeTimers();
    await act(async () => {
      pressByText(root, '러닝 시작');
    });
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런
    });
    jest.useRealTimers();
    await flush();

    // 위치는 요청조차 하지 않았고, 설정 안내도 뜨지 않았다...
    expect((Location.requestForegroundPermissionsAsync as jest.Mock).mock.calls.length).toBe(0);
    expect(dialogSpy.mock.calls.filter(c => String(c[0]).includes('위치 권한'))).toHaveLength(0);
    // ...GPS 도 켜지 않는다(실내에선 팬텀 거리만 만든다)...
    expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBe(0);
    // ...그런데 러닝은 정상적으로 시작됐다.
    expect(textOf(renderer.root)).toContain('러닝 중');

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});
