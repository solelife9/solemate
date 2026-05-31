/**
 * App.tsx GPS fix-filter integration tests.
 *
 * Drives the real App through home → goal → live-run, then captures the
 * Geolocation.watchPosition success callback the engine registered
 * (`watchPosition.mock.calls[0][0]`) and injects synthetic fixes. Assertions are
 * on the observable distance the run screen displays (km), so they verify the
 * end-to-end gate — KalmanFilter → calcDist → acceptSegment → cumulative dist —
 * not internal state.
 *
 * Covers the two critic findings:
 *  1) [product_bug] speed-gate time desync: after a non-warmup rejection a
 *     normal-speed segment must NOT be falsely rejected, because dtSec now spans
 *     the same two points (lastGood → now) as distKm.
 *  2) Path continuity: accuracy/speed/distance rejections do not advance the
 *     last-good anchor; warmup rejections do, so post-warmup has no giant jump.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Geolocation from 'react-native-geolocation-service';
import App from '../App';

// One shoe so Home renders the "러닝 시작" CTA instead of the empty state.
function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) {
      body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs')) body = [];
    // nominatim reverse-geocode (fired by the first fix) returns an empty address.
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

// Concatenate every string descendant of a test instance (host Text content).
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

// Invoke the onPress of the first pressable whose rendered text contains `label`.
function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

// Read the big distance readout (km.toFixed(2)) the run screen renders.
function readKm(root: ReactTestRenderer.ReactTestInstance): number {
  const node = root
    .findAll(n => typeof n.type === 'string')
    .find(n => {
      const c = n.props.children;
      return typeof c === 'string' && /^\d+\.\d{2}$/.test(c.trim());
    });
  if (!node) throw new Error('km readout not found');
  return parseFloat(node.props.children as string);
}

// Mount App and navigate to the live-run screen, returning the watchPosition
// success callback the engine registered plus a km() reader.
async function startRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  // Home → goal keypad.
  pressByText(root, '러닝 시작');
  // Goal keypad → live run (default goal 5km). Effect runs beginRun()
  // synchronously on iOS (the jest RN preset's default Platform.OS), so
  // watchPosition is registered by the time act() flushes.
  await act(async () => {
    pressByText(root, '러닝 시작');
  });

  const calls = (Geolocation.watchPosition as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const onPos = calls[0][0] as (p: any) => void;

  const emit = (lat: number, lon: number, accuracy: number, timestamp: number) =>
    act(() => {
      onPos({coords: {latitude: lat, longitude: lon, accuracy}, timestamp});
    });

  return {renderer, root, emit, km: () => readKm(root)};
}

// ~111.32 m per 0.001° of latitude near these coordinates.
const LON = 127.0;

test('non-warmup rejection does not desync the speed gate: a normal segment after a rejected fix is still counted', async () => {
  const {renderer, emit, km} = await startRun();

  // idx0..2: warmup at a single point P0 → clears warmup, anchors last-good at P0.
  await emit(37.5, LON, 5, 100000);
  await emit(37.5, LON, 5, 102000);
  await emit(37.5, LON, 5, 104000);
  expect(km()).toBe(0);

  // idx3: first real fix ~11 m north over 2 s → accepted, distance starts counting.
  await emit(37.5001, LON, 5, 106000);
  const afterAccept = km();
  expect(afterAccept).toBeGreaterThan(0);

  // idx4: an inaccurate fix (35 m > 20 m gate) 5 s later, at the same spot.
  // Rejected on accuracy → must NOT advance last-good OR last-good-time.
  await emit(37.5001, LON, 35, 111000);
  expect(km()).toBe(afterAccept);

  // idx5: a normal ~44 m segment just 1 s after the rejected fix. dtSec must span
  // last-good (t=106000) → now (t=112000) = 6 s, giving ~7 m/s (accepted). The old
  // code measured dtSec from the rejected fix (1 s) → ~44 m/s → false rejection.
  await emit(37.5005, LON, 5, 112000);
  expect(km()).toBeGreaterThan(afterAccept);

  act(() => renderer.unmount());
});

test('warmup rejections advance the last-good anchor so the first post-warmup segment is not a giant jump', async () => {
  const {renderer, emit, km} = await startRun();

  // idx0 at P0, then warmup fixes (idx1,2) ~150 m away simulating GPS settling.
  // Warmup must advance last-good, so the first real fix (idx3) measures a short
  // segment from the settled point — not a ~150 m jump from P0.
  await emit(37.5, LON, 5, 100000);
  await emit(37.50135, LON, 5, 103000); // warmup, ~150 m drift
  await emit(37.50135, LON, 5, 106000); // warmup, settling
  await emit(37.50135, LON, 5, 109000); // idx3: first real fix, ~11 m from settled

  // If warmup had NOT advanced last-good, idx3 would measure ~150 m from P0 and
  // count ~0.15 km. Because it did advance, the counted distance is small (<0.1 km)
  // yet non-zero (the genuine short post-warmup segment is counted).
  const d = km();
  expect(d).toBeGreaterThan(0);
  expect(d).toBeLessThan(0.1);

  act(() => renderer.unmount());
});

test('cumulative distance sums multiple accepted segments (acceptSegment is wired into the running total)', async () => {
  const {renderer, emit, km} = await startRun();

  // Clear warmup at P0.
  await emit(37.5, LON, 5, 100000);
  await emit(37.5, LON, 5, 102000);
  await emit(37.5, LON, 5, 104000);

  // Three accepted ~33 m segments (≈11 m/s over 3 s, under the 12 m/s gate). km
  // must increase at each step and end well above a single segment's worth,
  // proving the segments are summed, not overwritten.
  await emit(37.5003, LON, 5, 107000);
  const k1 = km();
  await emit(37.5006, LON, 5, 110000);
  const k2 = km();
  await emit(37.5009, LON, 5, 113000);
  const k3 = km();

  expect(k1).toBeGreaterThan(0);
  expect(k2).toBeGreaterThan(k1);
  expect(k3).toBeGreaterThan(k2);
  // A single filtered segment is <0.034 km; exceeding that means ≥2 were summed.
  expect(k3).toBeGreaterThan(0.05);

  act(() => renderer.unmount());
});
