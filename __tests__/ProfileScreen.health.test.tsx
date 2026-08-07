/**
 * 심박 연동 행 — 막다른 길 금지 (2026-08-06)
 *
 * 왜: 안드로이드는 Health Connect 가 **별도 앱**이다(안드로이드 13 이하). 미설치 상태에서
 * 연동을 누르면 이전 코드는 `if (!ok) return;` 으로 조용히 끝났다 — 눌렀는데 아무 일도
 * 일어나지 않는, 이 저장소가 가장 싫어하는 종류의 실패다.
 *
 * 여기서 못 박는 것:
 *   1) 미설치 → 설치 경로를 안내한다(그냥 끝나지 않는다)
 *   2) 사용자가 거부 → 되돌릴 방법(설정 화면)을 알려 준다
 *   3) 행 이름은 플랫폼에 맞는 앱 이름이다 — 안드로이드에서 "Apple 건강"은 사용자에게
 *      존재하지 않는 앱이다
 *
 * @format
 */
const mockDialog = jest.fn();

// ⚠️ React·react-test-renderer 도 resetModules 안에서 새로 가져와야 한다. 밖에서 import 하면
// 컴포넌트는 새 React 를, 렌더러는 옛 React 를 쓰게 돼 훅이 null 을 읽는다
// ("Cannot read properties of null (reading 'useState')").
let live: {unmount: () => void; root: any} | null = null;
let liveAct: ((cb: () => void | Promise<void>) => void | Promise<void>) | null = null;
afterEach(async () => {
  if (live && liveAct) {
    const a = liveAct as (cb: () => Promise<void>) => Promise<void>;
    await a(async () => { live?.unmount(); await Promise.resolve(); });
  }
  live = null;
  liveAct = null;
  mockDialog.mockClear();
  jest.resetModules();
});

function setup(os: string, opts: {sdkReady: boolean; linkOk: boolean}) {
  jest.resetModules();
  const RN = require('react-native');
  Object.defineProperty(RN.Platform, 'OS', {value: os, configurable: true});
  jest.doMock('../lib/dialog', () => ({showDialog: (...a: unknown[]) => mockDialog(...a)}));
  jest.doMock('../lib/health', () => ({
    hkAvailable: () => true,
    hkLinked: () => Promise.resolve(false),
    hkLink: () => Promise.resolve(opts.linkOk),
    hkRestingHR: () => Promise.resolve(0),
    healthStoreReady: () => Promise.resolve(opts.sdkReady),
    openHealthStoreSettings: jest.fn(),
    HEALTH_STORE_NAME: os === 'android' ? 'Health Connect' : 'Apple 건강',
  }));
  const React = require('react');
  const TR = require('react-test-renderer');
  const ProfileScreen = require('../ProfileScreen.rn').default;
  let renderer: any;
  TR.act(() => {
    renderer = TR.create(React.createElement(ProfileScreen, {initialOpen: 'settings'}));
  });
  live = renderer;
  liveAct = TR.act;
  return {root: renderer.root, act: TR.act};
}

const rowByTestId = (root: any, id: string) =>
  root.findAll((n: any) => n.props?.testID === id && typeof n.props?.onPress === 'function')[0];

const textOf = (node: any): string => {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
};

describe('심박 연동은 눌렀을 때 반드시 무언가 말한다', () => {
  test('안드로이드 · Health Connect 미설치 → 설치 안내를 띄운다(조용히 끝나지 않음)', async () => {
    const {root, act} = setup('android', {sdkReady: false, linkOk: false});
    await act(async () => { await rowByTestId(root, 'link-health').props.onPress(); });

    expect(mockDialog).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = mockDialog.mock.calls[0];
    expect(String(title)).toContain('Health Connect');
    expect(String(body)).toContain('심박');
    // '설치하기' 출구가 반드시 있어야 한다 — 안내만 하고 끝나면 여전히 막다른 길이다.
    expect((buttons as {text: string}[]).some(b => b.text === '설치하기')).toBe(true);
  });

  test('안드로이드 · 사용자가 권한을 거부 → 되돌릴 방법을 알려 준다', async () => {
    const {root, act} = setup('android', {sdkReady: true, linkOk: false});
    await act(async () => { await rowByTestId(root, 'link-health').props.onPress(); });

    expect(mockDialog).toHaveBeenCalledTimes(1);
    const [, , buttons] = mockDialog.mock.calls[0];
    expect((buttons as {text: string}[]).some(b => b.text === '설정 열기')).toBe(true);
  });

  test('연동에 성공하면 다이얼로그를 띄우지 않는다(성공은 조용한 게 맞다)', async () => {
    const {root, act} = setup('android', {sdkReady: true, linkOk: true});
    await act(async () => { await rowByTestId(root, 'link-health').props.onPress(); });
    expect(mockDialog).not.toHaveBeenCalled();
  });

  test('행 이름은 그 플랫폼에 실재하는 앱 이름이다', () => {
    const {root} = setup('android', {sdkReady: true, linkOk: true});
    expect(textOf(rowByTestId(root, 'link-health'))).toContain('Health Connect');
  });
});

// ============================================================================
// 화면 문구 전수 스윕 (2026-08-07 감사)
//
// 커밋 f5d5271(2026-08-06)이 "남은 'Apple 건강' 문구"를 고치면서 화면을 훑었다고 적었는데
// **바로 5줄 아래 두 줄을 놓쳤다.** 안드로이드 사용자는 자기 폰에 없는 앱 이름을 읽고
// 무엇을 눌러야 할지 모른다.
//
// 한 곳씩 고치면 다음에 또 놓친다. 그래서 **소스에서 사용자 문구를 긁어** 검사한다.
// 주석은 걷어낸다 — iOS 전용 코드를 설명하는 주석에는 그 이름이 있는 게 맞다.
// ============================================================================
describe('건강 앱 이름 — 하드코딩 스윕', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const ROOT = path.join(__dirname, '..');

  /** 화면 파일에서 주석을 걷어낸 코드만 돌려준다. */
  const codeOf = (rel: string) =>
    fs
      .readFileSync(path.join(ROOT, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')       // 블록 주석
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')   // JSX 주석
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*)/.test(l))  // 줄 주석
      .join('\n');

  /** 사용자에게 문구를 보여주는 화면 파일 전부. */
  const screens = fs
    .readdirSync(ROOT, {withFileTypes: true})
    .filter(e => e.isFile() && /\.rn\.tsx$/.test(e.name))
    .map(e => e.name);

  test('검사 대상 화면을 실제로 찾았다', () => {
    expect(screens.length).toBeGreaterThan(5);
  });

  test.each(screens)('%s — 건강 앱 이름을 하드코딩하지 않는다', name => {
    // 이름은 lib/health.ts 의 HEALTH_STORE_NAME 한 곳에서만 정한다.
    expect(codeOf(name)).not.toContain('Apple 건강');
  });
});
