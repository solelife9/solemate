/**
 * App.tsx cadence wiring integration test.
 *
 * Drives the real App to the live-run screen, then feeds cumulative step counts
 * through the polled Pedometer.getStepCountAsync mock — the same end-to-end path
 * the device uses (2026-07-03: watchStepCount 스트림은 화면 잠금 시 네이티브가 끊어
 * 5초 폴링으로 교체): OS 걸음 이력 조회 → feedStepCount → setCadence → render.
 * Assertions are on the observable cadence metric ('--' placeholder vs a
 * rendered spm number), so this verifies the steps→setCadence→UI wiring, not
 * the pure lib in isolation (that lives in __tests__/lib/stepCadence.test.ts).
 *
 * The watch callback reads Date.now() per sample, so fake timers + setSystemTime
 * let us place cumulative step counts on a real ~170 spm cadence. We assert the
 * metric shows '--' before the 3s minimum window has been observed, then renders
 * a value inside the 160-180 running-standard band once ~12s of steps streamed.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Pedometer} from 'expo-sensors';
import App from '../App';
import {seedBootCache} from './helpers/bootSeed';

function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) {
      body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

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

// 아이콘 버튼은 텍스트가 없어 접근성 라벨로 누른다(예: '일시정지').
function pressByA11y(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root.findAll(
    n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  )[0];
  if (!target) throw new Error(`no pressable with a11y label: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

// Read the cadence metric value ('--' when no cadence, else the spm number).
function readCadence(root: ReactTestRenderer.ReactTestInstance): string {
  const metric = root
    .findAll(n => typeof n.type === 'string')
    .filter(n => {
      const t = textOf(n);
      return t.includes('케이던스') && t.replace('케이던스', '').trim() !== '';
    })
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!metric) throw new Error('cadence metric not found');
  return textOf(metric).replace('케이던스', '').trim();
}

async function startRun() {
  mockBackendWithShoe();
  await seedBootCache([{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}]); // Stage 3: 부팅 캐시 시드
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작');
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → 카운트다운
  });
  // 카운트다운(준비·GPS락·3·2·1·GO) 자동 진행을 건너뛰어 라이브 런으로 진입.
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  // beginRun 의 Pedometer 권한/가용성 await 가 풀리도록 마이크로태스크 플러시.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  // beginRun 이 5초 폴링을 시작했다 — getStepCountAsync 목이 '지금 시각'의 누적 걸음수를
  // 돌려주게 하고, 타이머를 5초씩 전진시켜 폴을 발화시킨다.
  const setStepsAt = (fn: (nowMs: number) => number) => {
    (Pedometer.getStepCountAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve({steps: fn(Date.now())}),
    );
  };
  const poll = async (times: number) => {
    for (let i = 0; i < times; i++) {
      await act(async () => {
        jest.advanceTimersByTime(5000);
        await Promise.resolve();
        await Promise.resolve();
      });
    }
  };

  return {renderer, root, setStepsAt, poll};
}

const BASE = 100000;
const intervalMs = Math.round(60000 / 170); // 353ms → 170 spm

// 케이던스 피드는 '러닝 중'(active)에만 동작한다(App: pausedFlag() 게이트). 케이던스는
// 나이키식 재구성으로 active 화면엔 안 뜨고 '일시정지' 시 펼쳐지는 보조지표다. 따라서
// active 상태로 스트림을 주입해 cadence 상태를 채운 뒤, 일시정지해 펼침 지표의 값을 읽는다.
// (3s 최소창 '--' 보류는 순수 lib __tests__/lib/stepCadence.test.ts 가 검증.)
test('Pedometer ~170spm 스트림이 일시정지 펼침 케이던스에 160-180 밴드로 렌더된다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
  try {
    const {renderer, root, setStepsAt, poll} = await startRun();

    // 러닝 시작 시점부터 170spm 로 걸음이 쌓인다(하드웨어 누적 이력 시뮬레이션).
    const t0 = Date.now();
    setStepsAt(now => Math.floor(Math.max(0, now - t0) / intervalMs));
    await poll(3); // 15s — 폴 표본 3개(5s 간격)로 롤링 윈도우 충족

    // 일시정지 → 보조지표 펼침(케이던스 노출). 피드는 멈추지만 계산된 상태는 유지된다.
    pressByA11y(root, '일시정지');
    const shown = readCadence(root);
    expect(shown).not.toBe('--');
    const spm = Number(shown);
    expect(Number.isInteger(spm)).toBe(true);
    expect(spm).toBeGreaterThanOrEqual(160);
    expect(spm).toBeLessThanOrEqual(180);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

// 첫 걸음 전 idle(GPS 워밍업/출발선 대기)이 표시 케이던스를 희석하면 안 된다.
test('첫 걸음 전 idle 은 표시 케이던스를 낮추지 않는다', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
  try {
    const {renderer, root, setStepsAt, poll} = await startRun();

    const firstAt = Date.now() + 30000; // 30s 공회전(출발선 대기) 후 진짜 170spm
    setStepsAt(now => (now < firstAt ? 0 : Math.floor((now - firstAt) / intervalMs)));
    await poll(6); // 30s 공회전 — '변화 0' 폴 표본은 앵커 슬라이드로 흡수돼야 한다
    await poll(3); // 15s 의 진짜 170spm
    pressByA11y(root, '일시정지'); // 펼침 지표로 케이던스 확인
    const spm = Number(readCadence(root));
    expect(spm).toBeGreaterThanOrEqual(160); // ~26 으로 끌려가지 않음
    expect(spm).toBeLessThanOrEqual(180);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});
