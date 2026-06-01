// ─── locationService — expo-location ↔ runTracker integration ────────────────
// The delivery layer that turns expo-location/expo-task-manager fixes into the
// shared GPS engine's input. It replaces the old react-native-geolocation-service
// watchPosition path (no real foreground service) with two cooperating sources
// that both feed `runTracker.ingestFix`:
//   • foreground: Location.watchPositionAsync (live UI updates while the screen
//     is on)
//   • background / screen-off: an expo-task-manager location task started via
//     Location.startLocationUpdatesAsync with a location-typed foreground service
//     so Android keeps delivering fixes (and the user sees an ongoing
//     notification) after the screen turns off.
// runTracker de-dupes by fix timestamp, so when both sources fire for the same
// physical fix (foreground app with the background service also running) distance
// is never double-counted.
//
// This module owns NO run state — it only requests permissions, starts/stops the
// two delivery paths, and forwards each fix to the engine. The pure engine
// (lib/runTracker) remains the single source of truth.

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import {runTracker, RawFix} from './runTracker';
import {buildForegroundServiceConfig} from './foregroundService';

/** TaskManager task name for the background run-location updates. */
export const RUN_LOCATION_TASK = 'keego-run-location';

/** Shared location-manager options for both delivery paths (high accuracy,
 *  ~1 Hz, no distance throttling so slow/standing segments still report). */
const WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 0,
};

/** Result of requesting the run's location permissions. `foreground` gates
 *  whether tracking may start at all; `background` is optional — its denial is
 *  non-fatal (foreground-only tracking still records while the screen is on). */
export interface RunPermissions {
  foreground: boolean;
  background: boolean;
}

/** Normalize an expo LocationObject to the engine's RawFix (shared shape). */
export function toRawFix(loc: Location.LocationObject): RawFix {
  return {
    coords: {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
    },
    timestamp: loc.timestamp,
  };
}

// ── background task (module-scope) ───────────────────────────────────────────
// defineTask MUST run in the global scope so a headless JS context (screen off /
// app suspended) can resolve the executor by name. Each batch of locations is
// forwarded to the same engine the foreground watch feeds.
TaskManager.defineTask(
  RUN_LOCATION_TASK,
  async ({
    data,
    error,
  }: TaskManager.TaskManagerTaskBody<{locations?: Location.LocationObject[]}>) => {
    if (error) return;
    const locs = data?.locations;
    if (!locs || !locs.length) return;
    for (const loc of locs) runTracker.ingestFix(toRawFix(loc));
  },
);

/**
 * Request the permissions a run needs. Foreground is mandatory (a denial means
 * tracking must not start). Background is requested only after foreground is
 * granted and its denial is swallowed as non-fatal — foreground tracking still
 * works, just without screen-off persistence.
 */
export async function requestRunPermissions(): Promise<RunPermissions> {
  let foreground = false;
  let background = false;
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    foreground = !!fg.granted;
  } catch {
    foreground = false;
  }
  if (!foreground) return {foreground, background};
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    background = !!bg.granted;
  } catch {
    background = false;
  }
  return {foreground, background};
}

/** Heuristic: does a watch error reason indicate the location permission was
 *  revoked (vs. a transient signal loss)? Used to stop the run on revocation. */
export function isPermissionError(reason: string): boolean {
  return /denied|not authorized|unauthorized|permission/i.test(String(reason || ''));
}

// The active foreground subscription, so stopTracking can remove it.
let fgSub: Location.LocationSubscription | null = null;

/**
 * Start delivering fixes to the engine. Always starts the foreground watch;
 * additionally starts the background location task (with a location-typed
 * foreground service notification) when background permission was granted.
 *
 * @param goalKm run goal surfaced in the foreground-service notification body.
 * @param opts.background whether to also start screen-off background updates.
 * @param opts.onError forwarded to watchPositionAsync (e.g. mid-run revocation).
 */
export async function startTracking(
  goalKm: number,
  opts?: {background?: boolean; onError?: (reason: string) => void},
): Promise<void> {
  fgSub = await Location.watchPositionAsync(
    WATCH_OPTIONS,
    loc => runTracker.ingestFix(toRawFix(loc)),
    opts?.onError,
  );

  if (opts?.background) {
    const cfg = buildForegroundServiceConfig(goalKm);
    try {
      await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, {
        ...WATCH_OPTIONS,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: cfg.notificationTitle,
          notificationBody: cfg.notificationBody,
        },
      });
    } catch {
      // Background updates unavailable (permission/version) — non-fatal: the
      // foreground watch above still records while the screen is on.
    }
  }
}

/** Stop both delivery paths. Idempotent and safe to call when nothing started. */
export async function stopTracking(): Promise<void> {
  if (fgSub) {
    try {
      fgSub.remove();
    } catch {
      // already removed
    }
    fgSub = null;
  }
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK);
    if (started) await Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK);
  } catch {
    // task never registered / already stopped — nothing to do.
  }
}
