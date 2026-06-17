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
  TOAST_UNDO_LABEL,
  ToastEntry,
} from '../../lib/toast';

beforeEach(() => {
  jest.useFakeTimers();
  dismissToast(); // 이전 테스트 잔여 토스트/타이머 제거(모듈 전역 상태 격리)
});

afterEach(() => {
  dismissToast();
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
