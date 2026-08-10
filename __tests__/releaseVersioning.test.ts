// 출시 버전 — **틀린 값으로 성공하는 빌드를 막는다.**
//
// 왜 있나 (2026-08-10)
// ----------------------------------------------------------------------------
// 안드로이드 `versionCode` 가 `~/.gradle/gradle.properties` 에서 주입되는 구조였다 —
// 카카오 네이티브 키(비밀)와 **같은 방식**으로 모델링돼 있었기 때문이다. 그런데 버전
// 번호는 비밀의 반대다: 저장소에 남아 리뷰되고 히스토리로 추적돼야 하는 값이다.
//
// 그래서 실제로 물었다. 문서화된 명령(`npm run build:android:release`)으로 빌드하니
// 값이 없어 **versionCode 1** 짜리 APK 가 나왔고, 폰 설치가
// INSTALL_FAILED_VERSION_DOWNGRADE 로 거부됐다(폰은 22). Play 에 올렸다면 반려다 —
// 그리고 원인이 빌드 명령이 아니라 '안 넘긴 프로퍼티'에 있어서 찾기 어렵다.
//
// 두 번째로 잡는 것: **iOS 와 안드로이드의 표시 버전 일치.** build.gradle 주석이
// "같은 문자열이어야 한다"고 2026-08-08 부터 요구하고 있었는데 **아무도 검사하지
// 않았다.** 어긋나면 사용자 문의·크래시 리포트가 버전으로 묶일 때 두 스토어가 갈려
// "1.0 에서만 나는 버그"를 추적할 수 없다.
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const gradleProps = () => read('android/gradle.properties');
const buildGradle = () => read('android/app/build.gradle');
const pbxproj = () => read('ios/SoleMate.xcodeproj/project.pbxproj');

/** gradle.properties 의 `키=값` 하나를 읽는다(주석 줄 제외). */
function prop(key: string): string | null {
  for (const line of gradleProps().split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const at = t.indexOf('=');
    if (at > 0 && t.slice(0, at).trim() === key) return t.slice(at + 1).trim();
  }
  return null;
}

describe('안드로이드 versionCode', () => {
  it('저장소에 있다 — 개발자 홈 디렉터리가 아니라', () => {
    expect(prop('KEEGO_VERSION_CODE')).not.toBeNull();
  });

  it('정수이고, 이미 배포된 값보다 크다', () => {
    const v = Number(prop('KEEGO_VERSION_CODE'));
    expect(Number.isInteger(v)).toBe(true);
    // 23 = 2026-08-10 갤럭시에 설치된 값. Play 는 versionCode 를 영구히 기억하므로
    // 내리거나 재사용할 수 없다 — 이 하한은 **올리기만 한다.**
    expect(v).toBeGreaterThanOrEqual(23);
  });

  it('값이 없으면 조용히 1 로 떨어지지 않는다 — 빌드가 멈춘다', () => {
    const src = buildGradle();
    // 옛 형태: `(project.findProperty('KEEGO_VERSION_CODE') ?: '1')`
    expect(src).not.toMatch(/findProperty\('KEEGO_VERSION_CODE'\)\s*\?:/);
    expect(src).toMatch(/KEEGO_VERSION_CODE 가 없습니다/);
  });

  it('저장소 파일을 직접 읽는다 — 개발자 홈의 낡은 값이 이기지 못하게', () => {
    // Gradle 은 `~/.gradle/gradle.properties` 가 프로젝트 파일을 **이긴다.**
    // 그래서 findProperty 로 읽으면 홈에 남은 값이 조용히 덮는다 —
    // 2026-08-11 실측으로 실제 그러고 있었다(홈 14/1.0.0 이 저장소 23/1.0 을 이김).
    const src = buildGradle();
    expect(src).toMatch(/repoProps\.getProperty\('KEEGO_VERSION_CODE'\)/);
    expect(src).toMatch(/repoProps\.getProperty\('KEEGO_VERSION_NAME'\)/);
    // 명령줄 -P 만 예외 — startParameter.projectProperties 에는 명령줄 것만 들어 있다.
    expect(src).toMatch(/startParameter\.projectProperties/);
  });

  it('버전을 findProperty 로 읽는 코드가 남아 있지 않다', () => {
    // 한 군데라도 남으면 그 값만 홈 파일에 다시 지배당한다.
    expect(buildGradle()).not.toMatch(/findProperty\('KEEGO_VERSION_(CODE|NAME)'\)/);
  });
});

describe('두 스토어의 표시 버전이 같다', () => {
  it('안드로이드 versionName == iOS MARKETING_VERSION', () => {
    const android = prop('KEEGO_VERSION_NAME');
    const versions = [...pbxproj().matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m =>
      m[1].trim(),
    );
    expect(versions.length).toBeGreaterThan(0);
    // iOS 안에서도 타깃마다 갈리면 안 된다(앱·워치·위젯이 다른 버전으로 나갈 수 있다).
    expect([...new Set(versions)]).toHaveLength(1);
    expect(android).toBe(versions[0]);
  });
});

describe('iOS 빌드 번호는 모든 타깃이 같다', () => {
  it('CURRENT_PROJECT_VERSION 이 하나의 값이다', () => {
    // 하나라도 어긋나면 TestFlight 가 업로드를 거부한다 — 30분짜리 아카이브를 마치고
    // 마지막 단계에서야 알게 된다.
    const codes = [...pbxproj().matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(m =>
      m[1].trim(),
    );
    expect(codes.length).toBeGreaterThan(0);
    expect([...new Set(codes)]).toHaveLength(1);
  });

  it('정수다', () => {
    const one = /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(pbxproj())![1].trim();
    expect(Number.isInteger(Number(one))).toBe(true);
  });
});
