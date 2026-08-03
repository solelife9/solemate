/**
 * 싱글턴 러닝 엔진의 잔여 상태가 새 기록으로 저장되지 않는다 (QA 감사 Q-1, BLOCKER).
 *
 * runTracker 는 프로세스 싱글턴이고, 누적 상태를 지우는 곳은 start() 하나뿐이다 —
 * stop() 은 active 플래그만 내리고 거리·t0·경로를 남긴다("저장을 위해 남긴다"는 계약).
 * 그래서 **위치 권한이 거부돼 beginRun 이 돌지 않은 러닝**을 종료하면, 종료 경로가
 * 직전 러닝이 남긴 거리·시간·경로를 읽어 새 기록으로 저장해 버렸다. 같은 러닝이 두 건이
 * 되고 신발 거리가 두 번 차감된다(Iron Law: 데이터 오염 금지). 화면엔 0.00km 가 떠 있어
 * 사용자는 무엇이 저장됐는지도 알 수 없었다.
 *
 * 여기서 지키는 관찰 가능한 계약 둘:
 *   1) 엔진을 시작하지 못한 러닝을 종료하면 **아무것도 저장되지 않고** 정직하게 안내한다.
 *   2) 정지된 엔진은 스냅샷을 쓰지 않는다 — 그렇지 않으면 이미 저장이 끝난 러닝이
 *      "완료하지 않은 러닝"으로 되살아나 다시 저장될 수 있다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as dialogLib from '../lib/dialog';
import App from '../App';
import {runTracker} from '../lib/runTracker';
import {SNAPSHOT_KEY, clearSnapshot} from '../lib/runPersistence';
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

/**
 * **직전 러닝**을 흉내 낸다 — 실제로 달리고 정지한 뒤 싱글턴에 남는 것과 같은 상태.
 * (전체 저장 플로우를 태우지 않는 이유: 이 테스트가 지키려는 것은 저장 UI 가 아니라
 *  "엔진의 잔여 상태"라는 전제 하나뿐이다. 전제를 직접 만들어야 회귀에 정확히 반응한다.)
 */
function leaveStaleEngineState() {
  runTracker.start({goalKm: 5, shoe: {id: 's1', name: 'Nike Pegasus'}, t0: 100000});
  const LON = 127.0;
  let t = 100000;
  const fix = (lat: number) =>
    runTracker.ingestFix({
      coords: {latitude: lat, longitude: LON, accuracy: 5},
      timestamp: (t += 3000),
    });
  fix(37.5); // 워밍업 3
  fix(37.5);
  fix(37.5);
  fix(37.5003); // 채택 세그먼트(약 33m/3s — 세그먼트 속도 게이트 통과)
  fix(37.5006);
  fix(37.5009);
  runTracker.stop();
}

/** 홈 → 목표 → 카운트다운 → 라이브 런. 권한 결과는 호출부가 미리 목킹한다. */
async function enterRun() {
  await seedBootCache([SHOE]);
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작');
  await act(async () => {
    pressByText(root, '러닝 시작');
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런
  });
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {renderer, root};
}

async function holdStop(root: ReactTestRenderer.ReactTestInstance) {
  const stopBtn = root.findAll(
    n => typeof n.props.onLongPress === 'function' && n.props.accessibilityLabel === '길게 눌러 종료',
  )[0];
  if (!stopBtn) throw new Error('stop button not found');
  await act(async () => {
    stopBtn.props.onLongPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(500000);
  await clearSnapshot();
});

afterEach(() => {
  jest.useRealTimers();
});

test('위치 권한이 거부돼 엔진이 시작되지 않은 러닝을 종료해도 직전 러닝이 저장되지 않는다', async () => {
  // 전제 ①: 싱글턴에 직전 러닝의 거리가 남아 있다.
  leaveStaleEngineState();
  expect(runTracker.getDistanceKm()).toBeGreaterThan(0.01);
  // 직전 러닝은 이미 저장이 끝난 상태 — 스냅샷은 App(onSave)이 지웠다.
  await clearSnapshot();

  // 전제 ②: 이번 러닝은 위치 권한이 거부된다 → beginRun 미도달.
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const dialogSpy = jest.spyOn(dialogLib, 'showDialog').mockImplementation(() => 0);

  try {
    const {renderer, root} = await enterRun();

    // 권한이 없으니 트래킹은 시작되지 않았고, 화면 거리도 0 이다.
    expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBe(0);
    expect(textOf(root)).toContain('0.00');

    // 종료 버튼은 일시정지 화면에만 있다 — 탈출 경로는 막지 않는다.
    pressByA11y(root, '일시정지');
    await holdStop(root);

    // ── 계약 1: 저장 경로를 아예 타지 않는다 ──────────────────────────────
    const saved = JSON.parse((await AsyncStorage.getItem(CACHE_RUNS_KEY)) || '[]');
    expect(saved).toHaveLength(0);

    // ...그리고 왜 기록이 없는지 정직하게 말한다(무음 종료 금지).
    const call = dialogSpy.mock.calls.find(c => String(c[0]).includes('기록된 러닝이 없어요'));
    expect(call).toBeTruthy();
    expect(String(call![1])).toContain('위치 권한');

    // '확인'을 누르면 러닝 화면에서 빠져나온다(갇히지 않는다).
    const ok = (call![2] as any[]).find(b => b.text === '확인');
    await act(async () => {
      ok.onPress();
      await Promise.resolve();
    });
    expect(textOf(renderer.root)).not.toContain('길게 눌러 종료');

    act(() => renderer.unmount());
  } finally {
    dialogSpy.mockRestore();
  }
});

test('정지된 엔진은 스냅샷을 쓰지 않는다 — 저장이 끝난 러닝이 "완료하지 않은 러닝"으로 되살아나지 않는다', async () => {
  leaveStaleEngineState();
  await clearSnapshot(); // 저장 완료 시점의 상태(App.onSave 가 지운다)

  // 정지된 엔진에 일시정지/저장을 아무리 걸어도 스냅샷이 다시 생기면 안 된다.
  runTracker.togglePause();
  runTracker.persist({force: true});
  await act(async () => {
    await Promise.resolve();
  });

  expect(await AsyncStorage.getItem(SNAPSHOT_KEY)).toBeNull();
});
