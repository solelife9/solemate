/**
 * 온보딩에서 입력한 몸무게가 **설정에 실제로 반영되는가.**
 *
 * 왜 이 파일이 생겼나 (2026-08-08)
 * ----------------------------------------------------------------------------
 * `completeOnboarding(registered, weightKg?)` 의 매개변수 이름이 바깥 상태 `weightKg` 와
 * 겹쳐 있었다(no-shadow 경고). 이름을 바꾸는 순간 함수 본문의 `weightKg` 가 **조용히
 * 바깥 상태를 가리키게 됐다** — 온보딩에서 65kg 을 입력해도 기본값이 저장되는 버그다.
 *
 * **타입 검사는 이걸 못 잡는다.** 안쪽도 바깥쪽도 `number` 라 tsc 가 통과시킨다.
 * 같은 커밋의 다른 섀도잉(`now`)은 Date vs number 라 tsc 가 잡아 줬는데, 이건 못 잡았다.
 * 그리고 **이 경로를 지키는 테스트가 하나도 없었다.**
 *
 * 몸무게는 칼로리와 신발 수명 계산에 함께 쓰인다(무게가 크면 권장 수명이 줄어든다).
 * 조용히 기본값으로 떨어지면 두 숫자가 같이 틀리는데, 화면 어디에도 "몸무게가 반영 안 됨"
 * 이라고 뜨지 않는다 — 사용자가 알아챌 방법이 없는 종류의 오류다.
 *
 * 온보딩 **UI 를 조작하지 않고** `onDone` 계약으로 검증한다. 그래야 온보딩 화면을
 * 다시 디자인해도 이 불변식은 그대로 지켜진다(무엇을 지키는지가 흐려지지 않는다).
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import OnboardingScreen from '../OnboardingScreen.rn';
import {K_WEIGHT, DEFAULT_SETTINGS} from '../lib/settings';

async function flush(times = 8) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 온보딩이 떠 있는 새 앱을 띄우고, 그 화면의 완료 콜백을 돌려준다. */
async function bootToOnboarding() {
  await AsyncStorage.clear();
  (globalThis.fetch as jest.Mock).mockImplementation(() =>
    Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])}),
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await flush();
  const onboarding = renderer.root.findByType(OnboardingScreen as never);
  return {renderer, onDone: onboarding.props.onDone as (r: unknown, w?: number) => void};
}

const SHOE = {brand: 'Nike', model: 'Pegasus 41', km: 0, max: 650};

test('온보딩에서 입력한 몸무게가 설정에 저장된다', async () => {
  const {renderer, onDone} = await bootToOnboarding();
  try {
    await act(async () => {
      onDone(SHOE, 78);
    });
    await flush();
    expect(await AsyncStorage.getItem(K_WEIGHT)).toBe('78');
  } finally {
    act(() => renderer.unmount());
  }
});

test('입력하지 않으면 기본값을 건드리지 않는다 — 없는 값을 지어내지 않는다', async () => {
  const {renderer, onDone} = await bootToOnboarding();
  try {
    await act(async () => {
      onDone(SHOE, undefined);
    });
    await flush();
    const saved = await AsyncStorage.getItem(K_WEIGHT);
    // 저장 자체를 안 하거나(기본값 유지), 저장하더라도 기본값이어야 한다.
    expect(saved === null || Number(saved) === DEFAULT_SETTINGS.weightKg).toBe(true);
  } finally {
    act(() => renderer.unmount());
  }
});

test('말이 안 되는 값(0·음수)은 반영하지 않는다', async () => {
  for (const bad of [0, -5]) {
    const {renderer, onDone} = await bootToOnboarding();
    try {
      await act(async () => {
        onDone(SHOE, bad);
      });
      await flush();
      const saved = await AsyncStorage.getItem(K_WEIGHT);
      expect(saved === null || Number(saved) === DEFAULT_SETTINGS.weightKg).toBe(true);
    } finally {
      act(() => renderer.unmount());
    }
  }
});

test('아주 큰 값은 상한으로 조인다 — 저장은 되되 계산을 망가뜨리지 않는다', async () => {
  const {renderer, onDone} = await bootToOnboarding();
  try {
    await act(async () => {
      onDone(SHOE, 9999);
    });
    await flush();
    const saved = Number(await AsyncStorage.getItem(K_WEIGHT));
    expect(Number.isFinite(saved)).toBe(true);
    expect(saved).toBeLessThan(500); // clampWeight 가 실제로 걸려 있다
  } finally {
    act(() => renderer.unmount());
  }
});
