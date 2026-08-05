/**
 * 실내(트레드밀) 러닝은 **걸음 권한이 없으면 시작하지 않는다** (2026-08-05 실기기 발견).
 *
 * 왜 실내만 특별한가: 실내는 GPS 를 아예 켜지 않고 걸음이 **거리 정본**이다
 * (`runTracker.indoorMode` → `feedPedometerDistance` 가 `dist` 에 직접 더한다).
 * 그래서 동작·피트니스 권한이 없으면 거리가 **영원히 0** 으로 끝난다. 야외는 GPS 가
 * 받쳐 케이던스만 잃지만, 실내는 러닝 자체가 성립하지 않는다.
 *
 * 실제로 일어난 일: 민우님 아이폰에서 이 권한이 꺼진 채였고 앱은 아무 말도 하지 않았다.
 * 야외였으니 기록은 남았지만(케이던스만 '--'), 실내였다면 32분을 달리고 0km 를 받았을 것이다.
 *
 * 여기서 못 박는 계약 셋:
 *   1) 거부 상태면 카운트다운에 들어가지 않고 설정으로 안내한다(2지선다).
 *   2) 기기가 걸음을 못 재면 설정으로 보내지 않는다 — 설정에서 해결될 문제가 아니다.
 *   3) 설정에서 허용하고 돌아오면 **그 실내 러닝이 바로 시작된다**(위치가 아니라 걸음을 본다).
 *
 * @format
 */

import React from 'react';
import {AppState} from 'react-native';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Pedometer} from 'expo-sensors';
import * as Location from 'expo-location';
import * as dialogLib from '../lib/dialog';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

const SHOE = {id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0};

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

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => { target.props.onPress(); });
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await act(async () => { await Promise.resolve(); });
  }
};

/** 홈 → 목표 화면 → '실내' 세그먼트 선택까지. */
async function toIndoorGoal() {
  await seedBootCache([SHOE]);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await flush();
  pressByText(renderer.root, '러닝 시작'); // 홈 → 목표
  await flush();
  const indoorSeg = renderer.root.findAll(
    n => typeof n.props.onPress === 'function' && textOf(n).trim() === '실내',
  )[0];
  expect(indoorSeg).toBeTruthy();
  await act(async () => { indoorSeg.props.onPress(); });
  return {renderer, root: renderer.root};
}

beforeEach(() => {
  jest.clearAllMocks();
  // 위치는 정상 — 실내 경로가 위치 때문에 막히는 게 아님을 분명히 한다.
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
  (Location.watchPositionAsync as jest.Mock).mockResolvedValue({remove: jest.fn()});
  (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Pedometer.getPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
  (Pedometer.requestPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
});

test('걸음 권한이 거부돼 있으면 실내 러닝을 시작하지 않고 설정으로 안내한다', async () => {
  (Pedometer.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false, canAskAgain: false, status: 'denied',
  });
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toIndoorGoal();
    await act(async () => { pressByText(root, '러닝 시작'); });
    await flush();

    // 카운트다운도 러닝 화면도 없다 — 0km 러닝이 만들어질 여지를 아예 두지 않는다.
    expect(textOf(renderer.root)).not.toContain('러닝 중');

    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('동작 및 피트니스'));
    expect(call).toBeTruthy();
    // 왜 못 달리는지 말한다 — '거리가 0으로 기록된다'가 핵심이다.
    expect(String(call![1])).toContain('거리가 0');
    expect((call![2] as any[]).map(b => b.text)).toEqual(['취소', '설정 열기']);

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});

test('기기가 걸음을 못 재면 설정으로 보내지 않는다 — 설정에서 해결될 문제가 아니다', async () => {
  (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toIndoorGoal();
    await act(async () => { pressByText(root, '러닝 시작'); });
    await flush();

    expect(textOf(renderer.root)).not.toContain('러닝 중');
    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('걸음 수를 잴 수 없'));
    expect(call).toBeTruthy();
    // 버튼이 하나다 — 설정을 열어봐야 켤 스위치가 없다.
    expect((call![2] as any[]).map(b => b.text)).toEqual(['확인']);
    // 야외는 멀쩡하다는 것도 말해 준다(막다른 길로 두지 않는다).
    expect(String(call![1])).toContain('야외');

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});

test('설정에서 걸음을 허용하고 돌아오면 그 실내 러닝이 바로 시작된다', async () => {
  (Pedometer.getPermissionsAsync as jest.Mock).mockResolvedValue({
    granted: false, canAskAgain: false, status: 'denied',
  });
  const handlers: ((s: string) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type: any, cb: any) => {
    if (type === 'change') handlers.push(cb);
    return {remove: jest.fn()} as any;
  });
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);
  try {
    const {renderer, root} = await toIndoorGoal();
    await act(async () => { pressByText(root, '러닝 시작'); });
    await flush();

    // 안내에서 '설정 열기'를 고른다 → 목표를 들고 기다린다.
    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('동작 및 피트니스'))!;
    const openBtn = (call[2] as any[]).find(b => b.text === '설정 열기');
    await act(async () => { openBtn.onPress(); });
    await flush();

    // 설정에서 허용하고 돌아온다.
    (Pedometer.getPermissionsAsync as jest.Mock).mockResolvedValue({granted: true, status: 'granted'});
    jest.useFakeTimers();
    await act(async () => { handlers.forEach(h => h('active')); });
    await flush();
    await act(async () => { jest.advanceTimersByTime(6000); }); // 카운트다운 → 라이브 런
    jest.useRealTimers();
    await flush();

    // 홈부터 다시 짚지 않고 그 러닝이 시작됐다.
    expect(textOf(renderer.root)).toContain('러닝 중');
    // 그리고 위치는 여전히 안 켠다(실내니까).
    expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBe(0);

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});
