/**
 * 일시정지 이동 감지 넛지(심사 #11 잔여, 민우님 승인 2026-07-24) 통합 테스트.
 *
 * 계약(Apple '운동 재개 미리 알림' 문법):
 *   1) 수동 일시정지 중 걸음이 임계(PAUSE_MOVE_NUDGE_STEPS) 이상 쌓이면 배너가 뜬다.
 *   2) 임계 미만(제자리 스트레칭 수준)에서는 절대 뜨지 않는다 — 오알림 금지.
 *   3) 자동 재개는 하지 않는다(배너만) — 재개하면 배너가 사라진다.
 *
 * 신호는 Pedometer 걸음수만(GPS 엔진 불가침) — expo-sensors 목을 폴링 주기와 함께 구동한다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Pedometer} from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';
import {PAUSE_MOVE_NUDGE_POLL_MS} from '../lib/engineConstants';

function textOf(node: any): string {
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

async function flushMicrotasks() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const nudgeShown = (root: ReactTestRenderer.ReactTestInstance) =>
  root.findAll((n: any) => n.props?.testID === 'pause-move-nudge').length > 0;

// 넛지 폴링 1회분을 흘린다(인터벌 → 비동기 걸음 조회 → setState).
async function tickNudgePoll(n = 1) {
  for (let i = 0; i < n; i++) {
    await act(async () => { jest.advanceTimersByTime(PAUSE_MOVE_NUDGE_POLL_MS); });
    await flushMicrotasks();
  }
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(async () => {
  jest.clearAllTimers();
  jest.useRealTimers();
  await AsyncStorage.clear();
});

async function startAndPause() {
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await flushMicrotasks();
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // home → goal(기본 자유런)
  await act(async () => { pressByText(root, '러닝 시작'); }); // goal → 카운트다운
  await act(async () => { jest.advanceTimersByTime(6000); }); // 카운트다운 통과 → 라이브
  pressByText(root, 'pause'); // 수동 일시정지
  await flushMicrotasks();
  return {renderer, root};
}

test('수동 일시정지 중 걸음이 임계 이상 쌓이면 넛지 배너가 뜨고, 재개하면 사라진다', async () => {
  const stepsMock = Pedometer.getStepCountAsync as jest.Mock;
  const {renderer, root} = await startAndPause();
  expect(nudgeShown(root)).toBe(false); // 정지 직후엔 없음

  // 임계 미만(제자리 서성임 8걸음) — 폴링이 돌아도 조용해야 한다(오알림 금지).
  stepsMock.mockResolvedValue({steps: 8});
  await tickNudgePoll(2);
  expect(nudgeShown(root)).toBe(false);

  // 달리기 재개 수준(120걸음 누적) — 배너 등장.
  stepsMock.mockResolvedValue({steps: 120});
  await tickNudgePoll(1);
  expect(nudgeShown(root)).toBe(true);
  expect(textOf(root)).toContain('일시정지 중이에요 — 지금 움직임은 기록되지 않아요');

  // 재개(자동 재개 아님 — 사용자가 누른다) → 배너 소멸. jest(SKIP_ANIM)는 즉시 재개.
  // 버튼 텍스트(ctrlHint)는 Pressable 밖 형제라 a11y 라벨로 찾는다.
  const resumeBtn = root.findAll(
    (n: any) => n.props?.accessibilityLabel === '재개' && typeof n.props?.onPress === 'function',
  )[0];
  act(() => { resumeBtn.props.onPress(); });
  await flushMicrotasks();
  expect(nudgeShown(root)).toBe(false);

  act(() => renderer.unmount());
});

test('넛지는 러닝 중(비일시정지)에는 폴링 자체가 돌지 않는다', async () => {
  const stepsMock = Pedometer.getStepCountAsync as jest.Mock;
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { renderer = ReactTestRenderer.create(<App />); });
  await flushMicrotasks();
  const root = renderer.root;
  pressByText(root, '러닝 시작');
  await act(async () => { pressByText(root, '러닝 시작'); });
  await act(async () => { jest.advanceTimersByTime(6000); });

  // 달리는 중 — 걸음이 아무리 쌓여도(케이던스 폴링과 무관) 넛지 배너는 없다.
  stepsMock.mockResolvedValue({steps: 500});
  await tickNudgePoll(2);
  expect(nudgeShown(root)).toBe(false);

  act(() => renderer.unmount());
});
