// ============================================================================
// forceUpdate / appVersion — 필수 업데이트 게이트 (AUDIT 2 I-3)
//
// 이 게이트의 계약은 하나로 요약된다: **모르면 막지 않는다(fail-open).**
// 잘못 켜지면 앱이 통째로 잠기고 사용자가 할 수 있는 게 없어지므로, 판정이 흔들릴 수
// 있는 모든 지점에서 '막지 않는' 쪽이 정답이다. 아래 테스트 대부분이 그 확인이다.
// ============================================================================
import {compareVersions, isBelowVersion, APP_VERSION} from '../../lib/appVersion';
import {normalizeAppConfig, shouldBlock, type RemoteAppConfig} from '../../lib/forceUpdate';
import {storeUrlFor} from '../../ForceUpdateScreen.rn';

describe('compareVersions', () => {
  test('기본 대소 비교', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  test('자릿수가 달라도 0으로 채워 비교한다', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBe(-1);
    expect(compareVersions('2', '1.9.9')).toBe(1);
  });

  test('숫자로 비교한다 — 문자열 정렬이 아니다(10 > 9)', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
  });

  test('프리릴리스 꼬리표는 잘라내고 본체로 비교한다', () => {
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0+build9', '1.2.0')).toBe(0);
  });

  test('형식이 아니면 null — 조용히 0으로 뭉개지 않는다', () => {
    for (const bad of ['', '   ', 'v1.0.0', '1.x.0', 'abc', null, undefined, 3, {}, []]) {
      expect(compareVersions(bad as unknown, '1.0.0')).toBeNull();
      expect(compareVersions('1.0.0', bad as unknown)).toBeNull();
    }
  });
});

describe('isBelowVersion — 비교 불가는 false(막지 않는다)', () => {
  test('낮으면 true', () => {
    expect(isBelowVersion('1.0.0', '1.0.1')).toBe(true);
  });
  test('같거나 높으면 false', () => {
    expect(isBelowVersion('1.0.1', '1.0.1')).toBe(false);
    expect(isBelowVersion('1.1.0', '1.0.1')).toBe(false);
  });
  test('형식이 아니면 false', () => {
    expect(isBelowVersion('알수없음', '1.0.1')).toBe(false);
    expect(isBelowVersion('1.0.0', '이상한값')).toBe(false);
  });
});

describe('normalizeAppConfig — 어떤 쓰레기가 와도 throw 하지 않는다', () => {
  test('빈/이상한 입력은 전부 null 필드', () => {
    for (const bad of [null, undefined, 0, 'x', [], [1, 2]]) {
      expect(normalizeAppConfig(bad)).toEqual({
        minSupportedVersion: null,
        storeUrlIos: null,
        storeUrlAndroid: null,
        message: null,
      });
    }
  });

  test('문자열만 받고 공백은 다듬는다(빈 문자열은 null)', () => {
    const c = normalizeAppConfig({
      minSupportedVersion: '  1.0.1  ',
      message: '',
      storeUrlIos: 'https://a',
      storeUrlAndroid: 42,
    });
    expect(c.minSupportedVersion).toBe('1.0.1');
    expect(c.message).toBeNull();
    expect(c.storeUrlIos).toBe('https://a');
    expect(c.storeUrlAndroid).toBeNull();
  });
});

describe('shouldBlock — 게이트 판정', () => {
  const cfg = (min: string | null): RemoteAppConfig => ({
    minSupportedVersion: min,
    storeUrlIos: null,
    storeUrlAndroid: null,
    message: null,
  });

  test('최소 버전보다 낮으면 막는다', () => {
    expect(shouldBlock(cfg('1.0.1'), '1.0.0')).toBe(true);
  });

  test('같거나 높으면 막지 않는다', () => {
    expect(shouldBlock(cfg('1.0.1'), '1.0.1')).toBe(false);
    expect(shouldBlock(cfg('1.0.1'), '2.0.0')).toBe(false);
  });

  // ── fail-open 계약 ────────────────────────────────────────────────────────
  test('설정을 못 읽었으면(null) 막지 않는다 — 오프라인·권한·장애', () => {
    expect(shouldBlock(null, '0.0.1')).toBe(false);
  });

  test('최소 버전이 없으면 막지 않는다', () => {
    expect(shouldBlock(cfg(null), '0.0.1')).toBe(false);
  });

  test('최소 버전이 형식이 아니면 막지 않는다 — 오타 하나로 전원 잠기지 않는다', () => {
    expect(shouldBlock(cfg('최신'), '1.0.0')).toBe(false);
    expect(shouldBlock(cfg('v2'), '1.0.0')).toBe(false);
  });

  test('현재 앱 버전(package.json)은 실제 형식이다 — 게이트가 동작할 수 있다', () => {
    expect(compareVersions(APP_VERSION, '0.0.0')).not.toBeNull();
  });
});

describe('storeUrlFor — 플랫폼별 링크', () => {
  const cfg: RemoteAppConfig = {
    minSupportedVersion: '1.0.1',
    storeUrlIos: 'https://apps.apple.com/app/id1',
    storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.solemate',
    message: null,
  };

  test('플랫폼에 맞는 링크를 고른다', () => {
    expect(storeUrlFor(cfg, 'ios')).toContain('apps.apple.com');
    expect(storeUrlFor(cfg, 'android')).toContain('play.google.com');
  });

  test('링크가 없으면 null — 화면은 버튼 대신 안내 문구로 폴백한다', () => {
    expect(storeUrlFor({...cfg, storeUrlIos: null}, 'ios')).toBeNull();
    expect(storeUrlFor(null, 'ios')).toBeNull();
  });
});
