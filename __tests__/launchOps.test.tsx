/**
 * 출시 운영(Launch Ops) 계약 — 2026-08-04 감사 `docs/audit/07-launch-ops.md` 수정분의 회귀 가드.
 *
 * 여기서 지키는 것은 기능이 아니라 **출시 후 우리가 볼 수 있는 것**이다. 그래서 깨져도
 * 사용자 화면은 멀쩡하고, 대신 지표가 조용히 거짓말을 하기 시작한다 — 그런 종류는 사람이
 * 눈으로 못 잡으므로 테스트가 유일한 파수꾼이다.
 *
 * 관찰:
 *   1) 권한 수락률이 '실행 횟수'로 오염되지 않는다 — 같은 결과는 한 실행에서 한 번만 (L-12).
 *   2) 값이 **바뀌면** 보낸다 — 거부 → 설정에서 허용은 진짜 신호다 (L-12).
 *   3) 활성화 지표가 등록이 일어난 자리를 구분한다 (L-10).
 *   4) 지원 URL 이 웹 페이지다 — `mailto:` 는 스토어 제출 폼을 통과하지 못한다 (L-01).
 *   5) 반복 크래시에서 사용자에게 나갈 문이 있다 (L-03).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Text as RNText} from 'react-native';
import {Linking} from 'react-native';
import ErrorBoundary from '../ErrorBoundary';
import {
  EVENTS,
  trackPermissionResult,
  trackFirstShoeAdded,
  __resetPermissionDedupe,
} from '../lib/productAnalytics';
import {SUPPORT_URL, SUPPORT_EMAIL, PRIVACY_URL} from '../lib/legalLinks';

const analytics = require('@react-native-firebase/analytics');

beforeEach(() => {
  analytics.logEvent.mockClear();
  __resetPermissionDedupe();
});

/** logEvent 로 나간 (이름, 파라미터) 전부. */
function events(): {name: string; params: any}[] {
  return analytics.logEvent.mock.calls.map((c: any[]) => ({name: c[1], params: c[2]}));
}

describe('L-12 권한 수락률 — 중복 전송 방지', () => {
  it('같은 결과를 두 번 보고해도 이벤트는 한 번만 나간다', () => {
    // 모션 권한은 러닝 시작 앞단(App)과 케이던스 구독(RunEngine) 두 곳에서 요청한다.
    // OS 는 두 번째에 다이얼로그를 띄우지 않고 이미 정해진 답을 즉시 돌려준다.
    trackPermissionResult('motion', true);
    trackPermissionResult('motion', true);
    trackPermissionResult('motion', true);

    const sent = events().filter(e => e.name === EVENTS.permissionResult);
    expect(sent).toHaveLength(1);
    expect(sent[0].params).toEqual({kind: 'motion', granted: true});
  });

  it('많이 달릴수록 수락률에 크게 반영되는 오염이 생기지 않는다', () => {
    // 러닝 10회 = 요청 20회. 예전이라면 이 한 사람이 이벤트 20개를 만들어, 수락률이
    // '사람 수'가 아니라 '실행 횟수'로 계산됐다.
    for (let i = 0; i < 10; i++) {
      trackPermissionResult('motion', true);
      trackPermissionResult('motion', true);
    }
    expect(events().filter(e => e.name === EVENTS.permissionResult)).toHaveLength(1);
  });

  it('결과가 바뀌면 보낸다 — 거부 후 설정에서 허용은 진짜 신호다', () => {
    trackPermissionResult('location', false);
    trackPermissionResult('location', false); // 중복 — 무시
    trackPermissionResult('location', true); // 변화 — 전송

    const sent = events().filter(e => e.name === EVENTS.permissionResult);
    expect(sent).toHaveLength(2);
    expect(sent[0].params).toEqual({kind: 'location', granted: false});
    expect(sent[1].params).toEqual({kind: 'location', granted: true});
  });

  it('권한 종류끼리는 서로를 가리지 않는다', () => {
    trackPermissionResult('location', true);
    trackPermissionResult('location_background', false);
    trackPermissionResult('notification', true);
    trackPermissionResult('health', true);
    trackPermissionResult('motion', true);

    const kinds = events()
      .filter(e => e.name === EVENTS.permissionResult)
      .map(e => e.params.kind);
    expect(kinds).toEqual(['location', 'location_background', 'notification', 'health', 'motion']);
  });
});

describe('L-10 활성화 지표 — 등록이 일어난 자리', () => {
  it('온보딩 등록과 메인 등록을 구분해 보낸다', () => {
    trackFirstShoeAdded('onboarding');
    expect(events().pop()).toEqual({
      name: EVENTS.firstShoeAdded,
      params: {source: 'onboarding'},
    });

    trackFirstShoeAdded('manual');
    expect(events().pop()).toEqual({
      name: EVENTS.firstShoeAdded,
      params: {source: 'manual'},
    });
  });
});

describe('L-01 지원 URL — 스토어 제출 필수 필드', () => {
  it('mailto 가 아니라 https 웹 페이지다', () => {
    // ASC 의 Support URL 은 웹 페이지여야 한다. 이메일 주소를 넣으면 폼이 거부한다.
    expect(SUPPORT_URL.startsWith('https://')).toBe(true);
    expect(SUPPORT_URL).not.toContain('mailto:');
  });

  it('법적 문서와 같은 호스트에 있다 — 한 곳만 살아 있고 한 곳은 죽는 사고를 막는다', () => {
    const host = (u: string) => u.split('/').slice(0, 4).join('/');
    expect(host(SUPPORT_URL)).toBe(host(PRIVACY_URL));
  });

  it('지원 이메일은 그대로 유지된다 — 앱 내 문의는 메일이 1차 창구다', () => {
    expect(SUPPORT_EMAIL).toContain('@');
  });
});

describe('L-13 수집 opt-out — 끄면 실제로 꺼지는가', () => {
  const {parseTelemetry, DEFAULT_TELEMETRY} = require('../lib/settings');

  it('기본값은 켬이다', () => {
    expect(DEFAULT_TELEMETRY).toBe(true);
    // 값이 없거나 손상돼도 켬으로 읽는다(햅틱과 같은 규약).
    expect(parseTelemetry(null)).toBe(true);
    expect(parseTelemetry(undefined)).toBe(true);
    expect(parseTelemetry('쓰레기')).toBe(true);
  });

  it("'0'/'false' 만 끔으로 읽는다", () => {
    expect(parseTelemetry('0')).toBe(false);
    expect(parseTelemetry('false')).toBe(false);
    expect(parseTelemetry('1')).toBe(true);
  });

  it('끄면 analytics SDK 수집이 실제로 꺼진다', () => {
    const {setAnalyticsEnabled} = require('../lib/productAnalytics');
    analytics.setAnalyticsCollectionEnabled.mockClear();
    setAnalyticsEnabled(false);
    expect(analytics.setAnalyticsCollectionEnabled).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('부팅 시 저장된 선택을 적용한다 — 껐는데 다시 켜지면 스위치가 거짓말이 된다', () => {
    // App.tsx 가 모듈 로드 시점에 loadTelemetry → set*(on) 을 부른다. 이게 빠지면
    // 사용자가 끈 뒤 앱을 재시작할 때마다 조용히 되켜진다(없는 것보다 나쁘다).
    const {readFileSync} = require('fs');
    const {join} = require('path');
    const src = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(src).toMatch(/loadTelemetry\(\)/);
    expect(src).toMatch(/setAnalyticsEnabled\(on\)/);
    expect(src).toMatch(/setCrashCollectionEnabled\(on\)/);
  });

  it('처리방침이 끌 수 있다는 사실과 경로를 고지한다', () => {
    // 스위치만 있고 방침에 없으면 심사에서 불일치로 잡힌다.
    const {readFileSync} = require('fs');
    const {join} = require('path');
    const html = readFileSync(join(__dirname, '..', 'docs/privacy.html'), 'utf8');
    expect(html).toContain('사용 기록 보내기');
    expect(html).toMatch(/Crashlytics/);
  });
});

describe('L-02 워치 크래시 수집 — 배선이 남아 있는가', () => {
  // 네이티브 설정은 앱 테스트가 한 줄도 보지 않는 영역이다(nativePermissions.test.ts 와 같은
  // 취지). 워치 크래시 수집은 눈에 보이는 기능이 아니라서, 빠져도 아무도 눈치채지 못한다 —
  // 그래서 파일을 텍스트로 읽어 지킨다(빌드·시뮬레이터 불필요).
  const {readFileSync, existsSync} = require('fs');
  const {join} = require('path');
  const ROOT = join(__dirname, '..');
  const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

  it('워치 타깃에 FirebaseCrashlytics 가 선언돼 있다', () => {
    const podfile = read('ios/Podfile');
    expect(podfile).toContain("target 'SoleMateWatch Watch App' do");
    expect(podfile).toContain("pod 'FirebaseCrashlytics'");
  });

  it('워치 앱이 시작 시 크래시 수집을 켠다', () => {
    expect(existsSync(join(ROOT, 'ios/SoleMateWatch Watch App/WatchCrash.swift'))).toBe(true);
    expect(read('ios/SoleMateWatch Watch App/SoleMateWatchApp.swift')).toContain('WatchCrash.start()');
  });

  it('설정 파일이 없으면 조용히 꺼진다 — 워치 앱을 죽이지 않는다', () => {
    // FirebaseApp.configure() 는 GoogleService-Info 가 없으면 예외를 던지며 앱을 죽인다.
    // 워치용 Firebase 앱 등록 전까지는 반드시 no-op 이어야 한다.
    const src = read('ios/SoleMateWatch Watch App/WatchCrash.swift');
    expect(src).toContain('GoogleService-Info');
    expect(src).toMatch(/guard let path = Bundle\.main\.path/);
  });

  it('dSYM 업로드 페이즈도 설정 파일이 없으면 건너뛴다 — 빌드를 깨지 않는다', () => {
    // 가드 없이 run 을 부르면 빌드가 통째로 실패한다:
    //   error: Could not get GOOGLE_APP_ID in Google Services file from build environment
    const podfile = read('ios/Podfile');
    expect(podfile).toContain('FirebaseCrashlytics/run');
    expect(podfile).toContain('GoogleService-Info.plist');
    // 스크립트 샌드박스가 켜져 있으면 run 파일조차 못 읽는다(워치 타깃 기본값이 YES 였다).
    expect(podfile).toContain("ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'");
  });
});

describe('L-03 ErrorBoundary — 반복 크래시에서 나갈 문', () => {
  // React 가 boundary 로 잡은 에러를 console.error 로 보고한다(검증 대상이 아니므로 가린다).
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  function Boom(): React.ReactElement {
    throw new Error('child exploded');
  }
  function texts(tree: ReactTestRenderer.ReactTestRenderer): string {
    return tree.root
      .findAllByType(RNText)
      .map(n => {
        const c = n.props.children;
        return Array.isArray(c) ? c.join('') : String(c);
      })
      .join(' | ');
  }

  it('첫 폴백에도 문의 경로가 있다', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(tree.root.findAllByProps({testID: 'error-support'}).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({testID: 'error-retry'}).length).toBeGreaterThan(0);
    // 메일 앱도 브라우저도 못 여는 최악의 경우를 위한 마지막 줄.
    expect(texts(tree)).toContain(SUPPORT_EMAIL);
  });

  it('재시도가 반복되면 문구가 바뀌고 문의가 주행동이 된다', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(texts(tree)).toContain('문제가 발생했어요');

    // 같은 원인이 계속 터지는 상황 — 자식은 여전히 던진다.
    const retry = () => {
      const btn = tree.root.findAllByProps({testID: 'error-retry'});
      const pressable = btn.find(n => typeof n.props.onPress === 'function');
      act(() => {
        pressable!.props.onPress();
      });
    };
    retry();
    retry();

    // "잠시 후 다시 시도해 주세요"는 이 시점에 거짓말이다.
    expect(texts(tree)).toContain('오류가 계속되고 있어요');
    expect(texts(tree)).not.toContain('일시적인 오류');
    // 두 버튼 모두 남아 있다(재시도를 없애지는 않는다 — 우선순위만 뒤집는다).
    expect(tree.root.findAllByProps({testID: 'error-support'}).length).toBeGreaterThan(0);
    expect(tree.root.findAllByProps({testID: 'error-retry'}).length).toBeGreaterThan(0);
  });

  // ── L-04(크래시 쪽) 2026-08-08 ────────────────────────────────────────────
  // 마이 탭 문의는 진단 정보를 프리필하는데 **크래시 화면만 빠져 있었다.** 크래시 신고에서
  // 더 중요하다 — 버전·기기 없는 제보는 재현이 사실상 불가능해 왕복이 한 번 늘고,
  // 화면이 깨진 사용자는 그 왕복을 기다려 주지 않는다.
  it('문의 메일에 진단 정보를 우리가 채운다(사용자에게 시키지 않는다)', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    const btn = tree.root
      .findAllByProps({testID: 'error-support'})
      .find(n => typeof n.props.onPress === 'function');
    act(() => {
      btn!.props.onPress();
    });

    expect(openURL).toHaveBeenCalled();
    const url = decodeURIComponent(String(openURL.mock.calls[0][0]));
    expect(url.startsWith('mailto:')).toBe(true);
    expect(url).toContain('앱 버전:');
    expect(url).toContain(require('../package.json').version);
    expect(url).toContain('기기:');
    expect(url).toContain('오류: Error');   // 종류만 — 메시지 본문은 넣지 않는다
    expect(url).toContain('재시도: 0회');

    // 사용자 데이터·오류 메시지 본문은 실리지 않는다(적기로 선택하지 않은 것을 미리
    // 채우면 수집이 아니라 유출에 가깝다 — 마이 탭 문의와 같은 규약).
    expect(url).not.toContain('child exploded');

    openURL.mockRestore();
  });
});
