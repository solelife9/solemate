// ─── Foreground-service config for background run tracking (audit#1) ──────────
// Pure helpers that produce the `foregroundService` option handed to
// expo-location's startLocationUpdatesAsync, plus the decision of whether
// ACCESS_BACKGROUND_LOCATION still needs requesting on this Android version.
//
// WHY a foreground service: when the screen turns off or the app is backgrounded,
// Android suspends JS timers and throttles location callbacks (Doze + background
// execution limits), so distance/time recording stalls — the #1 reliability
// defect for a running app (pocket runs lose distance). A location-typed
// foreground service keeps the process alive so location fixes keep arriving;
// the user sees an ongoing notification while a run is active.
//
// CURRENT STATUS: this config is LIVE. It is consumed by
// lib/locationService.ts → Location.startLocationUpdatesAsync({ foregroundService })
// (expo-location + expo-task-manager), which runs a real location-typed Android
// foreground service. With the screen off / app backgrounded the registered
// TaskManager task keeps receiving fixes and feeds the shared engine
// (runTracker.ingestFix), so distance and time continue to accumulate — no more
// pocket-run distance loss. The AndroidManifest declares FOREGROUND_SERVICE /
// FOREGROUND_SERVICE_LOCATION (and ACCESS_BACKGROUND_LOCATION is requested
// gracefully); expo-location merges the location-typed <service> element. The
// notification copy below is what the user sees on the ongoing notification while
// a run is being tracked.

/** Notification channel id for the run-tracking foreground service. */
export const FG_SERVICE_CHANNEL_ID = 'keego_run_tracking';

/** Android API level at which ACCESS_BACKGROUND_LOCATION became a separate
 *  runtime permission (Android 10 / Q). Below this, fine location covers it. */
export const ANDROID_Q = 29;

/** Shape of the watchPosition `foregroundService` option (Android only). */
export interface ForegroundServiceConfig {
  /** Notification channel id — must be created/declared on the native side. */
  channelId: string;
  /** Ongoing-notification title shown while a run is being tracked. */
  notificationTitle: string;
  /** Ongoing-notification body. */
  notificationBody: string;
}

/**
 * Build the watchPosition `foregroundService` notification config for an active
 * run. Korean copy, consistent with the in-app tone.
 *
 * @param goalKm optional run goal (km) surfaced in the notification body so the
 *               persistent notification is informative; omitted/non-positive
 *               values fall back to a generic body.
 */
export function buildForegroundServiceConfig(
  goalKm?: number,
): ForegroundServiceConfig {
  const hasGoal = typeof goalKm === 'number' && goalKm > 0;
  return {
    channelId: FG_SERVICE_CHANNEL_ID,
    notificationTitle: '러닝 기록 중',
    notificationBody: hasGoal
      ? `목표 ${goalKm}km · 화면을 꺼도 거리와 시간이 계속 기록됩니다.`
      : '화면을 꺼도 거리와 시간이 계속 기록됩니다.',
  };
}

/**
 * Whether ACCESS_BACKGROUND_LOCATION needs a separate runtime request on this
 * platform/version. Only Android 10 (API 29)+ splits background location out of
 * the foreground (fine) location grant; iOS and older Android do not.
 *
 * Background location is OPTIONAL for a location-typed foreground service (the
 * service can read location while in the foreground state even without it), so
 * callers must treat a denial as non-fatal — foreground tracking still works.
 */
export function needsBackgroundLocationPermission(
  platform: string,
  apiLevel: number,
): boolean {
  return platform === 'android' && Number(apiLevel) >= ANDROID_Q;
}
