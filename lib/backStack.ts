// ============================================================================
// lib/backStack.ts — 안드로이드 하드웨어 뒤로가기 스택 (순수)
// ============================================================================
// **왜 있는가(2026-08-07 실기기 확정).** 갤럭시에서 기록 상세를 열고 시스템 뒤로가기를
// 누르면 목록으로 돌아가는 게 아니라 **앱이 통째로 종료됐다**(런처로 튕김). 저장소 전체에
// `BackHandler` 가 **0건**이었다 — iOS 만 보고 만든 흔적이 그대로 남아 있었다.
// 안드로이드 사용자가 가장 많이 누르는 버튼이고 Play 품질 가이드라인 항목이다.
//
// ── 왜 라우터 없이 이 방식인가 ───────────────────────────────────────────────
// 이 앱에는 라우터가 없다(CLAUDE.md — 라우팅 = App.tsx 렌더 함수의 early-return 사다리).
// 그래서 "지금 화면 맨 위에 뭐가 있나"를 아는 곳이 **한 군데도 없다.** 게다가 드릴다운의
// 절반은 App.tsx 가 아니라 탭 컴포넌트 **내부 state** 다:
//     HistoryScreen.detail · ShoesScreen.detail · ProfileScreen.open
// App.tsx 에서 그것들을 닫을 방법이 없다. 조건을 App.tsx 로 끌어올리는 것도 답이 아니다 —
// 화면을 하나 추가할 때마다 두 곳(렌더 사다리 + 뒤로가기 분기)을 같이 고쳐야 하고,
// 언젠가 한 곳을 빠뜨린다.
//
// 그래서 **역순 스택**을 쓴다. 닫을 것이 있는 화면이 살아 있는 동안 자기 닫기 함수를
// 등록하고, 뒤로가기는 **가장 마지막에 등록된 것**부터 부른다. 마지막에 등록된 것이 곧
// 화면 맨 위다(늦게 마운트된 것이 위에 그려지므로). React Navigation 도 내부적으로 같은
// 구조다(`beforeRemove` 리스너 체인).
//
// ── 지키는 선 ────────────────────────────────────────────────────────────────
//  · **러닝 중에는 아무것도 닫지 않는다.** 뒤로가기 한 번에 러닝이 날아가면 그건 Iron Law
//    (거리/시간 데이터 유실 금지) 위반이다. 러닝 화면은 아예 등록하지 않는다.
//  · **강제 게이트도 닫히지 않는다**(로그인·필수 업데이트·최초 온보딩·공개범위 동의).
//    뒤로가기로 우회되면 게이트가 아니다.
//  · **react-native import 0**(react 의 useEffect 만 쓴다). 전역 상태는 모듈 스코프 배열
//    하나뿐이라 테스트에서 그대로 돌릴 수 있고, 실제 `BackHandler` 배선은 App.tsx 한 곳뿐이다.
// ============================================================================
import {useEffect, useRef} from 'react';

/** 등록된 닫기 함수. true 를 돌려주면 "내가 처리했다"(뒤로가기 소비). */
export type BackCloser = () => boolean;

/** 등록 순서대로 쌓인다. 마지막이 화면 맨 위. */
let stack: BackCloser[] = [];

/**
 * 닫기 함수를 등록한다. 돌려받은 함수를 부르면 해제된다(useEffect cleanup 용).
 *
 * 해제는 **자기 자신만** 빼낸다 — 배열 끝을 pop 하지 않는다. 화면이 겹쳐 있을 때
 * 언마운트 순서가 등록 순서의 역순이라는 보장이 없기 때문이다(React 는 형제 언마운트
 * 순서를 약속하지 않는다). 같은 함수 참조가 여러 번 들어오는 일은 없다 —
 * 훅이 매 등록마다 새 래퍼를 만든다.
 */
export function pushBackCloser(fn: BackCloser): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/**
 * 뒤로가기 1회를 처리한다. 맨 위부터 내려가며 **처음으로 true 를 돌려준 것**에서 멈춘다.
 *
 * false 를 돌려주는 등록도 허용한다 — "나는 지금 닫을 게 없다"(예: 상세를 안 연 탭).
 * 그러면 그 아래로 넘어간다. 등록해 두고 조건으로 거르는 편이, 조건이 바뀔 때마다
 * 등록/해제를 반복하는 것보다 실수가 적다.
 *
 * @returns 누군가 처리했으면 true(= 앱을 닫지 않는다).
 */
export function handleBack(): boolean {
  // 사본을 역순으로 돈다 — closer 가 실행 중에 다른 closer 를 해제할 수 있다
  // (닫기가 언마운트를 부르는 게 정상 흐름이다). 원본을 직접 돌면 인덱스가 어긋난다.
  const snapshot = stack.slice();
  for (let i = snapshot.length - 1; i >= 0; i--) {
    try {
      if (snapshot[i]()) return true;
    } catch {
      // 닫기 하나가 던져도 뒤로가기 전체를 죽이지 않는다 — 아래로 계속 내려간다.
    }
  }
  return false;
}

/** 지금 쌓여 있는 개수(테스트·진단용). */
export function backStackSize(): number {
  return stack.length;
}

/** 테스트 격리용. 프로덕션 코드에서는 부르지 않는다. */
export function resetBackStack(): void {
  stack = [];
}

/**
 * 화면이 살아 있는 동안 뒤로가기 닫기를 등록한다.
 *
 * ```tsx
 * useBackClose(detail != null, () => { setDetail(null); return true; });
 * ```
 *
 * ⚠️ `active` 가 false 면 등록 자체를 하지 않는다 — 그래야 그 아래 화면이 뒤로가기를
 * 받는다. 조건 없이 등록하고 안에서 false 를 돌려줘도 동작은 같지만, 스택이 계속 자라
 * 진단이 어려워진다.
 *
 * ⚠️ `onBack` 은 **매 렌더의 최신 것**이 불린다(deps 에 넣지 않는다). 화면 state 를 닫는
 * 함수는 렌더마다 새로 만들어지는 게 보통이라, deps 에 넣으면 매 렌더 재등록되면서
 * 스택 순서가 뒤집힌다 — 그러면 형제 화면 중 **나중에 리렌더된 쪽**이 맨 위가 돼 버린다.
 */
export function useBackClose(active: boolean, onBack: BackCloser): void {
  // 최신 콜백을 담아 두는 상자. ref 대신 지역 클로저를 쓰면 등록 시점의 낡은 state 를 본다.
  const box = useLatest(onBack);
  useEffect(() => {
    if (!active) return;
    return pushBackCloser(() => box.current());
  }, [active, box]);
}

/** onBack 을 매 렌더 갱신해 두는 최소 ref 박스(react-hooks/exhaustive-deps 안전). */
function useLatest(fn: BackCloser): {current: BackCloser} {
  const box = useRef(fn);
  box.current = fn;
  return box;
}
