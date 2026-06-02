/**
 * uiPolish.slice4.test.tsx — Slice-4 UI 폴리시 3건 행동/회귀 가드.
 *
 * 관찰 가능한 렌더 출력(react-test-renderer 트리)만 단언한다(test_critic 요건):
 *
 *   ① 러닝 중/완주 화면 지표 행에서 지표 위 Ionicons(time-outline/flash-outline/
 *      walk-outline)를 제거 — 숫자+라벨만 남는다. 라이브 런 화면 트리에 세 아이콘
 *      이름이 하나도 없고, 라벨(시간/평균 페이스/케이던스)과 값은 그대로 렌더된다.
 *   ② HistoryScreen 기간 요약을 콤팩트화하되 정보(거리/횟수/페이스/시간 라벨+값)는
 *      모두 보존된다 — 4개 라벨과 4개 값이 모두 렌더된다.
 *   ③ ShoesScreen 신발 카드 하단의 중복 진행바(track/trackFill: 링과 동일 pct를
 *      width %로 다시 그리던 바)를 제거 — 카드 서브트리에 width '%' 스타일 노드가
 *      없고(바 미렌더), 원형 링의 잔여율 %는 그대로 렌더된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {StyleSheet, Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from '../App';
import HistoryScreen from '../HistoryScreen.rn';
import ShoesScreen from '../ShoesScreen.rn';
import {Shoe} from '../theme';
import {SNAPSHOT_KEY, RunSnapshot} from '../lib/runPersistence';
import {fmtTime, fmtPace} from '../lib/format';

function textOf(node: any): string {
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

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(el);
  });
  return r;
}

function flatStyle(node: any): any {
  const st = node.props.style;
  const resolved = typeof st === 'function' ? st({pressed: false}) : st;
  return StyleSheet.flatten(resolved) || {};
}

// ── ① 러닝 화면: 지표 아이콘 제거, 숫자+라벨만 ────────────────────────────────
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

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

async function toLiveRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // 홈 → 목표 설정(RunStart)
  await act(async () => {
    pressByText(root, '러닝 시작'); // 목표 설정 → 라이브 런
  });
  return {renderer, root};
}

test('① 라이브 런 지표 행: time/flash/walk-outline 아이콘이 없고 라벨/값만 렌더된다', async () => {
  const {renderer, root} = await toLiveRun();
  const txt = textOf(root);

  // 지표 위 아이콘 3종이 트리 어디에도 없다(아이콘 mock 은 name 을 텍스트로 렌더).
  expect(txt).not.toContain('time-outline');
  expect(txt).not.toContain('flash-outline');
  expect(txt).not.toContain('walk-outline');

  // 라벨(숫자+라벨 구성)은 그대로 — 정보 손실 없음.
  expect(txt).toContain('시간');
  expect(txt).toContain('평균 페이스');
  expect(txt).toContain('케이던스');
  // 케이던스 값은 아직 보폭 입력이 없어 '--' 자리표시자로 렌더된다(값 칸 보존).
  expect(txt).toContain('--');

  act(() => renderer.unmount());
});

// ── ①b 완주/요약(done) 화면: 라이브런과 별개의 중복 inline 지표 행을 가드한다 ──
// App.tsx 의 요약 행(phase==='done')은 라이브런 행과 공유 컴포넌트가 아닌 별도
// inline JSX 다. 라이브런 가드(테스트 ①)는 요약 행을 구동하지 못하므로, 요약 행에
// 아이콘이 재추가돼도 통과해버린다. 여기서는 미완료-런 스냅샷 복구 경로로 done
// 화면을 결정적으로 시드(GPS 불필요)해 요약 지표 행을 직접 단언한다.
const RESUME: RunSnapshot = {
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
  cadence: 172,
  location: '서울',
  savedAt: 1_700_000_900_000,
};

function mockBackendEmpty() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes') || u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

async function tick(n = 6) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// 스냅샷을 시드 → 마운트 → '미완료 런 발견' Alert 의 '복구' 선택 → done/요약 화면.
async function recoverToSummary() {
  mockBackendEmpty();
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(RESUME));
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  await tick(5);
  const call = alertSpy.mock.calls.find(c => String(c[0]).includes('미완료 런'));
  if (!call) throw new Error('recover Alert was not shown');
  const recover = (call[2] as any[]).find(b => b.text === '복구');
  await act(async () => {
    recover.onPress();
  });
  alertSpy.mockRestore();
  return renderer;
}

test('①b 완주/요약 지표 행: time/flash/walk-outline 아이콘이 없고 라벨/값만 렌더된다', async () => {
  const renderer = await recoverToSummary();
  const root = renderer.root;
  const txt = textOf(root);

  // 요약 화면에 도달했음을 확정(라이브런이 아니라 done 화면) — 저장/버리기 액션.
  expect(txt).toContain('저장하기');
  expect(txt).toContain('버리기');

  // 요약 지표 행 위 아이콘 3종이 트리 어디에도 없다(아이콘 mock 은 name 을 텍스트로
  // 렌더하므로, 재추가 시 이 단언이 깨진다). 라이브런 가드와 대칭.
  expect(txt).not.toContain('time-outline');
  expect(txt).not.toContain('flash-outline');
  expect(txt).not.toContain('walk-outline');

  // 라벨은 그대로 — 정보 손실 없음.
  expect(txt).toContain('시간');
  expect(txt).toContain('평균 페이스');
  expect(txt).toContain('케이던스');

  // 값도 그대로(finTime/finKm→평균페이스/finCad). 스냅샷의 결정적 값으로 단언.
  expect(txt).toContain(fmtTime(RESUME.elapsed)); // 시간 값
  expect(txt).toContain(fmtPace(RESUME.dist, RESUME.elapsed)); // 평균 페이스 값
  expect(txt).toContain(String(RESUME.cadence)); // 케이던스 값(172)

  act(() => renderer.unmount());
});

// ── ② History 기간 요약: 콤팩트화해도 정보(라벨+값)는 모두 보존 ────────────────
test('② 기간 요약 4칸(거리/횟수/페이스/시간) 라벨과 값이 모두 렌더된다', () => {
  const summary = {
    '월': {km: '88', runs: 20, pace: "5'30\"", time: '7:40'},
  };
  const root = render(
    <HistoryScreen summary={summary as any} runs={[]} unit="km" />,
  ).root;
  const txt = textOf(root);

  // 4개 라벨 모두 유지.
  expect(txt).toContain('거리');
  expect(txt).toContain('횟수');
  expect(txt).toContain('페이스');
  expect(txt).toContain('시간');

  // 4개 값 모두 유지(높이만 축소, 정보는 그대로).
  expect(txt).toContain('88'); // 거리
  expect(txt).toContain('20'); // 횟수
  expect(txt).toContain("5'30\""); // 페이스
  expect(txt).toContain('7:40'); // 시간
});

test('② 기간 세그먼트 항목은 접근성 터치 타깃(minHeight ≥ 44)을 유지한다', () => {
  const root = render(<HistoryScreen runs={[]} unit="km" />).root;
  const segs = root.findAll(
    (n: any) =>
      n.props &&
      n.props.accessibilityRole === 'button' &&
      n.props.accessibilityState &&
      typeof n.props.accessibilityState.selected === 'boolean' &&
      typeof n.props.onPress === 'function',
  );
  expect(segs.length).toBeGreaterThan(0);
  segs.forEach(seg => {
    const st = flatStyle(seg);
    const target =
      typeof st.height === 'number'
        ? st.height
        : typeof st.minHeight === 'number'
        ? st.minHeight
        : 0;
    expect(target).toBeGreaterThanOrEqual(44);
  });
});

// ── ③ ShoesScreen 신발 카드: 중복 진행바 제거, 원형 링 유지 ────────────────────
const SHOES: Shoe[] = [
  // used 100 / max 500 → 잔여 400km, 잔여율 80% → 옛 trackFill width '80%'.
  {id: 's1', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 500, condition: '양호'},
];

test('③ 신발 카드에 width "%" 진행바(track)가 없고, 원형 링의 잔여율 %는 렌더된다', () => {
  const root = render(<ShoesScreen shoes={SHOES} runs={[]} />).root;

  // 원형 링(잔여율 80%)은 그대로 — 텍스트로 노출된다.
  expect(textOf(root)).toContain('80');

  // 제거된 중복 바(trackFill)는 style.width 가 백분율 문자열인 유일한 노드였다.
  // 카드 어디에도 백분율 width 스타일 노드가 없어야 한다(바 미렌더 단언).
  const pctWidthNodes = root.findAll((n: any) => {
    if (!n.props) return false;
    const w = flatStyle(n).width;
    return typeof w === 'string' && w.trim().endsWith('%');
  });
  expect(pctWidthNodes.length).toBe(0);
});

test('③ track 제거 후에도 락커 카드 탭은 상세(남은 수명)를 연다(회귀 가드)', () => {
  const root = render(<ShoesScreen shoes={SHOES} runs={[]} />).root;
  const card = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes('Pegasus 41'));
  expect(card).toBeTruthy();
  act(() => card!.props.onPress());
  expect(textOf(root)).toContain('남은 수명');
});
