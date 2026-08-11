/**
 * iOS Pod 동기화 가드 — **package.json 에 네이티브 의존성을 넣고 `pod install` 을 빠뜨리면 잡는다.**
 *
 * 왜 있나 (2026-08-11 실기기 사고)
 * ----------------------------------------------------------------------------
 * `expo-document-picker` 를 package.json 에 추가하고 iOS 쪽 `pod install` 을 안 돌린 채
 * 빌드했다. 결과:
 *
 *     Cannot find native module 'ExpoDocumentPicker'
 *     App terminated due to signal 6      ← 앱이 켜자마자 죽는다
 *
 * **테스트로는 절대 안 잡히는 종류다.** jest 는 네이티브 모듈을 모킹하므로 3,748 개가 전부
 * 초록이어도 실기기에서 즉사한다. 안드로이드는 Gradle 자동 링크라 멀쩡해서, 한쪽만 죽는다는
 * 점이 원인 추적을 더 늦춘다.
 *
 * 그래서 '실행'이 아니라 **파일 정합**으로 잡는다: node_modules 에 podspec 을 가진(=네이티브
 * 코드가 있는) 의존성은 반드시 `ios/Podfile.lock` 에 있어야 한다.
 *
 * 걸렸을 때: `cd ios && USE_FRAMEWORKS=static bundle exec pod install`
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const lock = fs.readFileSync(path.join(ROOT, 'ios', 'Podfile.lock'), 'utf8');

/** 이 의존성이 제공하는 podspec 이름들(파일명에서). 없으면 순수 JS 패키지다. */
function podspecNames(dep: string): string[] {
  const dir = path.join(ROOT, 'node_modules', dep);
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.podspec'))
      .map(f => f.replace(/\.podspec$/, ''));
  } catch {
    return [];
  }
}

describe('iOS Pod 동기화 — 네이티브 의존성이 Podfile.lock 에 빠지면 앱이 켜자마자 죽는다', () => {
  const nativeDeps = Object.keys(pkg.dependencies ?? {})
    .map(dep => ({dep, specs: podspecNames(dep)}))
    .filter(x => x.specs.length > 0);

  test('네이티브 의존성을 실제로 찾았다 (탐지가 조용히 0건이 되지 않게)', () => {
    // 이 가드 자체가 고장 나면(경로 변경 등) 조용히 0건을 훑고 통과해 버린다.
    expect(nativeDeps.length).toBeGreaterThan(10);
  });

  test('podspec 을 가진 의존성이 전부 Podfile.lock 에 있다', () => {
    // 한 패키지가 여러 podspec 을 낼 수 있다(react-native 는 React/React-Core/…).
    // 그중 **하나라도** lock 에 있으면 통합된 것으로 본다.
    const missing = nativeDeps
      .filter(({specs}) => !specs.some(name => new RegExp(`^  - ${escape(name)}[ (/]`, 'm').test(lock)))
      .map(({dep, specs}) => `${dep} (podspec: ${specs.join(', ')})`);
    expect({
      missing,
      hint: 'cd ios && USE_FRAMEWORKS=static bundle exec pod install',
    }).toEqual({missing: [], hint: expect.any(String)});
  });
});

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
