/**
 * Verifies the jest mock harness produces the observable behavior the app
 * relies on, without any real device, GPS, sensors, TTS or network.
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import {accelerometer} from 'react-native-sensors';
import {RUN_LOCATION_TASK} from '../lib/locationService';
import Tts from 'react-native-tts';
import App from '../App';

test('mounting App authenticates and persists a device id via AsyncStorage', async () => {
  await ReactTestRenderer.act(async () => {
    ReactTestRenderer.create(<App />);
  });

  // initUser() reached the auth endpoint through the mocked fetch.
  const requested = (globalThis.fetch as jest.Mock).mock.calls.map(c => String(c[0]));
  expect(requested.some(u => u.includes('/api/auth'))).toBe(true);

  // The generated device id round-trips through the AsyncStorage mock.
  const deviceId = await AsyncStorage.getItem('device_id');
  expect(deviceId).toMatch(/^sl_/);
});

test('expo watchPositionAsync hands back a removable subscription', async () => {
  const sub = await Location.watchPositionAsync({} as any, jest.fn());
  // The run engine calls sub.remove() on stop — the mock must provide it.
  expect(typeof sub.remove).toBe('function');
  expect(() => sub.remove()).not.toThrow();
});

test('foreground location permission resolves granted without a real device prompt', async () => {
  await expect(
    Location.requestForegroundPermissionsAsync(),
  ).resolves.toMatchObject({granted: true});
});

test('the background run-location task is registered with TaskManager', () => {
  // Importing lib/locationService defines the task at module scope; the mocked
  // defineTask records it so a headless background batch can be replayed in tests.
  const executor = (TaskManager as any).__getTask(RUN_LOCATION_TASK);
  expect(typeof executor).toBe('function');
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
