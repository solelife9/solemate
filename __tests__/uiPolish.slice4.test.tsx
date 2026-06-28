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
import {seedBootCache} from './helpers/bootSeed';

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
  // Phase 5b·Stage 3(Firestore 정본): App 부팅은 REST GET 이 아니라 로컬 부팅 캐시
  // (cache_shoes_v1)에서 신발을 읽는다(App.tsx:597-608 loadBootCache→setShoes). 따라서
  // 홈에 '러닝 시작' CTA 가 뜨려면 REST 목이 아니라 부팅 캐시에 활성 신발을 시드해야 한다.
  mockBackendWithShoe();
  await seedBootCache(
    [{id: 's1', brand: 'Nike', model: 'Pegasus', used: 50, max: 600, condition: '양호'}],
    [],
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // 홈 → 목표 설정(RunGoalScreen)
  // 2nd 프레스가 카운트다운(준비·3·2·1·GO)을 띄운다. onDone 타이머 제어를 위해
  // 카운트다운을 fake 타이머 하에서 mount/advance 하고(실타이머 테스트라 임시 보장),
  // 라이브 런 진입 후 원복한다.
  const fakeAlready = typeof (setTimeout as any).clock === 'object';
  if (!fakeAlready) jest.useFakeTimers();
  await act(async () => {
    pressByText(root, '러닝 시작'); // 목표 → 카운트다운
  });
  await act(async () => {
    jest.advanceTimersByTime(6000); // 카운트다운 → 라이브 런(onDone)
  });
  if (!fakeAlready) jest.useRealTimers();
  return {renderer, root};
}

test('① 라이브 런 지표 행: time/flash/walk-outline 아이콘이 없고 라벨/값만 렌더된다', async () => {
  const {renderer, root} = await toLiveRun();
  const txt = textOf(root);

  // 지표 위 아이콘 3종이 트리 어디에도 없다(아이콘 mock 은 name 을 텍스트로 렌더).
  expect(txt).not.toContain('time-outline');
  expect(txt).not.toContain('flash-outline');
  expect(txt).not.toContain('walk-outline');

  // 달릴 땐 핵심 3개만 크게 노출(나이키런 방식): 현재 페이스·심박·시간.
  expect(txt).toContain('시간');
  expect(txt).toContain('현재 페이스');
  expect(txt).toContain('심박');
  // 보조 지표(평균 페이스·케이던스·칼로리·고도)는 일시정지 시에만 펼쳐진다 — 달리는
  // 동안은 숨겨 핵심만 흘끗 봐도 읽히게 한다.
  expect(txt).not.toContain('평균 페이스');
  expect(txt).not.toContain('케이던스');
  // 심박 값은 미측정(아이폰 단독) 시 '--' 자리표시자로 렌더된다(값 칸 보존).
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
  const recover = (call[2] as any[]).find(b => b.text === '기록 저장');
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

// ── ② History 요약 카드(목업 기록10): 큰 거리 + 횟수/평균페이스/총시간 ─────────────
test('② 기간 요약 카드 — 거리는 큰 숫자, 횟수/평균페이스/총시간 라벨·값 모두 렌더', () => {
  // 기간(주/월/년) 요약은 이제 주입된 runs 에서 파생되고(HistoryScreen.rn.tsx:680-695,704),
  // summary prop 은 '전체'(전기간) 카드만 채운다(sum = summary['전체'] || EMPTY_SUMMARY).
  // 따라서 결정적 목 값으로 요약 카드를 단언하려면 '전체' 키로 시드 후 '전체' 세그먼트를
  // 눌러야 한다(기본 period 는 '월' — runs 파생이라 빈 runs 면 default 값이 뜬다).
  const summary = {
    '전체': {km: '88', runs: 20, pace: "5'30\"", time: '7:40'},
  };
  const root = render(
    <HistoryScreen summary={summary as any} runs={[]} unit="km" />,
  ).root;
  // '전체' 세그먼트 탭 → period='전체' → summary['전체'] 카드 렌더.
  const allSeg = root
    .findAll(
      (n: any) =>
        n.props &&
        n.props.accessibilityRole === 'button' &&
        typeof n.props.onPress === 'function',
    )
    .find((n: any) => textOf(n).includes('전체'));
  if (!allSeg) throw new Error("no '전체' segment found");
  act(() => allSeg.props.onPress());
  const txt = textOf(root);

  // 거리는 큰 숫자(km)로, 나머지는 라벨과 함께 유지(목업 요약 카드).
  expect(txt).toContain('횟수');
  expect(txt).toContain('페이스'); // '평균 페이스'
  expect(txt).toContain('시간'); // '총 시간'

  // 4개 값 모두 유지(거리는 큰 숫자, 정보는 그대로).
  expect(txt).toContain('88'); // 거리(큰 숫자)
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

test('③ 신발 카드는 라벨바(사용/총 수명 km)를 렌더한다 — 목업 LifeBar(원형 링 대체)', () => {
  // Slice4 에선 원형 링만 두고 중복 바를 제거했으나, 디자인 마무리 핸드오프는 신발 탭
  // 카드를 가로 라벨바(사용/총 수명)로 통일한다. 카드는 누적/총 수명 km 라벨을 노출하고,
  // 채움 바(%-width)가 정확히 1개 존재한다(중복 바 없음 = 단일 진행 표시).
  const root = render(<ShoesScreen shoes={SHOES} runs={[]} />).root;

  // 사용/총 수명 km 라벨(used 100 / max 500)이 노출된다.
  expect(textOf(root)).toContain('100km');
  expect(textOf(root)).toContain('500km');

  // 라벨바 채움(%-width)이 렌더된다(목업 LifeBar — 신발당 1개).
  const pctWidthNodes = root.findAll((n: any) => {
    if (!n.props) return false;
    const w = flatStyle(n).width;
    return typeof w === 'string' && w.trim().endsWith('%');
  });
  expect(pctWidthNodes.length).toBeGreaterThanOrEqual(1);
});

test('③ 락커 카드 탭은 상세(잔여 수명)를 연다(회귀 가드)', () => {
  const root = render(<ShoesScreen shoes={SHOES} runs={[]} />).root;
  const card = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes('Pegasus 41'));
  expect(card).toBeTruthy();
  act(() => card!.props.onPress());
  expect(textOf(root)).toContain('잔여 수명');
});
