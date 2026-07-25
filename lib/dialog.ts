// lib/dialog — 커스텀 다이얼로그(A안 '시스템 정합', 2026-07-25 민우님 확정)의 명령형
// API + 순수 상태 store. 표시는 DialogHost.tsx 가 담당한다(ToastHost 와 같은 구조 —
// 순수 TS store 라 타이밍/버튼 로직을 단독 테스트할 수 있고, UI/JSX 는 전혀 없다).
//
// 왜 커스텀인가(HIG 심사 P1 #17): 네이티브 Alert.alert 는 Pretendard 도 keego 재질도
// 안 탄다. A안 = iOS 순정 얼럿 문법(중앙 카드·세로 버튼 스택·구분선)을 keego 재질
// (CARD 표면·헤어라인·radius)로 재해석 — 학습 비용 0 + 브랜드 정합.
//
// 마이그레이션: 시그니처를 Alert.alert(title, message?, buttons?) 와 동일하게 맞춰
// 호출부 치환이 기계적이 되게 한다. 스크림 탭은 닫지 않는다(얼럿 시맨틱 — 명시적 선택
// 강제, iOS 동일). 표시 중 새 다이얼로그가 오면 대체한다(last-wins — 얼럿 중첩은
// 설계상 피해야 할 상황이라 큐를 두지 않는다).

/** Alert.alert 와 동일한 버튼 모양 — style 로 굵기/색이 정해진다(DialogHost). */
export type DialogButton = {
  text: string;
  /** default=T1 500 · cancel=T1 500(항상 마지막 배치 권장) · destructive=DANGER 700. */
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type DialogEntry = {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
};

type Listener = (dialog: DialogEntry | null) => void;

let listeners: Listener[] = [];
let current: DialogEntry | null = null;
let seq = 0;

function emit(): void {
  for (const l of [...listeners]) {
    try {
      l(current);
    } catch {
      /* 리스너 에러는 다른 리스너 통지를 막지 않는다 */
    }
  }
}

/** 다이얼로그 변경 구독(DialogHost). 구독 즉시 현재 상태 1회 전달, 반환값 = 해제 함수. */
export function subscribeDialog(listener: Listener): () => void {
  listeners.push(listener);
  listener(current);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/** 현재 표시 중인 다이얼로그(없으면 null) — 테스트/디버그용. */
export function getCurrentDialog(): DialogEntry | null {
  return current;
}

/**
 * 다이얼로그를 띄운다 — Alert.alert 호환 시그니처. buttons 미지정 시 [{text:'확인'}].
 * title 이 비면 아무것도 하지 않고 -1. 반환값은 이 다이얼로그의 id.
 */
export function showDialog(title: string, message?: string, buttons?: DialogButton[]): number {
  const t = String(title ?? '').trim();
  if (!t) return -1;
  seq += 1;
  current = {
    id: seq,
    title: t,
    message: message != null && String(message).trim() ? String(message).trim() : undefined,
    buttons: buttons && buttons.length ? buttons : [{text: '확인'}],
  };
  emit();
  return seq;
}

/**
 * 버튼 탭 처리: 다이얼로그를 닫고 해당 버튼의 onPress 를 호출한다(얼럿 시맨틱 — 선택
 * 즉시 소멸). onPress 가 던져도 삼킨다(다이얼로그 상호작용이 앱을 깨면 안 됨).
 */
export function pressDialogButton(index: number): void {
  const d = current;
  if (d == null) return;
  const btn = d.buttons[index];
  current = null;
  emit();
  if (btn && typeof btn.onPress === 'function') {
    try {
      btn.onPress();
    } catch {
      /* graceful */
    }
  }
}

/**
 * 하드웨어 back(Android) 등 시스템 닫기 — cancel 버튼이 있으면 그것을 실행, 없으면
 * 아무것도 하지 않는다(명시적 선택 강제 유지).
 */
export function cancelDialog(): void {
  const d = current;
  if (d == null) return;
  const idx = d.buttons.findIndex(b => b.style === 'cancel');
  if (idx >= 0) pressDialogButton(idx);
}

/** 무조건 닫기 — 테스트 격리/화면 전환 청소용(onPress 호출 없음). */
export function dismissDialog(): void {
  if (current == null) return;
  current = null;
  emit();
}
