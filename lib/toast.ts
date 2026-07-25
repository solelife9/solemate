// lib/toast — RN 내장만 쓰는 화면 하단 스낵바(토스트)의 명령형 API + 순수 상태 store.
//
// 설계 원칙(iron law):
//   1) 새 네이티브/외부 라이브러리 금지 — react-native-toast-message 등을 절대 설치하지
//      않는다. 이 모듈은 순수 TS(스토어)이고, 표시는 ToastHost.tsx 가 RN 내장 Animated 만으로
//      그린다. 여기엔 UI/JSX 가 전혀 없어 타이밍/큐 로직을 단독으로 테스트할 수 있다.
//   2) 단일 호스트 — <ToastHost/> 를 App 루트에 1회만 마운트하고, 앱 어디서든 showToast()
//      를 부르면 그 호스트가 받아 그린다(전역 pub/sub). 한 번에 하나의 토스트만 보이며,
//      새 토스트가 오면 이전 것을 즉시 대체한다(자동 dismiss 타이머도 새로 시작).
//   3) graceful — onAction 콜백이 던져도 위로 전파하지 않는다(토스트 액션이 앱을 깨면 안 됨).
//   4) undo 보존(2026-07-24 HIG 심사 P1 #52) — 액션(actionLabel) 토스트가 표시 중일 때
//      '액션 없는' 정보 토스트가 오면 즉시 대체하지 않고 큐(최근 1건)에 대기시켰다가,
//      액션 토스트가 끝나면(자동 소멸/탭/명시 dismiss) 표시한다. 파괴적 액션의 유일한
//      복구 경로(실행취소)가 뒤이은 "저장됐어요" 류에 소리 없이 증발하는 것을 막는다.
//      단, 새 '액션' 토스트는 기존 액션 토스트를 즉시 대체한다 — 최신 복구 경로가 우선.
//
// undo 패턴: showToast({message:'삭제됨', actionLabel:'실행취소', onAction:()=>restore()}).
// 사용자가 '실행취소' 를 탭하면 onAction 이 호출되고 토스트는 즉시 닫힌다. 탭하지 않으면
// durationMs(기본 TOAST_DEFAULT_DURATION_MS) 후 자동으로 닫힌다.

/** 자동 dismiss 기본 시간(ms) — 액션 없는 정보 토스트. */
export const TOAST_DEFAULT_DURATION_MS = 3200;

/** 액션(실행취소 등) 토스트의 자동 dismiss 기본 시간(ms). 파괴적 액션의 유일한 복구
 *  경로가 3.2초 만에 사라지는 것은 도달 불가에 가깝다(VoiceOver 사용자는 특히) —
 *  HIG 스낵바 관용(액션 있는 토스트는 더 오래)에 맞춰 6초(2026-07-24 심사 P0). */
export const TOAST_ACTION_DURATION_MS = 6000;

/** undo(실행취소) 토스트의 표준 액션 라벨 — 호출부가 통일해서 쓰도록 export. */
export const TOAST_UNDO_LABEL = '실행취소';

/** showToast 입력. message 만 필수, 나머지는 선택(undo 는 actionLabel+onAction). */
export type ToastConfig = {
  /** 본문 메시지(필수). 빈 문자열은 무시된다(토스트를 띄우지 않음). */
  message: string;
  /** 액션 버튼 라벨(예: '실행취소'). 없으면 버튼이 그려지지 않는다. */
  actionLabel?: string;
  /** 액션 버튼 탭 시 호출되는 콜백. 호출 후 토스트는 닫힌다. */
  onAction?: () => void;
  /** 자동 dismiss 시간(ms). 미지정 시 TOAST_DEFAULT_DURATION_MS. 0/음수면 자동 dismiss 안 함. */
  durationMs?: number;
};

/** store/호스트가 들고 다니는 토스트 1건(설정 + 식별용 id). */
export type ToastEntry = ToastConfig & {id: number};

type Listener = (toast: ToastEntry | null) => void;

let listeners: Listener[] = [];
let current: ToastEntry | null = null;
// undo 보존 큐 — 액션 토스트가 표시 중일 때 대기하는 '액션 없는' 정보 토스트(최근 1건만,
// 스낵바 폭주 방지 — 더 오래된 정보 토스트는 버린다). 표시 전이므로 타이머는 없다.
let pending: ToastEntry | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 액션 버튼이 있는 토스트인가(= undo 류, 보존 대상). */
function hasToastAction(config: ToastConfig): boolean {
  return !!(config?.actionLabel && String(config.actionLabel).trim());
}

/** 자동 dismiss 시간(ms) 해석 — 미지정 시 액션 유무에 따른 기본값. */
function resolveDuration(config: ToastConfig): number {
  return config?.durationMs == null
    ? (hasToastAction(config) ? TOAST_ACTION_DURATION_MS : TOAST_DEFAULT_DURATION_MS)
    : config.durationMs;
}

/** 토스트를 실제로 표시한다: current 교체 + 통지 + 자동 dismiss 타이머 시작. */
function present(entry: ToastEntry): void {
  clearTimer();
  current = entry;
  emit();
  const duration = resolveDuration(entry);
  if (duration > 0) {
    timer = setTimeout(() => {
      dismissToast(entry.id);
    }, duration);
  }
}

function emit(): void {
  // 스냅샷을 돌며 호출(리스너가 구독 해제해도 안전).
  for (const l of [...listeners]) {
    try {
      l(current);
    } catch {
      /* 리스너 에러는 다른 리스너 통지를 막지 않는다 */
    }
  }
}

function clearTimer(): void {
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * 토스트 변경을 구독한다(ToastHost 가 마운트 시 호출). 구독 즉시 현재 상태를 1회 전달하고,
 * 이후 변경마다 통지한다. 반환값은 구독 해제 함수.
 */
export function subscribeToast(listener: Listener): () => void {
  listeners.push(listener);
  listener(current); // 현재 상태 즉시 동기화
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/** 현재 표시 중인 토스트(없으면 null). 테스트/디버그용 동기 조회. */
export function getCurrentToast(): ToastEntry | null {
  return current;
}

/**
 * 토스트를 띄운다(앱 어디서든 호출). 한 번에 하나만 보이므로 기존 토스트는 즉시 대체하고
 * 자동 dismiss 타이머도 새로 건다. message 가 비면 아무것도 하지 않고 -1 을 돌려준다.
 * 반환값은 이 토스트의 id(dismissToast/runToastAction 의 타깃 지정에 쓸 수 있음).
 *
 * 예외(undo 보존): 액션 토스트가 표시 중일 때 '액션 없는' 토스트는 즉시 대체하지 않고
 * 큐(최근 1건)에 대기했다가 액션 토스트가 끝나면 표시된다. 이때도 id 는 즉시 반환되며,
 * 그 id 로 dismissToast 하면 대기 중에도 조용히 제거된다. 새 '액션' 토스트는 기존 액션
 * 토스트를 즉시 대체한다(최신 복구 경로 우선).
 */
export function showToast(config: ToastConfig): number {
  const message = String(config?.message ?? '').trim();
  if (!message) return -1;

  seq += 1;
  const id = seq;
  const entry: ToastEntry = {...config, message, id};

  // undo 보존: 액션 토스트 표시 중 + 새 토스트에 액션 없음 → 대기(최근 1건만 유지).
  if (current != null && hasToastAction(current) && !hasToastAction(entry)) {
    pending = entry; // 이미 대기 중이던 더 오래된 정보 토스트는 버린다.
    return id;
  }

  present(entry);
  return id;
}

/**
 * 토스트를 닫는다. id 를 주면 현재 토스트가 그 id 일 때만 닫는다(이미 다른 토스트로 대체된
 * 뒤 늦게 도착한 타이머가 새 토스트를 잘못 닫는 것을 막는다). id 미지정이면 무조건 닫는다.
 * id 가 큐 대기 중인 토스트를 가리키면 표시 없이 조용히 큐에서 제거한다.
 * 액션 토스트가 닫히면(어떤 경로든) 대기 중이던 정보 토스트를 이어서 표시한다(큐 방출).
 */
export function dismissToast(id?: number): void {
  // 큐 대기 중인 토스트를 타깃한 dismiss — 아직 표시 전이므로 통지 없이 제거만 한다.
  if (id != null && pending != null && pending.id === id) {
    pending = null;
    return;
  }
  if (id != null && (current == null || current.id !== id)) return;
  clearTimer();
  if (current == null) {
    if (id == null) pending = null; // 전체 닫기 — 대기분도 함께 정리(방어적).
    return;
  }
  current = null;
  // 큐 방출: 액션 토스트가 끝났으니 대기하던 정보 토스트를 표시(자기 타이머는 지금 시작).
  if (pending != null) {
    const next = pending;
    pending = null;
    present(next); // null 깜빡임 없이 곧장 다음 토스트로 교체 통지.
    return;
  }
  emit();
}

// ── 하단 클리어런스(탭바 회피) ────────────────────────────────────────────────
// 플로팅 탭바 독이 떠 있는 동안 토스트가 그 '위'에 그려지도록, 독(TabBar)이 마운트 중
// 자기 높이를 여기 알린다. ToastHost 는 이 값을 구독해 bottom 오프셋에 더한다.
// (2026-07-24 심사 P0 #3 — 토스트가 탭바를 3.2초 가리고 실행취소가 탭 터치와 충돌.)
let clearance = 0;
let clearanceListeners: Array<(px: number) => void> = [];

/** 토스트 하단 클리어런스(px)를 설정한다. TabBar 가 마운트 시 독 높이, 언마운트 시 0. */
export function setToastClearance(px: number): void {
  const v = Math.max(0, px || 0);
  if (clearance === v) return;
  clearance = v;
  for (const l of [...clearanceListeners]) {
    try {
      l(clearance);
    } catch {
      /* 리스너 에러는 다른 리스너 통지를 막지 않는다 */
    }
  }
}

/** 현재 클리어런스(px). ToastHost 초기값/테스트용. */
export function getToastClearance(): number {
  return clearance;
}

/** 클리어런스 변경 구독(ToastHost). 반환값은 구독 해제 함수. */
export function subscribeToastClearance(listener: (px: number) => void): () => void {
  clearanceListeners.push(listener);
  return () => {
    clearanceListeners = clearanceListeners.filter(l => l !== listener);
  };
}

/**
 * 액션 버튼 탭 처리: 현재 토스트의 onAction 을 호출하고 토스트를 닫는다. id 를 주면 그 id 가
 * 현재 토스트일 때만 동작한다. onAction 이 던져도 삼켜 토스트는 정상적으로 닫힌다(graceful).
 */
export function runToastAction(id?: number): void {
  const t = current;
  if (t == null) return;
  if (id != null && t.id !== id) return;
  const fn = t.onAction;
  dismissToast(t.id);
  if (typeof fn === 'function') {
    try {
      fn();
    } catch {
      /* 액션 콜백 에러는 삼킨다 — 토스트 상호작용이 앱을 깨면 안 된다 */
    }
  }
}
