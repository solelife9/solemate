/**
 * App.tsx background-tracking wiring test (audit#1).
 *
 * Drives the real App through home → goal → live-run and asserts the engine
 * registered its Geolocation.watchPosition with a `foregroundService`
 * notification config in the options (3rd arg). That option is what flips the
 * native location watch into a location-typed foreground service so distance and
 * time keep recording while the screen is off / the app is backgrounded — the
 * observable contract of this slice. We assert on the actual call the engine
 * made (not internal state).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import Geolocation from 'react-native-geolocation-service';
import App from '../App';
import {FG_SERVICE_CHANNEL_ID} from '../lib/foregroundService';

function mockBackendWithShoe() {
  (globalThis.fetch as jest.Mock).mockImplementation((url: any) => {
    const u = String(url);
    let body: any = {};
    if (u.includes('/api/auth')) body = {user_id: 'u1'};
    else if (u.includes('/api/shoes')) {
      body = [{id: 's1', name: 'Nike Pegasus', max_km: 600, start_km: 0}];
    } else if (u.includes('/api/runs')) body = [];
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  });
}

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

function pressByText(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const target = root
    .findAll(n => typeof n.props.onPress === 'function')
    .find(n => textOf(n).includes(label));
  if (!target) throw new Error(`no pressable containing text: ${label}`);
  act(() => {
    target.props.onPress();
  });
}

async function startRun() {
  mockBackendWithShoe();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const root = renderer.root;
  pressByText(root, '러닝 시작'); // Home → goal keypad
  await act(async () => {
    pressByText(root, '러닝 시작'); // goal → live run (default 5km)
  });
  return renderer;
}

test('live run starts the GPS watch with a foreground-service notification config so tracking survives backgrounding', async () => {
  const renderer = await startRun();

  const calls = (Geolocation.watchPosition as jest.Mock).mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  const options = calls[0][2];
  expect(options).toBeTruthy();
  expect(options.foregroundService).toBeTruthy();
  // Bound to the dedicated run-tracking channel with reassuring Korean copy.
  expect(options.foregroundService.channelId).toBe(FG_SERVICE_CHANNEL_ID);
  expect(options.foregroundService.notificationTitle).toBe('러닝 기록 중');
  expect(options.foregroundService.notificationBody).toContain('화면을 꺼도');
  // The default-goal run (5km) surfaces the goal in the persistent notification.
  expect(options.foregroundService.notificationBody).toContain('5km');

  act(() => renderer.unmount());
});
