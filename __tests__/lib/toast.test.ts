/**
 * lib/toast — 토스트 store 행동 테스트.
 *
 * 관찰 가능한 결과를 단언한다: showToast 가 구독자에게 토스트를 통지하는가, durationMs 후
 * 자동으로 null 을 통지(자동 dismiss)하는가, runToastAction 이 onAction 을 호출하고 토스트를
 * 닫는가, 새 토스트가 이전 것을 즉시 대체하고 옛 타이머가 새 토스트를 잘못 닫지 않는가,
 * onAction 이 던져도 토스트가 정상적으로 닫히는가(graceful).
 *
 * @format
 */

import {
  showToast,
  dismissToast,
  runToastAction,
  subscribeToast,
  getCurrentToast,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_ACTION_DURATION_MS,
  TOAST_UNDO_LABEL,
  ToastEntry,
} from '../../lib/toast';

/** 잔여 토스트 전부 제거 — dismiss 는 큐(대기 1건)를 방출하므로 빌 때까지 반복해 배수한다. */
function drainToasts(): void {
  dismissToast(); // current 닫기(+대기분 있으면 방출돼 current 로 승격)
  dismissToast(); // 방출된 대기분까지 닫기(큐는 최대 1건이라 2회면 충분)
}

beforeEach(() => {
  jest.useFakeTimers();
  drainToasts(); // 이전 테스트 잔여 토스트/타이머 제거(모듈 전역 상태 격리)
});

afterEach(() => {
  drainToasts();
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('showToast → 구독자 통지', () => {
  test('showToast 후 구독자가 메시지를 받고 getCurrentToast 가 그 토스트를 반환한다', () => {
    const seen: (ToastEntry | null)[] = [];
    const unsub = subscribeToast(t => seen.push(t));
    // 구독 즉시 현재 상태(null) 1회 통지.
    expect(seen).toEqual([null]);

    showToast({message: '저장됐어요'});
    const cur = getCurrentToast();
    expect(cur).not.toBeNull();
    expect(cur!.message).toBe('저장됐어요');
    // 구독자도 같은 토스트를 통지받았다.
    expect(seen[seen.length - 1]!.message).toBe('저장됐어요');
    unsub();
  });

  test('빈 메시지는 토스트를 띄우지 않는다(-1 반환, 상태 변화 없음)', () => {
    const id = showToast({message: '   '});
    expect(id).toBe(-1);
    expect(getCurrentToast()).toBeNull();
  });
});

describe('자동 dismiss(durationMs)', () => {
  test('기본 시간이 지나면 토스트가 자동으로 닫힌다(null 통지)', () => {
    showToast({message: '잠깐 보여요'});
    expect(getCurrentToast()).not.toBeNull();

    // 기본 시간 직전엔 아직 살아 있다.
    jest.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS - 1);
    expect(getCurrentToast()).not.toBeNull();

    // 기본 시간이 지나면 닫힌다.
    jest.advanceTimersByTime(1);
    expect(getCurrentToast()).toBeNull();
  });

  test('durationMs 를 직접 주면 그 시점에 닫힌다', () => {
    showToast({message: '짧게', durationMs: 500});
    jest.advanceTimersByTime(499);
    expect(getCurrentToast()).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(getCurrentToast()).toBeNull();
  });

  test('durationMs<=0 이면 자동 dismiss 하지 않는다(타이머 없음)', () => {
    showToast({message: '계속 떠 있어요', durationMs: 0});
    jest.advanceTimersByTime(60_000);
    expect(getCurrentToast()).not.toBeNull();
  });
});

describe('runToastAction(undo)', () => {
  test('액션 실행 시 onAction 을 호출하고 토스트를 닫는다', () => {
    const onAction = jest.fn();
    showToast({message: '신발 삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction});

    runToastAction();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(getCurrentToast()).toBeNull();
  });

  test('액션 실행 후엔 자동 dismiss 타이머가 onAction 을 다시 부르지 않는다', () => {
    const onAction = jest.fn();
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction, durationMs: 1000});
    runToastAction();
    expect(onAction).toHaveBeenCalledTimes(1);

    // 원래 자동 dismiss 시점을 지나도 onAction 은 다시 호출되지 않고 상태도 그대로 null.
    jest.advanceTimersByTime(5000);
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(getCurrentToast()).toBeNull();
  });

  test('onAction 이 던져도 토스트는 정상적으로 닫힌다(graceful)', () => {
    const onAction = jest.fn(() => {
      throw new Error('restore failed');
    });
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction});
    expect(() => runToastAction()).not.toThrow();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(getCurrentToast()).toBeNull();
  });
});

describe('대체(replace) — 한 번에 하나', () => {
  test('새 토스트는 이전 토스트를 즉시 대체한다', () => {
    showToast({message: '첫 번째'});
    showToast({message: '두 번째'});
    expect(getCurrentToast()!.message).toBe('두 번째');
  });

  test('옛 토스트의 자동 dismiss 타이머가 새 토스트를 잘못 닫지 않는다', () => {
    showToast({message: '첫 번째', durationMs: 1000});
    jest.advanceTimersByTime(900);
    // 900ms 시점에 새 토스트로 대체(새 1000ms 타이머 시작).
    showToast({message: '두 번째', durationMs: 1000});

    // 첫 토스트의 원래 만료 시점(누적 1000ms)을 지나도 두 번째는 살아 있어야 한다.
    jest.advanceTimersByTime(200); // 누적 1100ms
    expect(getCurrentToast()!.message).toBe('두 번째');

    // 두 번째의 1000ms 가 다 지나면 그제서야 닫힌다.
    jest.advanceTimersByTime(800); // 두 번째 시작 후 1000ms
    expect(getCurrentToast()).toBeNull();
  });
});

describe('undo 보존 큐 — 액션 토스트는 정보 토스트에 증발하지 않는다(2026-07-24 P1 #52)', () => {
  test('액션 토스트 표시 중 정보 토스트가 오면 즉시 대체하지 않고, 액션 토스트 자동 소멸 후 표시된다', () => {
    showToast({message: '신발 삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn()});
    const infoId = showToast({message: '설정이 저장됐어요'});

    // 정보 토스트는 대기 — 화면(current)엔 여전히 undo 토스트.
    expect(infoId).toBeGreaterThan(0);
    expect(getCurrentToast()!.message).toBe('신발 삭제됨');

    // undo 토스트의 액션 지속시간이 다 지나면 자동 소멸 → 대기하던 정보 토스트가 표시된다.
    jest.advanceTimersByTime(TOAST_ACTION_DURATION_MS);
    expect(getCurrentToast()!.message).toBe('설정이 저장됐어요');

    // 방출된 정보 토스트는 '표시 시점부터' 자기 지속시간을 온전히 갖는다(타이머 정리 검증).
    jest.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS - 1);
    expect(getCurrentToast()).not.toBeNull();
    jest.advanceTimersByTime(1);
    expect(getCurrentToast()).toBeNull();
  });

  test('큐는 최근 1건만 유지한다 — 정보 토스트가 연달아 오면 마지막 것만 남는다', () => {
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn()});
    showToast({message: '오래된 정보'});
    showToast({message: '최신 정보'});

    expect(getCurrentToast()!.message).toBe('삭제됨');
    jest.advanceTimersByTime(TOAST_ACTION_DURATION_MS);
    expect(getCurrentToast()!.message).toBe('최신 정보');

    // '오래된 정보'는 버려졌다 — 최신 정보가 닫힌 뒤 아무것도 표시되지 않는다.
    jest.advanceTimersByTime(TOAST_DEFAULT_DURATION_MS);
    expect(getCurrentToast()).toBeNull();
  });

  test('새 액션 토스트는 기존 액션 토스트를 즉시 대체한다(최신 복구 경로 우선), 대기 정보는 유지', () => {
    const undo1 = jest.fn();
    const undo2 = jest.fn();
    showToast({message: '첫 삭제', actionLabel: TOAST_UNDO_LABEL, onAction: undo1});
    showToast({message: '중간 정보'}); // 대기
    showToast({message: '둘째 삭제', actionLabel: TOAST_UNDO_LABEL, onAction: undo2});

    // 액션→액션은 즉시 대체(단일 슬롯 통지로 옛 undo 정리).
    expect(getCurrentToast()!.message).toBe('둘째 삭제');

    // 액션 실행은 최신 undo 의 콜백만 부른다.
    runToastAction();
    expect(undo1).not.toHaveBeenCalled();
    expect(undo2).toHaveBeenCalledTimes(1);

    // 대체 과정에서도 대기하던 정보 토스트는 살아남아, 액션 종료 후 표시된다.
    expect(getCurrentToast()!.message).toBe('중간 정보');
  });

  test('액션 탭(runToastAction) 시 큐가 방출된다 — onAction 호출 + 대기 정보 표시', () => {
    const onAction = jest.fn();
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction});
    showToast({message: '뒤이은 정보'});

    runToastAction();
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(getCurrentToast()!.message).toBe('뒤이은 정보');
  });

  test('명시 dismiss 로 액션 토스트를 닫아도 큐가 방출된다', () => {
    const undoId = showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn()});
    showToast({message: '뒤이은 정보'});

    dismissToast(undoId);
    expect(getCurrentToast()!.message).toBe('뒤이은 정보');
  });

  test('대기 중인 토스트를 id 로 dismiss 하면 표시되지 않고 조용히 제거된다', () => {
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn()});
    const infoId = showToast({message: '대기 중 취소될 정보'});

    dismissToast(infoId);
    // 대기분 제거는 current 에 영향 없다.
    expect(getCurrentToast()!.message).toBe('삭제됨');

    // 액션 토스트가 끝나도 제거된 대기분은 표시되지 않는다.
    jest.advanceTimersByTime(TOAST_ACTION_DURATION_MS);
    expect(getCurrentToast()).toBeNull();
  });

  test('옛 액션 토스트의 타이머가 방출된 큐 토스트를 잘못 닫지 않는다(id 가드+타이머 정리)', () => {
    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn(), durationMs: 1000});
    showToast({message: '뒤이은 정보', durationMs: 1000});

    // 900ms 시점에 사용자가 액션을 탭 → 정보 토스트 방출(자기 1000ms 타이머 시작).
    jest.advanceTimersByTime(900);
    runToastAction();
    expect(getCurrentToast()!.message).toBe('뒤이은 정보');

    // 옛 액션 토스트의 원래 만료 시점(누적 1000ms)을 지나도 정보 토스트는 살아 있다.
    jest.advanceTimersByTime(200); // 누적 1100ms
    expect(getCurrentToast()!.message).toBe('뒤이은 정보');

    // 정보 토스트 자신의 1000ms 가 다 지나면 그제서야 닫힌다.
    jest.advanceTimersByTime(800);
    expect(getCurrentToast()).toBeNull();
  });

  test('대기(큐잉)는 구독자에게 통지되지 않는다 — current 스트림엔 표시 시점에만 나타난다', () => {
    const seen: (ToastEntry | null)[] = [];
    const unsub = subscribeToast(t => seen.push(t));
    seen.length = 0; // 초기 null 통지 무시

    showToast({message: '삭제됨', actionLabel: TOAST_UNDO_LABEL, onAction: jest.fn()});
    expect(seen.map(t => t?.message)).toEqual(['삭제됨']);

    showToast({message: '대기 정보'}); // 큐잉 — 통지 없음
    expect(seen.map(t => t?.message)).toEqual(['삭제됨']);

    jest.advanceTimersByTime(TOAST_ACTION_DURATION_MS);
    // null 깜빡임 없이 곧장 다음 토스트로 교체 통지된다.
    expect(seen.map(t => t?.message)).toEqual(['삭제됨', '대기 정보']);
    unsub();
  });

  test('정보→정보는 종전대로 즉시 대체된다(액션 없는 현재 토스트는 보존 대상이 아님)', () => {
    showToast({message: '첫 정보'});
    showToast({message: '둘째 정보'});
    expect(getCurrentToast()!.message).toBe('둘째 정보');
  });
});

describe('subscribe/unsubscribe', () => {
  test('구독 해제 후엔 더 이상 통지받지 않는다', () => {
    const seen: (ToastEntry | null)[] = [];
    const unsub = subscribeToast(t => seen.push(t));
    seen.length = 0; // 초기 null 통지 무시
    unsub();
    showToast({message: '안 들림'});
    expect(seen).toEqual([]);
  });
});
