/**
 * Verifies the jest mock harness produces the observable behavior the app
 * relies on, without any real device, GPS, sensors, TTS or network.
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Geolocation from 'react-native-geolocation-service';
import {accelerometer} from 'react-native-sensors';
import Tts from 'react-native-tts';
import App from '../App';

test('mounting App authenticates and persists a device id via AsyncStorage', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });

  // initUser() reached the auth endpoint through the mocked fetch.
  const requested = (global.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
  expect(requested.some(u => u.includes('/api/auth'))).toBe(true);

  // The generated device id round-trips through the AsyncStorage mock.
  const deviceId = await AsyncStorage.getItem('device_id');
  expect(deviceId).toMatch(/^sl_/);
});

test('Geolocation watchPosition id round-trips through clearWatch', () => {
  const id = Geolocation.watchPosition(jest.fn(), jest.fn(), {} as any);
  expect(typeof id).toBe('number');

  // clearWatch must accept the very id watchPosition handed back — assert the
  // mock recorded that exact argument, not merely that the call didn't throw.
  Geolocation.clearWatch(id);
  expect(Geolocation.clearWatch as jest.Mock).toHaveBeenCalledWith(id);
});

test('requestAuthorization resolves without a real device prompt', async () => {
  await expect(Geolocation.requestAuthorization('whenInUse')).resolves.toBe('granted');
});

test('accelerometer.subscribe returns an unsubscribable handle and never emits', () => {
  const onData = jest.fn();
  const sub = accelerometer.subscribe(onData);
  expect(typeof sub.unsubscribe).toBe('function');
  sub.unsubscribe();
  expect(onData).not.toHaveBeenCalled();
});

test('Tts is stubbed: speak/stop inert, getInitStatus/voices resolve', async () => {
  // App.tsx only touches Tts.* inside the run-active effect, so the home-mount
  // tests never exercise these stubs — assert the voice harness directly.
  expect(() => Tts.speak('테스트')).not.toThrow();
  expect(() => Tts.stop()).not.toThrow();
  await expect(Tts.getInitStatus()).resolves.toBe('success');
  await expect(Tts.voices()).resolves.toEqual([]);
});
