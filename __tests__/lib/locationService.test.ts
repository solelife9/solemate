/**
 * lib/locationService — expo-location ↔ runTracker integration tests.
 *
 * Verifies the delivery layer that replaced react-native-geolocation-service:
 *  - the foreground watch (watchPositionAsync) feeds fixes into the shared engine
 *    so distance accumulates;
 *  - the background task (registered via expo-task-manager defineTask) feeds a
 *    batched, screen-off update into the SAME engine, and is started on
 *    FOREGROUND permission alone (background/"Always" is NOT required — that was
 *    the silent pocket-tracking bug);
 *  - permission requesting is correct and graceful (foreground denial
 *    short-circuits; background/"Always" denial does not disable bg tracking);
 *  - stopTracking tears down both delivery paths.
 *
 * Assertions are on observable outcomes (engine distance, the actual expo calls
 * made), not internal state. expo-location / expo-task-manager are mocked in
 * jest.setup.js.
 *
 * @format
 */

import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {runTracker} from '../../lib/runTracker';
import {
  RUN_LOCATION_TASK,
  requestRunPermissions,
  startTracking,
  stopTracking,
  isPermissionError,
} from '../../lib/locationService';

const LON = 127.0;
const loc = (lat: number, ts: number) => ({
  coords: {latitude: lat, longitude: LON, accuracy: 5},
  timestamp: ts,
});

// Drive enough fixes (warmup at P0 + two accepted segments) to push distance > 0.
function feed(deliver: (l: any) => void) {
  deliver(loc(37.5, 100000));
  deliver(loc(37.5, 102000));
  deliver(loc(37.5, 104000));
  deliver(loc(37.5003, 107000));
  deliver(loc(37.5006, 110000));
}

test('startTracking wires foreground fixes into the engine and starts the background service', async () => {
  runTracker.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  await startTracking(5);

  // Foreground watch registered; replay fixes through its callback (arg 1).
  const wCalls = (Location.watchPositionAsync as jest.Mock).mock.calls;
  expect(wCalls.length).toBeGreaterThan(0);
  const cb = wCalls[wCalls.length - 1][1] as (l: any) => void;
  feed(cb);
  expect(runTracker.getDistanceKm()).toBeGreaterThan(0);

  // Background screen-off updates started under the run-location task.
  const bgCalls = (Location.startLocationUpdatesAsync as jest.Mock).mock.calls;
  expect(bgCalls.length).toBeGreaterThan(0);
  expect(bgCalls[bgCalls.length - 1][0]).toBe(RUN_LOCATION_TASK);

  await stopTracking();
});

test('startTracking starts the background task on FOREGROUND permission alone (no "Always" required) — screen-off / pocket tracking', async () => {
  // Regression: the background updates task used to be gated behind background
  // ("Always") permission, so a "While Using"-only user's run silently froze the
  // moment the phone went into a pocket (foreground watch dies screen-off). The
  // expo-location background task only requires FOREGROUND permission (it sets
  // allowsBackgroundLocationUpdates=YES + the iOS blue indicator), so it must
  // start for every run the caller already gated on foreground permission.
  runTracker.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  await startTracking(5);

  expect((Location.watchPositionAsync as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  const bgCalls = (Location.startLocationUpdatesAsync as jest.Mock).mock.calls;
  expect(bgCalls.length).toBeGreaterThan(0);
  expect(bgCalls[bgCalls.length - 1][0]).toBe(RUN_LOCATION_TASK);
  // The iOS blue location indicator must be enabled so When-In-Use background
  // delivery is permitted (and the user sees it's tracking).
  expect(bgCalls[bgCalls.length - 1][1].showsBackgroundLocationIndicator).toBe(true);

  await stopTracking();
});

test('the registered background task feeds a batched screen-off update into the engine', async () => {
  const executor = (TaskManager as any).__getTask(RUN_LOCATION_TASK);
  expect(typeof executor).toBe('function');

  runTracker.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  await executor({
    data: {locations: [loc(37.5, 100000), loc(37.5, 102000), loc(37.5, 104000), loc(37.5003, 107000), loc(37.5006, 110000)]},
    error: null,
  });
  expect(runTracker.getDistanceKm()).toBeGreaterThan(0);
});

test('the background task ignores error batches (no distance from a failed update)', async () => {
  const executor = (TaskManager as any).__getTask(RUN_LOCATION_TASK);
  runTracker.start({goalKm: 5, shoe: {id: 's1', name: 'X'}, t0: 100000});
  await executor({data: null, error: {message: 'boom'}});
  expect(runTracker.getDistanceKm()).toBe(0);
});

test('requestRunPermissions: a denied foreground permission short-circuits (background not requested)', async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const r = await requestRunPermissions();
  expect(r).toEqual({foreground: false, background: false});
  expect(Location.requestBackgroundPermissionsAsync).not.toHaveBeenCalled();
});

test('requestRunPermissions: foreground granted + background denied is graceful', async () => {
  (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
    granted: false,
    status: 'denied',
  });
  const r = await requestRunPermissions();
  expect(r).toEqual({foreground: true, background: false});
});

test('stopTracking removes the foreground subscription and stops a started background task', async () => {
  const remove = jest.fn();
  (Location.watchPositionAsync as jest.Mock).mockResolvedValueOnce({remove});
  (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValueOnce(true);

  await startTracking(5);
  await stopTracking();

  expect(remove).toHaveBeenCalled();
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(RUN_LOCATION_TASK);
});

test('isPermissionError distinguishes revocation reasons from transient signal loss', () => {
  expect(isPermissionError('Location permission denied')).toBe(true);
  expect(isPermissionError('Not authorized to use location services')).toBe(true);
  expect(isPermissionError('Current location is unavailable')).toBe(false);
});
