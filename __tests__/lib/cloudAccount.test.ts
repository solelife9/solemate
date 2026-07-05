/**
 * cloudAccount — 로그인 계정/제공자 영속(2026-07-05) 계약:
 *  1) save → load 라운드트립(provider·uid·email 보존).
 *  2) clear 후 load 는 null.
 *  3) 손상/부분 데이터는 null(graceful).
 *  4) CLOUD_PROVIDER_LABEL 한국어 매핑.
 *
 * @format
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {saveCloudAccount, loadCloudAccount, clearCloudAccount, CLOUD_PROVIDER_LABEL} from '../../lib/cloudAccount';

beforeEach(async () => { await AsyncStorage.clear(); });

test('save → load 라운드트립', async () => {
  await saveCloudAccount('kakao', {uid: 'u1', email: 'a@b.com', displayName: '민우'});
  const acc = await loadCloudAccount();
  expect(acc).toEqual({provider: 'kakao', uid: 'u1', email: 'a@b.com', displayName: '민우'});
});

test('clear 후 load 는 null', async () => {
  await saveCloudAccount('naver', {uid: 'u2'});
  await clearCloudAccount();
  expect(await loadCloudAccount()).toBeNull();
});

test('저장 없음/손상/부분 데이터 → null', async () => {
  expect(await loadCloudAccount()).toBeNull();
  await AsyncStorage.setItem('cloud_account', '{oops');
  expect(await loadCloudAccount()).toBeNull();
  await AsyncStorage.setItem('cloud_account', JSON.stringify({uid: 'u3'})); // provider 없음
  expect(await loadCloudAccount()).toBeNull();
  await AsyncStorage.setItem('cloud_account', JSON.stringify({provider: 'bogus', uid: 'u3'})); // 미지 provider
  expect(await loadCloudAccount()).toBeNull();
});

test('provider 한국어 라벨', () => {
  expect(CLOUD_PROVIDER_LABEL.kakao).toBe('카카오');
  expect(CLOUD_PROVIDER_LABEL.naver).toBe('네이버');
  expect(CLOUD_PROVIDER_LABEL.google).toBe('Google');
  expect(CLOUD_PROVIDER_LABEL.apple).toBe('Apple');
});
