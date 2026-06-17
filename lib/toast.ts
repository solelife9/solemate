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
//
// undo 패턴: showToast({message:'삭제됨', actionLabel:'실행취소', onAction:()=>restore()}).
// 사용자가 '실행취소' 를 탭하면 onAction 이 호출되고 토스트는 즉시 닫힌다. 탭하지 않으면
// durationMs(기본 TOAST_DEFAULT_DURATION_MS) 후 자동으로 닫힌다.

/** 자동 dismiss 기본 시간(ms). undo 액션이 있어도 동일하게 적용된다. */
export const TOAST_DEFAULT_DURATION_MS = 3200;

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
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

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
 */
export function showToast(config: ToastConfig): number {
  const message = String(config?.message ?? '').trim();
  if (!message) return -1;

  clearTimer();
  seq += 1;
  const id = seq;
  current = {...config, message, id};
  emit();

  const duration = config?.durationMs == null ? TOAST_DEFAULT_DURATION_MS : config.durationMs;
  if (duration > 0) {
    timer = setTimeout(() => {
      dismissToast(id);
    }, duration);
  }
  return id;
}

/**
 * 토스트를 닫는다. id 를 주면 현재 토스트가 그 id 일 때만 닫는다(이미 다른 토스트로 대체된
 * 뒤 늦게 도착한 타이머가 새 토스트를 잘못 닫는 것을 막는다). id 미지정이면 무조건 닫는다.
 */
export function dismissToast(id?: number): void {
  if (id != null && (current == null || current.id !== id)) return;
  clearTimer();
  if (current == null) return;
  current = null;
  emit();
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
