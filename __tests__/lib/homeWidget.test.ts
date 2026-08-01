// homeWidget.test.ts — 홈 위젯 갱신 통로 (2026-07-31 Android 동등성)
//
// 배경: 위젯 갱신이 watchSession(=Platform.OS==='ios' 로 잠긴 애플워치 모듈)에 얹혀 있어
// **안드로이드에서는 위젯이 통째로 no-op** 이었다. 위젯은 워치와 무관한 폰 기능이라
// lib/homeWidget 으로 분리해 플랫폼별 구현을 고르게 했다.
//
// 여기서 고정하는 것:
//  1) 정규화 — 이름 없는 신발은 위젯에 올리지 않고, 음수·NaN 은 0 으로 눕힌다.
//  2) 어떤 실패도 밖으로 새지 않는다(위젯은 부가 표시다).
//  3) 안드로이드는 KeegoWidgetModule 로, iOS 는 기존 watchSession 경로로 간다.

import {normalizeWidgetShoe} from '../../lib/homeWidget';

describe('normalizeWidgetShoe — 위젯에 올릴 값 정규화', () => {
  test('정상 입력은 그대로 통과한다', () => {
    expect(
      normalizeWidgetShoe({name: 'Pegasus 41', brand: 'Nike', category: '데일리', usedKm: 118, maxKm: 650}),
    ).toEqual({name: 'Pegasus 41', brand: 'Nike', category: '데일리', usedKm: 118, maxKm: 650});
  });

  test('이름이 없으면 null — 띄울 게 없는 위젯을 만들지 않는다', () => {
    expect(normalizeWidgetShoe(null)).toBeNull();
    expect(normalizeWidgetShoe(undefined)).toBeNull();
    expect(normalizeWidgetShoe({name: '', maxKm: 600})).toBeNull();
    expect(normalizeWidgetShoe({name: '   ', maxKm: 600})).toBeNull();
  });

  test('음수·NaN·문자열 수치는 0 으로 눕힌다(위젯이 이상한 링을 그리지 않게)', () => {
    const out = normalizeWidgetShoe({name: 'X', usedKm: -5, maxKm: Number.NaN});
    expect(out).toEqual({name: 'X', brand: '', category: '', usedKm: 0, maxKm: 0});
  });

  test('소수 km 는 반올림한다(위젯은 정수만 보여준다)', () => {
    const out = normalizeWidgetShoe({name: 'X', usedKm: 118.6, maxKm: 649.4});
    expect(out?.usedKm).toBe(119);
    expect(out?.maxKm).toBe(649);
  });

  test('브랜드·카테고리 누락은 빈 문자열(네이티브가 null 을 받지 않게)', () => {
    const out = normalizeWidgetShoe({name: 'X', usedKm: 1, maxKm: 2});
    expect(out?.brand).toBe('');
    expect(out?.category).toBe('');
  });
});

// react-native 를 통째로 다시 목 하면 RN 프리셋(TurboModule 등록)이 깨진다.
// 이미 목 처리된 객체의 Platform.OS / NativeModules 만 갈아끼우고 모듈을 재적재한다
// (homeWidget 은 로드 시점에 NativeModules 를 읽으므로 resetModules 가 필요하다).
describe('updateHomeWidgetShoe — 플랫폼 분기와 무음 실패', () => {
  // ⚠️ 순서가 중요하다: resetModules 를 먼저 해야 그 뒤 require 한 react-native 가
  // homeWidget 이 실제로 볼 **같은 인스턴스**다. 순서를 바꾸면 갈아끼운 값이 날아간다.
  const loadAsAndroid = (nativeModule: unknown) => {
    jest.resetModules();
    const rn = require('react-native');
    rn.Platform.OS = 'android';
    if (nativeModule === undefined) delete rn.NativeModules.KeegoWidgetModule;
    else rn.NativeModules.KeegoWidgetModule = nativeModule;
    return require('../../lib/homeWidget');
  };

  afterEach(() => {
    jest.resetModules(); // 다음 스위트가 깨끗한 react-native 를 받도록
  });

  test('안드로이드: KeegoWidgetModule 로 정규화된 값을 넘긴다', () => {
    const updateShoe = jest.fn();
    const mod = loadAsAndroid({updateShoe});
    mod.updateHomeWidgetShoe({name: 'Bondi 9', brand: 'Hoka', category: '쿠션', usedKm: 10.4, maxKm: 700});
    expect(updateShoe).toHaveBeenCalledTimes(1);
    expect(updateShoe.mock.calls[0][0]).toEqual({
      name: 'Bondi 9', brand: 'Hoka', category: '쿠션', usedKm: 10, maxKm: 700,
    });
  });

  test('네이티브가 throw 해도 밖으로 새지 않는다', () => {
    const mod = loadAsAndroid({updateShoe: () => { throw new Error('boom'); }});
    expect(() => mod.updateHomeWidgetShoe({name: 'X', usedKm: 1, maxKm: 2})).not.toThrow();
  });

  test('모듈이 없는 안드로이드(구버전 빌드)에서도 조용히 넘어간다', () => {
    const mod = loadAsAndroid(undefined);
    expect(mod.homeWidgetAvailable()).toBe(false);
    expect(() => mod.updateHomeWidgetShoe({name: 'X', usedKm: 1, maxKm: 2})).not.toThrow();
  });

  test('이름 없는 신발은 네이티브를 아예 부르지 않는다', () => {
    const updateShoe = jest.fn();
    const mod = loadAsAndroid({updateShoe});
    mod.updateHomeWidgetShoe({name: '', usedKm: 1, maxKm: 2});
    expect(updateShoe).not.toHaveBeenCalled();
  });
});
