import {
  buildForegroundServiceConfig,
  FG_SERVICE_CHANNEL_ID,
} from '../../lib/foregroundService';

describe('buildForegroundServiceConfig', () => {
  test('produces an ongoing-notification config bound to the run-tracking channel', () => {
    const cfg = buildForegroundServiceConfig(5);
    expect(cfg.channelId).toBe(FG_SERVICE_CHANNEL_ID);
    expect(cfg.notificationTitle).toBe('러닝 기록 중');
    // Prepared notification copy (shown only once a real foreground service
    // runs; today this option is a no-op forward-prep — see lib header).
    expect(cfg.notificationBody).toContain('화면을 꺼도');
  });

  test('surfaces the goal distance in the notification body when a goal is given', () => {
    expect(buildForegroundServiceConfig(10).notificationBody).toContain('10km');
  });

  test('falls back to a generic body for missing / non-positive goals', () => {
    const generic = '화면을 꺼도 거리와 시간이 계속 기록됩니다.';
    expect(buildForegroundServiceConfig().notificationBody).toBe(generic);
    expect(buildForegroundServiceConfig(0).notificationBody).toBe(generic);
    expect(buildForegroundServiceConfig(-3).notificationBody).toBe(generic);
  });
});

// needsBackgroundLocationPermission / ANDROID_Q 의 테스트는 2026-08-07 에 함수와 함께
// 삭제했다. 그 함수는 호출부가 한 곳도 없는 죽은 코드였고, 존재 자체가 "배경 위치 권한이
// 필요하다"는 잘못된 전제를 문서화하고 있었다. 실제로는 location 타입 포그라운드 서비스가
// 그 권한 없이 동작한다 — 근거는 AndroidManifest 주석, 회귀 가드는
// __tests__/nativePermissions.test.ts 에 있다.
