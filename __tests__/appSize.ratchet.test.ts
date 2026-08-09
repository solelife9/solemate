/**
 * `App.tsx` 크기 래칫 — **줄어들기만 한다.**
 *
 * 왜 있나 (2026-08-09)
 * ----------------------------------------------------------------------------
 * 2026-07-26 감사 F-03 1단계에서 러닝 엔진 1,324줄을 `screens/RunEngine.tsx` 로
 * 떼어냈다. 그런데 **App.tsx 는 줄지 않았다** — 그때 3,300줄이었고 2주 뒤 3,408줄로
 * 오히려 늘어 있었다. 뗀 만큼 다시 채운 것이다.
 *
 * 분해가 실패하는 방식은 "안 하는 것"이 아니라 **"하고 나서 되자라는 것"** 이다.
 * 한 번에 20줄씩 늘어나는 건 아무도 리뷰에서 못 잡는다. 그래서 사람 대신 여기서 센다.
 *
 * 규약
 * ----------------------------------------------------------------------------
 * · 이 상한들은 **내리기만 한다.** 분해가 진행되면 그만큼 낮춰 잠근다.
 * · **올려야 할 것 같으면 그건 잘못 짚은 것이다** — 새 기능은 App.tsx 가 아니라
 *   `hooks/`·`screens/`·`lib/` 에 넣고 App.tsx 에서는 호출만 한다.
 * · 상한이 아니라 "현재값 + 여유"를 쓰지 않는다. 여유는 곧 다시 채워진다.
 *
 * 왜 훅 개수도 세나: 줄 수는 주석을 지워도 줄어든다. 이 파일의 진짜 부담은 **한 컴포넌트가
 * 들고 있는 상태와 부수효과의 수**다(useEffect 44개는 서로의 실행 순서를 보장하지 않는다).
 * 줄 수와 훅 수를 같이 잠가야 "주석만 지우고 상한을 통과"하는 우회가 막힌다.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
// 끝 개행을 떼고 센다 — `wc -l` 과 같은 숫자여야 사람이 대조할 수 있다.
const LINES = SRC.replace(/\n$/, '').split('\n').length;

/**
 * 내리기만 한다.
 * · 3408 — 2026-08-09 분해 착수 시점
 * · 3338 — 설정 클러스터 → `hooks/useSettings.ts`
 * · 3221 — 심박 보강 → `hooks/useHeartRateRepair.ts`
 * · 3074 — 워치·홈위젯 연동 → `hooks/useWatchSync.ts`
 * · 2946 — 러닝 시작 관문 → `hooks/useRunEntryGate.ts`
 * · 2874 — 파생 통계 → `hooks/useDerivedStats.ts`
 */
const MAX_LINES = 2874;

/**
 * 한 컴포넌트가 지는 상태·부수효과의 상한. 내리기만 한다.
 * · 착수: useState 53 · useEffect 45 · useMemo 36 · useRef 20
 * · useSettings 뒤: useState 44 · useEffect 44 · useRef 19
 * · useHeartRateRepair 뒤: useEffect 41 · useRef 18
 * · useWatchSync 뒤: useEffect 37 · useRef 17
 * · useRunEntryGate 뒤: useEffect 36
 * · useDerivedStats 뒤: useMemo 23
 */
const MAX_HOOKS: Record<string, number> = {
  useState: 44,
  useEffect: 36,
  useMemo: 23,
  useRef: 17,
};

const countHook = (name: string) =>
  (SRC.match(new RegExp(`\\b${name}\\s*[<(]`, 'g')) ?? []).length;

describe('App.tsx 크기 래칫 (분해 — 되자람 방지)', () => {
  test(`줄 수가 ${MAX_LINES} 이하다 (넘으면 상한을 올리지 말고 밖으로 뺀다)`, () => {
    expect(LINES).toBeLessThanOrEqual(MAX_LINES);
  });

  for (const [hook, max] of Object.entries(MAX_HOOKS)) {
    test(`${hook} 가 ${max}개 이하다`, () => {
      expect(countHook(hook)).toBeLessThanOrEqual(max);
    });
  }

  test('상한이 현재값보다 크게 벌어져 있지 않다 (분해 뒤 잠그는 것을 잊지 않게)', () => {
    // 여유가 200줄 넘게 벌어졌다면 분해는 했는데 **상한을 안 내린 것**이다.
    // 그 상태로 두면 래칫이 아니라 그냥 넉넉한 한도라, 다시 자라도 안 걸린다.
    expect(MAX_LINES - LINES).toBeLessThanOrEqual(200);
  });
});
