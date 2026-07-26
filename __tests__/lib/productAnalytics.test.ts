/**
 * 제품 계측 래퍼 계약(2026-07-26 출시 심사 B-12).
 *
 * 관찰:
 *   1) 각 이벤트가 고정된 이름과 열거/버킷 파라미터로 나간다.
 *   2) 정확한 거리·시간을 그대로 보내지 않는다(개인정보 최소 수집 — 버킷만).
 *   3) 네이티브가 없거나 던져도 앱을 죽이지 않는다(no-throw).
 *
 * @format
 */
import {
  EVENTS,
  kmBucket,
  minuteBucket,
  trackOnboardingStep,
  trackFirstShoeAdded,
  trackRunStart,
  trackRunSave,
  trackPermissionResult,
  trackLogin,
  trackSyncFailed,
  trackCrashRecovery,
  trackShoeRetired,
  setAnalyticsEnabled,
} from '../../lib/productAnalytics';

const analytics = require('@react-native-firebase/analytics');

beforeEach(() => {
  analytics.logEvent.mockClear();
  analytics.setAnalyticsCollectionEnabled.mockClear();
});

/** 마지막 logEvent 호출의 (이름, 파라미터). */
function lastEvent(): {name: string; params: any} {
  const calls = analytics.logEvent.mock.calls;
  const c = calls[calls.length - 1];
  return {name: c[1], params: c[2]};
}

describe('버킷 변환 — 정확한 수치를 보내지 않는다', () => {
  it('거리를 러닝 문화의 자연 경계로 뭉갠다', () => {
    expect(kmBucket(0)).toBe('0');
    expect(kmBucket(2.4)).toBe('0-3');
    expect(kmBucket(4.9)).toBe('3-5');
    expect(kmBucket(7)).toBe('5-10');
    expect(kmBucket(15)).toBe('10-half');
    expect(kmBucket(30)).toBe('half-full');
    expect(kmBucket(50)).toBe('full+');
  });

  it('하프·풀 경계는 공식 거리를 쓴다', () => {
    expect(kmBucket(21.0974)).toBe('10-half');
    expect(kmBucket(21.0975)).toBe('half-full');
    expect(kmBucket(42.195)).toBe('full+');
  });

  it('시간을 분 구간으로 뭉갠다', () => {
    expect(minuteBucket(0)).toBe('0');
    expect(minuteBucket(10 * 60)).toBe('0-15');
    expect(minuteBucket(45 * 60)).toBe('30-60');
    expect(minuteBucket(300 * 60)).toBe('120+');
  });

  it('손상값(NaN·음수)은 0 으로 안전 처리', () => {
    expect(kmBucket(NaN)).toBe('0');
    expect(kmBucket(-5)).toBe('0');
    expect(minuteBucket(NaN)).toBe('0');
  });
});

describe('퍼널 이벤트', () => {
  it('온보딩 단계는 정수 step 으로 나간다', () => {
    trackOnboardingStep(2);
    expect(lastEvent()).toEqual({name: EVENTS.onboardingStep, params: {step: 2}});
  });

  it('음수 단계는 0 으로 보정', () => {
    trackOnboardingStep(-3);
    expect(lastEvent().params).toEqual({step: 0});
  });

  it('첫 신발 등록은 경로(source)만 남긴다', () => {
    trackFirstShoeAdded('picker');
    expect(lastEvent()).toEqual({name: EVENTS.firstShoeAdded, params: {source: 'picker'}});
  });
});

describe('코어 루프 이벤트', () => {
  it('러닝 시작 — 목표 종류·기기·신발 유무', () => {
    trackRunStart({goalType: 'distance', device: 'watch', hasShoe: true});
    expect(lastEvent()).toEqual({
      name: EVENTS.runStart,
      params: {goal_type: 'distance', device: 'watch', has_shoe: true},
    });
  });

  it('러닝 저장 — 거리·시간은 버킷으로만 나간다', () => {
    trackRunSave({km: 10.42, durationSec: 55 * 60, device: 'phone', hadGps: true});
    const {name, params} = lastEvent();
    expect(name).toBe(EVENTS.runSave);
    expect(params).toEqual({
      km_bucket: '10-half',
      minute_bucket: '30-60',
      device: 'phone',
      had_gps: true,
    });
    // 원본 수치가 새어나가지 않는다.
    expect(JSON.stringify(params)).not.toContain('10.42');
    expect(JSON.stringify(params)).not.toContain('3300');
  });
});

describe('마찰·복구 이벤트', () => {
  it('권한 결과', () => {
    trackPermissionResult('location_background', false);
    expect(lastEvent()).toEqual({
      name: EVENTS.permissionResult,
      params: {kind: 'location_background', granted: false},
    });
  });

  it('로그인 제공자만 남기고 계정 식별자는 남기지 않는다', () => {
    trackLogin('kakao');
    const {name, params} = lastEvent();
    expect(name).toBe(EVENTS.login);
    expect(params).toEqual({provider: 'kakao'});
  });

  it('동기 실패 단계', () => {
    trackSyncFailed('detail');
    expect(lastEvent().params).toEqual({stage: 'detail'});
  });

  it('크래시 복구 선택', () => {
    trackCrashRecovery('resume');
    expect(lastEvent().params).toEqual({action: 'resume'});
  });

  it('신발 은퇴 시 사용률 구간', () => {
    trackShoeRetired('80_100');
    expect(lastEvent().params).toEqual({used_ratio: '80_100'});
  });
});

describe('안전성', () => {
  it('네이티브가 던져도 호출부로 전파되지 않는다', () => {
    analytics.logEvent.mockImplementationOnce(() => {
      throw new Error('native down');
    });
    expect(() => trackRunDiscardSafe()).not.toThrow();
  });

  it('수집 on/off 를 네이티브로 전달한다', () => {
    setAnalyticsEnabled(false);
    expect(analytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(
      expect.anything(),
      false,
    );
  });
});

/** 위 안전성 테스트용 — 임의 이벤트 하나를 호출한다. */
function trackRunDiscardSafe() {
  trackOnboardingStep(1);
}
