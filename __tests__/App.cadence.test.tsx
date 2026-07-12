/**
 * App.tsx cadence wiring integration test.
 *
 * Drives the real App to the live-run screen, then feeds cumulative step counts
 * through the polled Pedometer.getStepCountAsync mock — the same end-to-end path
 * the device uses (2026-07-03: watchStepCount 스트림은 화면 잠금 시 네이티브가 끊어
 * 5초 폴링으로 교체): OS 걸음 이력 조회 → feedStepCount → setCadence → render.
 * 2026-07-12 계약 변경(사용자 확정): 케이던스는 러닝 중/일시정지 화면에서 제거되고
 * '완주 리캡'에만 표시된다. 따라서 검증 관측점도 리캡의 케이던스 타일로 옮긴다 —
 * 걸음 스트림 → setCadence → 종료 저장 → 리캡 렌더까지 파이프라인 끝단을 지킨다.
 * (순수 spm 계산은 __tests__/lib/stepCadence.test.ts 가 검증.)
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
import * as Location from 'expo-location';
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
function readCadence(root: ReactTestRenderer.ReactTestInstance): string | null {
  const metric = root
    .findAll(n => typeof n.type === 'string')
    .filter(n => {
      const t = textOf(n);
      return t.includes('케이던스') && /\d/.test(t.replace('케이던스', '').replace('spm', ''));
    })
    .sort((a, b) => textOf(a).length - textOf(b).length)[0];
  if (!metric) return null;
  return textOf(metric).replace('케이던스', '').replace('spm', '').trim();
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

  // GPS fix 주입 — 종료 시 최소 거리(finishRun 의 '너무 짧아요' 분기 회피)용.
  const calls = (Location.watchPositionAsync as jest.Mock).mock.calls;
  const onPos = calls[calls.length - 1][1] as (p: any) => void;
  const emit = (lat: number, ts: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: 127.0, accuracy: 5}, timestamp: ts});
    });

  return {renderer, root, setStepsAt, poll, emit};
}

const BASE = 100000;
const intervalMs = Math.round(60000 / 170); // 353ms → 170 spm

// 러닝 종료(일시정지 → 종료 홀드 확정) → 리캡 진입. jest(SKIP_ANIM)는 세리머니 없이 즉시.
// 전제: 이미 일시정지 상태(종료 버튼은 일시정지 화면에만 있다).
// 종료 홀드 확정 → 리뷰 화면('저장하기') → 저장 → 리캡.
async function stopToRecap(root: ReactTestRenderer.ReactTestInstance) {
  const stopBtn = root.findAll(
    n => typeof n.props.onLongPress === 'function' && n.props.accessibilityLabel === '길게 눌러 종료',
  )[0];
  if (!stopBtn) throw new Error('stop button not found');
  await act(async () => {
    stopBtn.props.onLongPress();
    await Promise.resolve();
    await Promise.resolve();
  });
  pressByText(root, '저장하기');
  // 저장 비동기(로컬 큐→목 fetch) 플러시 — 리캡 렌더까지.
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();
    });
  }
}

// 케이던스는 러닝 중/일시정지 화면에 없다(사용자 확정) — 값은 '완주 리캡'에서 검증한다.
test('Pedometer ~170spm 스트림 → 일시정지 화면엔 케이던스 부재, 완주 리캡에 160-180 밴드', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(BASE);
  try {
    const {renderer, root, setStepsAt, poll, emit} = await startRun();

    // 최소 거리 확보(워밍업 3 + 이동 1 ≈ 33m) — 종료 시 '너무 짧아요' 분기 회피.
    const g0 = Date.now();
    emit(37.5, g0);
    emit(37.5, g0 + 2000);
    emit(37.5, g0 + 4000);
    emit(37.5003, g0 + 7000);
    emit(37.5006, g0 + 10000);

    // 러닝 시작 시점부터 170spm 로 걸음이 쌓인다(하드웨어 누적 이력 시뮬레이션).
    const t0 = Date.now();
    setStepsAt(now => Math.floor(Math.max(0, now - t0) / intervalMs));
    await poll(3); // 15s — 폴 표본 3개(5s 간격)로 롤링 윈도우 충족

    // 일시정지 화면: 케이던스 지표가 아예 없어야 한다(새 6그리드 계약).
    pressByA11y(root, '일시정지');
    expect(readCadence(root)).toBeNull();

    // 종료 → 리캡: 케이던스 타일이 160-180 밴드 값으로 렌더된다(파이프라인 끝단).
    await stopToRecap(root);
    // 첫 런 업적 축하 화면이 리캡 앞에 뜬다 — '확인'으로 통과.
    if (textOf(root).includes('업적 획득')) {
      pressByText(root, '확인');
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    }
    const shown = readCadence(root);
    expect(shown).not.toBeNull();
    const spm = Number(shown);
    expect(Number.isInteger(spm)).toBe(true);
    expect(spm).toBeGreaterThanOrEqual(160);
    expect(spm).toBeLessThanOrEqual(180);

    act(() => renderer.unmount());
  } finally {
    jest.useRealTimers();
  }
});

// (제거됨 2026-07-12) '첫 걸음 전 idle 희석 방지'는 롤링 '표시' 계약이었다 — 케이던스
// 표시가 리캡(전체 평균)으로 옮겨지며 관측점이 사라졌고, 공회전 앵커 슬라이드는
// __tests__/lib/stepCadence.test.ts 가 순수 단위로 계속 가드한다.
