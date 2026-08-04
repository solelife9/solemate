/**
 * 자정을 넘긴 러닝은 **시작한 날**로 기록된다 (QA 감사 Q-6).
 *
 * 예전엔 저장하는 순간의 날짜(`today()`)를 썼다. 23:30 에 출발해 00:20 에 끝낸 러닝이
 * 다음 날 기록이 되고, 스트릭·주간 목표·러닝 리마인더(`ranToday`)가 하루씩 어긋났다.
 * 업계 관례(Strava·NRC·가민)도, 이 앱의 워치 런 경로(`p.startMs`)도 이미 시작 시각
 * 기준이었다 — 같은 앱 안에서 두 규칙이 공존하고 있었다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache, CACHE_RUNS_KEY} from './helpers/bootSeed';

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
function pressByA11y(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root.findAll(
    n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0];
  if (!target) throw new Error(`no pressable with a11y label: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

test('23:30 에 출발해 자정을 넘겨 끝낸 러닝은 어제(출발일)로 저장된다', async () => {
  jest.useFakeTimers();
  // 2026-08-03 23:30 에 출발.
  const START = new Date(2026, 7, 3, 23, 30, 0).getTime();
  jest.setSystemTime(START);
  try {
    await seedBootCache([SHOE]);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    for (let i = 0; i < 8; i++) await act(async () => { await Promise.resolve(); });
    const root = renderer.root;

    pressByText(root, '러닝 시작');
    await act(async () => { await Promise.resolve(); });
    await act(async () => { pressByText(root, '러닝 시작'); });
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(6000); }); // 카운트다운 → 라이브 런
    for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });

    // 거리를 조금 쌓는다(종료 시 '너무 짧아요' 분기 회피).
    const calls = (Location.watchPositionAsync as jest.Mock).mock.calls;
    const onPos = calls[calls.length - 1][1] as (p: any) => void;
    let t = START;
    for (const lat of [37.5, 37.5, 37.5, 37.5003, 37.5006, 37.5009]) {
      await act(async () => onPos({coords: {latitude: lat, longitude: 127.0, accuracy: 5}, timestamp: (t += 3000)}));
    }

    // ── 자정을 넘긴다: 다음 날 00:20 에 종료 ──
    jest.setSystemTime(new Date(2026, 7, 4, 0, 20, 0).getTime());

    pressByA11y(root, '일시정지');
    const stopBtn = root.findAll(
      n => typeof n.props.onLongPress === 'function' && n.props.accessibilityLabel === '길게 눌러 종료',
    )[0];
    await act(async () => {
      stopBtn.props.onLongPress();
      await Promise.resolve();
    });
    for (let i = 0; i < 6; i++) {
      await act(async () => { jest.advanceTimersByTime(50); await Promise.resolve(); });
    }

    const saved = JSON.parse((await AsyncStorage.getItem(CACHE_RUNS_KEY)) || '[]');
    expect(saved.length).toBeGreaterThan(0);
    // 저장 시각(08-04)이 아니라 **출발일(08-03)** 이다.
    expect(saved[0].run_date).toBe('2026-08-03');

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});
