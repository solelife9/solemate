/**
 * 저장 실패 안내 계약(2026-07-26 출시 심사 TOP30 #28).
 *
 * 지금까지 캐시 쓰기 실패는 recordError 로 **계측만** 됐다. 결과는 조용하지 않다 —
 * 캐시가 낡은 채 굳어서 다음에 오프라인으로 열면 며칠 전 상태가 '현재'로 보인다.
 *
 * 균형점: 한 번의 실패로 소리치지 않고(일시적 압박은 다음 쓰기에서 낫는다), 연속 실패가
 * 임계에 닿을 때만, 쿨다운 안에서는 한 번만 알린다. 회복되면 조용해진다.
 *
 * @format
 */
import {
  shouldAlertStorage,
  initialStorageAlertState,
  reportStorageResult,
  storageFailCount,
  __resetStorageAlertForTests,
  STORAGE_FAIL_THRESHOLD,
  STORAGE_ALERT_COOLDOWN_MS,
  STORAGE_ALERT_MESSAGE,
} from '../../lib/storageAlert';
import {showToast} from '../../lib/toast';

jest.mock('../../lib/toast', () => ({showToast: jest.fn(() => 1)}));

const T0 = 1_800_000_000_000;

describe('shouldAlertStorage — 순수 판정', () => {
  it('첫 실패로는 알리지 않는다(일시적일 수 있다)', () => {
    const r = shouldAlertStorage(initialStorageAlertState(), false, T0);
    expect(r.alert).toBe(false);
    expect(r.state.fails).toBe(1);
  });

  it('연속 실패가 임계에 닿으면 알린다', () => {
    let s = initialStorageAlertState();
    let alert = false;
    for (let i = 0; i < STORAGE_FAIL_THRESHOLD; i++) {
      const r = shouldAlertStorage(s, false, T0);
      s = r.state;
      alert = r.alert;
    }
    expect(alert).toBe(true);
  });

  it('쿨다운 안에서는 다시 알리지 않는다', () => {
    let s = {fails: 5, lastAlertMs: T0};
    const r = shouldAlertStorage(s, false, T0 + STORAGE_ALERT_COOLDOWN_MS - 1);
    expect(r.alert).toBe(false);
  });

  it('쿨다운이 지나면 다시 알린다', () => {
    const s = {fails: 5, lastAlertMs: T0};
    const r = shouldAlertStorage(s, false, T0 + STORAGE_ALERT_COOLDOWN_MS);
    expect(r.alert).toBe(true);
    expect(r.state.lastAlertMs).toBe(T0 + STORAGE_ALERT_COOLDOWN_MS);
  });

  it('성공하면 연속 실패 카운터가 0 으로 돌아간다', () => {
    const r = shouldAlertStorage({fails: 3, lastAlertMs: 0}, true, T0);
    expect(r.state.fails).toBe(0);
    expect(r.alert).toBe(false);
  });

  it('성공은 쿨다운을 되돌리지 않는다(방금 알린 뒤 곧바로 재알림 금지)', () => {
    const r = shouldAlertStorage({fails: 3, lastAlertMs: T0}, true, T0 + 1000);
    expect(r.state.lastAlertMs).toBe(T0);
  });

  it('회복 후 다시 실패하면 임계를 처음부터 센다', () => {
    let s = shouldAlertStorage({fails: 1, lastAlertMs: 0}, true, T0).state;
    const r = shouldAlertStorage(s, false, T0 + 1);
    expect(r.alert).toBe(false); // 1회째라 아직 아님
    expect(r.state.fails).toBe(1);
  });
});

describe('reportStorageResult — 표시 연결', () => {
  beforeEach(() => {
    __resetStorageAlertForTests();
    (showToast as jest.Mock).mockClear();
  });

  it('임계 도달 시 토스트 한 줄을 띄운다', () => {
    for (let i = 0; i < STORAGE_FAIL_THRESHOLD; i++) {
      reportStorageResult(false, T0);
    }
    expect(showToast).toHaveBeenCalledTimes(1);
    expect((showToast as jest.Mock).mock.calls[0][0].message).toBe(STORAGE_ALERT_MESSAGE);
  });

  it('문구가 원인과 결과를 함께 말한다', () => {
    expect(STORAGE_ALERT_MESSAGE).toContain('저장 공간');
    expect(STORAGE_ALERT_MESSAGE).toContain('저장되지 않을 수 있어요');
  });

  it('성공 보고는 조용하고 카운터를 되돌린다', () => {
    reportStorageResult(false, T0);
    reportStorageResult(true, T0);
    expect(storageFailCount()).toBe(0);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('토스트가 던져도 저장 경로로 전파되지 않는다', () => {
    (showToast as jest.Mock).mockImplementationOnce(() => {
      throw new Error('toast host down');
    });
    expect(() => {
      for (let i = 0; i < STORAGE_FAIL_THRESHOLD; i++) reportStorageResult(false, T0);
    }).not.toThrow();
  });
});
