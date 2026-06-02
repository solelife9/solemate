/**
 * iron law #17 — heart_rate / bpm 데이터 보존 가드 (파괴 방지).
 *
 * 스펙은 "심박 UI는 숨기되 기존 데이터(heart_rate/bpm)는 절대 파괴하지 않는다"를
 * 요구한다. 그런데 형제 테스트들은 이 필드를 전부 `as any` 픽스처로만 들고 있어서,
 * 누군가 타입에서 필드를 지워도 tsc·전체 테스트가 통과해 버린다(파괴를 막는 가드 부재).
 *
 * 이 파일은 두 레이어를 캐스트(`as any`) 없이 강하게 묶는다:
 *
 *   1) 저장 레이어(PendingRun.heart_rate) — 실제 AsyncStorage 큐 라운드트립으로
 *      값이 살아남는지 단언한다. PendingRun 타입에서 heart_rate 를 지우면 아래
 *      타입드 리터럴이 잉여 속성으로 tsc 실패 → 컴파일 가드.
 *   2) 프레젠테이션 레이어(Run.bpm) — 실제 소비자(HistoryScreen 상세)를 렌더해
 *      심박 UI('평균 심박' 라벨·'bpm' 단위)가 화면에 **나오지 않는지** 단언한다
 *      (spec #15 '심박 UI 숨김'). 동시에 캐스트 없는 Run 리터럴이 bpm 을 들고 있어,
 *      Run 타입에서 bpm 을 지우면 타입드 리터럴이 tsc 실패 → 데이터 타입 보존 컴파일 가드.
 *
 * 핵심: 두 픽스처 모두 캐스트가 없으므로, 필드를 타입에서 제거하면 **반드시 tsc 가
 * 실패**한다. 데이터 자체(저장소/네이티브)는 전혀 건드리지 않는다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';
import {RunStart} from '../RunScreen.rn';
import type {Run, Shoe} from '../theme';
import {
  PendingRun,
  enqueuePendingRun,
  loadPendingRuns,
} from '../lib/runPersistence';

// 공식 async-storage 목은 clearAllMockStorages 가 레지스트리 포인터만 비우므로
// 이미 import 된 인스턴스를 직접 비워 테스트 격리를 보장한다(형제 테스트와 동일).
beforeEach(async () => {
  await AsyncStorage.clear();
});

// ── 1) 저장 레이어: heart_rate 가 AsyncStorage 큐를 라운드트립해도 살아남는가 ──
// 캐스트 없는 PendingRun 리터럴 → heart_rate 를 타입에서 지우면 잉여 속성 tsc 실패.
const PENDING: PendingRun = {
  localId: 'run_hr_guard',
  shoe_id: 'shoe-1',
  km: 5.02,
  run_date: '2026-06-02',
  memo: '심박 보존 가드',
  source: 'gps',
  duration: 1500,
  cadence: 172,
  route: '[{"lat":37.5,"lon":127.0}]',
  location: '서울',
  heart_rate: 152,
  run_time: '19:30',
  queuedAt: 1_700_000_000_000,
};

describe('iron law #17 — heart_rate 저장 보존', () => {
  test('heart_rate 는 PendingRun 큐 enqueue→load 라운드트립을 통과해 값(152)이 보존된다', async () => {
    await enqueuePendingRun(PENDING);

    const loaded = await loadPendingRuns();
    const got = loaded.find(r => r.localId === PENDING.localId);

    expect(got).toBeDefined();
    // 필드가 존재할 뿐 아니라 정확한 값이 살아남아야 한다(0 으로 깎이거나 유실 금지).
    expect(got!.heart_rate).toBe(152);
  });
});

// ── 2) 프레젠테이션 레이어: Run.bpm 이 상세 화면에 '평균 심박'으로 노출되지 않는가 ──
// 캐스트 없는 Run 리터럴 → bpm 을 타입에서 지우면 tsc 실패(데이터 타입 보존 가드).
// 동시에 화면에는 심박 UI 가 없어야 한다(spec #15 / iron law #17 '표시만 숨김').
const RUN: Run = {
  id: 'r-hr-1',
  date: '5월 28일',
  day: '수',
  dateNum: '28',
  dist: 5.2,
  pace: "5'02\"",
  time: '40:41',
  shoe: 0,
  cal: 0,
  cadence: 0,
  bpm: 152,
  elev: 0,
};

const SHOE: Shoe = {
  brand: 'NIKE',
  model: 'Pegasus 41',
  used: 0,
  max: 800,
  condition: '양호',
} as Shoe;

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function openDetail(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => {
    hits[0].props.onPress();
  });
  await flush();
}

describe('iron law #17 — Run.bpm 심박 UI 숨김(데이터는 보존)', () => {
  test('bpm 값이 있어도 상세 화면에 심박 UI("평균 심박" 라벨·"bpm" 단위)가 노출되지 않는다', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={[RUN]} unit="km" />);
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');

    const screenText = textOf(root);
    // 상세가 정상 렌더됐는지 확인(다른 stat 라벨로 화면 진입을 증명).
    expect(screenText).toContain('케이던스');
    // 심박 UI 는 숨겨야 한다(spec #15). 라벨/단위/값 모두 노출 금지.
    expect(screenText).not.toContain('평균 심박');
    expect(screenText).not.toContain('bpm');
  });

  test('RunScreen(RunStart) 목표 화면에도 심박 UI("심박"/"bpm")가 없다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<RunStart shoe={SHOE} />);
    });
    const screenText = textOf(renderer.root);
    expect(screenText).toContain('러닝 시작'); // 화면이 정상 렌더됨을 증명
    expect(screenText).not.toContain('심박');
    expect(screenText).not.toContain('bpm');
  });
});
