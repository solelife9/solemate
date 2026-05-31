import {
  buildForegroundServiceConfig,
  needsBackgroundLocationPermission,
  FG_SERVICE_CHANNEL_ID,
  ANDROID_Q,
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

describe('needsBackgroundLocationPermission', () => {
  test('true on Android 10 (API 29) and above — background location is split out', () => {
    expect(needsBackgroundLocationPermission('android', ANDROID_Q)).toBe(true);
    expect(needsBackgroundLocationPermission('android', 33)).toBe(true);
  });

  test('false on older Android where fine location already covers background', () => {
    expect(needsBackgroundLocationPermission('android', 28)).toBe(false);
  });

  test('false on iOS regardless of version (no Android runtime split)', () => {
    expect(needsBackgroundLocationPermission('ios', 33)).toBe(false);
  });
});
