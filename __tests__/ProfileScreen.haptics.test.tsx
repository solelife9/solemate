/**
 * ProfileScreen 햅틱(진동) 토글 행동 테스트 (사용자 요청 2026-07-13).
 *
 * 관찰 가능한 결과로 단언한다(정적 스캔 불충분):
 *   1) 로컬 상태·라벨 — 기본 '켜짐', 누르면 '꺼짐'으로 뒤집힌다(화면 반영).
 *   2) 폰 진동 즉시 반영 — 누르면 lib/haptics 전역 플래그(isHapticsEnabled)가 꺼진다.
 *   3) 영속 — 누르면 AsyncStorage K_HAPTICS 가 '0'/'1' 로 저장된다.
 *   4) 워치 전달 — 누르면 watchSession.setHaptics 가 같은 값으로 호출된다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileScreen from '../ProfileScreen.rn';
import {isHapticsEnabled, setHapticsEnabled} from '../lib/haptics';
import {watchSession} from '../lib/watchSession';
import {K_HAPTICS} from '../lib/settings';

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function byTestId(root: ReactTestRenderer.ReactTestInstance, id: string) {
  return root.findAll((n: any) => n.props?.testID === id)[0];
}

async function renderOpened(props: any = {}) {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = ReactTestRenderer.create(<ProfileScreen {...props} />);
  });
  // 설정 뷰를 연다(햅틱 행이 그 안에 있다). 마운트 효과(loadHaptics)도 흘려보낸다.
  await act(async () => {
    renderer.root.findAll((n: any) => n.props?.accessibilityLabel === '설정 열기')[0]?.props?.onPress?.();
  });
  return renderer.root;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setHapticsEnabled(true); // 각 테스트 독립 — 전역 플래그 초기화
  jest.restoreAllMocks();
});

test('기본 켜짐 → 누르면 꺼짐, 전역 플래그·영속·워치 전달이 모두 반영된다', async () => {
  const spy = jest.spyOn(watchSession, 'setHaptics');
  const root = await renderOpened();

  // 1) 기본 상태 라벨
  expect(textOf(byTestId(root, 'haptics-detail'))).toBe('켜짐');
  expect(isHapticsEnabled()).toBe(true);

  // 끄기
  await act(async () => { byTestId(root, 'haptics-row').props.onPress(); });

  // 1) 라벨 반영
  expect(textOf(byTestId(root, 'haptics-detail'))).toBe('꺼짐');
  // 2) 폰 진동 전역 플래그 즉시 off
  expect(isHapticsEnabled()).toBe(false);
  // 3) 영속 — K_HAPTICS '0'
  expect(await AsyncStorage.getItem(K_HAPTICS)).toBe('0');
  // 4) 워치 전달
  expect(spy).toHaveBeenLastCalledWith(false);
});

test('다시 누르면 켜짐으로 복귀(라운드트립)', async () => {
  const spy = jest.spyOn(watchSession, 'setHaptics');
  const root = await renderOpened();
  await act(async () => { byTestId(root, 'haptics-row').props.onPress(); }); // off
  await act(async () => { byTestId(root, 'haptics-row').props.onPress(); }); // on
  expect(textOf(byTestId(root, 'haptics-detail'))).toBe('켜짐');
  expect(isHapticsEnabled()).toBe(true);
  expect(await AsyncStorage.getItem(K_HAPTICS)).toBe('1');
  expect(spy).toHaveBeenLastCalledWith(true);
});

test('꺼둔 설정으로 재진입하면 꺼짐으로 복원된다(부팅 로드)', async () => {
  await AsyncStorage.setItem(K_HAPTICS, '0');
  const root = await renderOpened();
  expect(textOf(byTestId(root, 'haptics-detail'))).toBe('꺼짐');
  // 마운트 시 전역 플래그도 저장값으로 동기화된다.
  expect(isHapticsEnabled()).toBe(false);
});
