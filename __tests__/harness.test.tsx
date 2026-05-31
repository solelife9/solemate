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

test('Geolocation watchPosition is stubbed and returns a numeric watch id', () => {
  const id = Geolocation.watchPosition(jest.fn(), jest.fn(), {} as any);
  expect(typeof id).toBe('number');
  expect(Geolocation.clearWatch).not.toThrow();
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
