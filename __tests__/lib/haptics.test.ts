/**
 * lib/haptics — 의미 햅틱 래퍼 행동/스파이 테스트.
 *
 * 관찰 가능한 결과를 단언한다: 각 의미 메서드가 RN 내장 Vibration.vibrate 를 자기
 * 패턴으로 정확히 호출하는가, 햅틱을 끄면(off) 단 한 번도 호출하지 않는가, 네이티브
 * 진동이 던져도 호출자에게 예외가 새지 않는가(graceful no-op).
 *
 * @format
 */

import {Vibration} from 'react-native';
import {
  tap,
  success,
  warning,
  countdownBeat,
  go,
  impactHeavy,
  setHapticsEnabled,
  isHapticsEnabled,
  HAPTIC_PATTERN,
} from '../../lib/haptics';

let vibrateSpy: jest.SpyInstance;

beforeEach(() => {
  // 진동은 실제로 울리지 않게 가로채고 호출만 관찰한다.
  vibrateSpy = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  setHapticsEnabled(true); // 각 테스트는 기본 on 에서 시작
});

afterEach(() => {
  vibrateSpy.mockRestore();
  setHapticsEnabled(true); // 모듈 전역 상태 누수 방지
});

describe('의미 메서드 → Vibration.vibrate 패턴 매핑(on 상태)', () => {
  const cases: Array<[string, () => void, number | number[]]> = [
    ['tap', tap, HAPTIC_PATTERN.tap],
    ['success', success, [...HAPTIC_PATTERN.success]],
    ['warning', warning, [...HAPTIC_PATTERN.warning]],
    ['countdownBeat', countdownBeat, HAPTIC_PATTERN.countdownBeat],
    ['go', go, HAPTIC_PATTERN.go],
    ['impactHeavy', impactHeavy, HAPTIC_PATTERN.impactHeavy],
  ];

  test.each(cases)('%s() 는 자기 패턴으로 vibrate 를 정확히 1회 호출한다', (_name, fn, pattern) => {
    fn();
    expect(vibrateSpy).toHaveBeenCalledTimes(1);
    expect(vibrateSpy).toHaveBeenCalledWith(pattern);
  });

  test('단발 의미(tap/countdownBeat/go/impactHeavy)는 단일 number ms 를 쓴다', () => {
    tap();
    expect(vibrateSpy.mock.calls[0][0]).toBe(10);
    vibrateSpy.mockClear();
    go();
    expect(vibrateSpy.mock.calls[0][0]).toBe(200);
  });

  test('펄스 의미(success/warning)는 [대기,진동,…] 배열 패턴을 쓴다', () => {
    success();
    expect(Array.isArray(vibrateSpy.mock.calls[0][0])).toBe(true);
    expect(vibrateSpy.mock.calls[0][0]).toEqual([0, 30, 80, 30]);
    vibrateSpy.mockClear();
    warning();
    // warning 은 success 보다 펄스 수가 많다(더 강한 주의).
    expect((vibrateSpy.mock.calls[0][0] as number[]).length).toBeGreaterThan(
      [...HAPTIC_PATTERN.success].length,
    );
  });
});

describe('settings 토글(off)면 순수 no-op', () => {
  test('off 상태에서는 어떤 메서드도 vibrate 를 호출하지 않는다', () => {
    setHapticsEnabled(false);
    tap();
    success();
    warning();
    countdownBeat();
    go();
    impactHeavy();
    expect(vibrateSpy).not.toHaveBeenCalled();
  });

  test('off→on 으로 되돌리면 다시 호출된다(상태가 토글을 실제로 존중)', () => {
    setHapticsEnabled(false);
    tap();
    expect(vibrateSpy).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    tap();
    expect(vibrateSpy).toHaveBeenCalledTimes(1);
  });

  test('isHapticsEnabled 가 현재 토글 상태를 반영한다', () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
  });
});

describe('graceful no-op(미지원/네이티브 에러)', () => {
  test('vibrate 가 던져도 의미 메서드는 예외를 전파하지 않는다', () => {
    vibrateSpy.mockImplementation(() => {
      throw new Error('no vibrator hardware');
    });
    // 모두 조용히 삼켜야 한다 — 던지면 이 단언들이 실패한다.
    expect(() => tap()).not.toThrow();
    expect(() => success()).not.toThrow();
    expect(() => warning()).not.toThrow();
    expect(() => countdownBeat()).not.toThrow();
    expect(() => go()).not.toThrow();
    expect(() => impactHeavy()).not.toThrow();
    // 그래도 시도는 했다(에러를 삼킨 것이지 호출을 건너뛴 게 아니다).
    expect(vibrateSpy).toHaveBeenCalledTimes(6);
  });
});
