/**
 * lib/haptics — 의미 햅틱 래퍼 행동 테스트.
 *
 * iOS 는 Taptic 네이티브(HapticModule)로 '짧고 가벼운 톡'을, 그 외/미탑재는 Vibration
 * 으로 폴백한다(2026-07-13 사용자 확정 — Vibration 모터의 길고 강한 부르르 회피).
 * 관찰 가능한 결과를 단언한다:
 *   1) Taptic 있으면 → impact(style)/notify(type)로 라우팅, Vibration 은 호출 안 함.
 *   2) Taptic 없으면(안드로이드·미탑재) → Vibration 폴백 패턴으로 호출.
 *   3) off 면 어느 경로도 호출 안 함(순수 no-op).
 *   4) Taptic 이 던지면 Vibration 으로 폴백, Vibration 도 던지면 조용히 삼킨다.
 *
 * @format
 */

type Spies = {
  h: typeof import('../../lib/haptics');
  vibrate: jest.Mock;
  impact: jest.Mock;
  notify: jest.Mock;
};

function load({taptic = true, os = 'ios'}: {taptic?: boolean; os?: string} = {}): Spies {
  jest.resetModules();
  const vibrate = jest.fn();
  const impact = jest.fn();
  const notify = jest.fn();
  jest.doMock('react-native', () => ({
    Platform: {OS: os},
    Vibration: {vibrate},
    NativeModules: taptic ? {HapticModule: {impact, notify}} : {},
  }));
  const h = require('../../lib/haptics') as typeof import('../../lib/haptics');
  h.setHapticsEnabled(true);
  return {h, vibrate, impact, notify};
}

describe('iOS + Taptic 탑재 — 짧고 가벼운 톡으로 라우팅(Vibration 미사용)', () => {
  it('임팩트 의미는 올바른 스타일로 impact 를 부른다(light/medium/heavy)', () => {
    const {h, impact, vibrate} = load({taptic: true, os: 'ios'});
    h.tap();
    h.countdownBeat();
    h.go();
    h.impactHeavy();
    expect(impact).toHaveBeenNthCalledWith(1, 'light');
    expect(impact).toHaveBeenNthCalledWith(2, 'light');
    expect(impact).toHaveBeenNthCalledWith(3, 'medium');
    expect(impact).toHaveBeenNthCalledWith(4, 'heavy');
    // Taptic 경로에서는 구형 진동 모터를 절대 쓰지 않는다.
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('알림 의미는 올바른 타입으로 notify 를 부른다(success/warning)', () => {
    const {h, notify, vibrate} = load({taptic: true, os: 'ios'});
    h.success();
    h.warning();
    expect(notify).toHaveBeenNthCalledWith(1, 'success');
    expect(notify).toHaveBeenNthCalledWith(2, 'warning');
    expect(vibrate).not.toHaveBeenCalled();
  });
});

describe('Taptic 미탑재(안드로이드/미링크) — Vibration 폴백', () => {
  it('안드로이드는 각 의미가 자기 폴백 패턴으로 vibrate 를 부른다', () => {
    const {h, vibrate, impact, notify} = load({taptic: false, os: 'android'});
    h.tap();
    expect(vibrate).toHaveBeenLastCalledWith(h.HAPTIC_PATTERN.tap);
    h.go();
    expect(vibrate).toHaveBeenLastCalledWith(h.HAPTIC_PATTERN.go);
    h.success();
    expect(vibrate).toHaveBeenLastCalledWith([...h.HAPTIC_PATTERN.success]);
    // 네이티브 Taptic 은 존재하지 않으니 호출될 수 없다.
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it('폴백 패턴은 짧다 — go 는 단발(구 200ms 부르르 폐기), warning 은 success 보다 펄스 많음', () => {
    const {h} = load({taptic: false, os: 'android'});
    expect(typeof h.HAPTIC_PATTERN.go).toBe('number');
    expect(h.HAPTIC_PATTERN.go).toBeLessThanOrEqual(60);
    expect(h.HAPTIC_PATTERN.warning.length).toBeGreaterThan(h.HAPTIC_PATTERN.success.length);
  });
});

describe('settings 토글(off) — 순수 no-op(Taptic·Vibration 모두 미호출)', () => {
  it('off 면 Taptic 도 Vibration 도 호출하지 않는다', () => {
    const {h, vibrate, impact, notify} = load({taptic: true, os: 'ios'});
    h.setHapticsEnabled(false);
    h.tap(); h.success(); h.warning(); h.countdownBeat(); h.go(); h.impactHeavy();
    expect(impact).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    // 되돌리면 다시 동작.
    h.setHapticsEnabled(true);
    h.tap();
    expect(impact).toHaveBeenCalledTimes(1);
  });

  it('isHapticsEnabled 가 현재 토글 상태를 반영한다', () => {
    const {h} = load();
    h.setHapticsEnabled(false);
    expect(h.isHapticsEnabled()).toBe(false);
    h.setHapticsEnabled(true);
    expect(h.isHapticsEnabled()).toBe(true);
  });
});

describe('graceful — 네이티브 에러가 위로 새지 않는다', () => {
  it('Taptic 이 던지면 Vibration 으로 폴백한다', () => {
    const {h, impact, vibrate} = load({taptic: true, os: 'ios'});
    impact.mockImplementation(() => { throw new Error('taptic missing'); });
    expect(() => h.tap()).not.toThrow();
    // 폴백으로 Vibration 이 시도됐다.
    expect(vibrate).toHaveBeenCalledWith(h.HAPTIC_PATTERN.tap);
  });

  it('Vibration 도 던지면 조용히 삼킨다(예외 미전파)', () => {
    const {h, vibrate} = load({taptic: false, os: 'android'});
    vibrate.mockImplementation(() => { throw new Error('no vibrator'); });
    expect(() => h.tap()).not.toThrow();
    expect(() => h.warning()).not.toThrow();
    expect(vibrate).toHaveBeenCalledTimes(2);
  });
});
