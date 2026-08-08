/**
 * 안드로이드 시작 화면 — **다크 앱에 흰 번쩍임이 없다.**
 *
 * 2026-08-09: 앱을 켜면 프로세스가 뜨고 RN 이 첫 프레임을 그릴 때까지 빈 창이 뜨는데,
 * 그 창을 무엇으로 칠할지 정해 두지 않아 **밝은 기본 배경**이 보였다. E2E 스크린샷에
 * 흰 화면이 그대로 찍혔다(그때는 '로딩 중'으로 넘겼는데 이게 원인이었다).
 * 다크 앱에서 흰 번쩍임은 첫인상을 정면으로 깎는다.
 *
 * 새 의존성 없이 고쳤다 — API 26~30 은 windowBackground, 31+ 는 OS 스플래시 속성.
 * (androidx.core:core-splashscreen 을 안 써 네이티브 사전 승인제를 건드리지 않는다.)
 *
 * 실기기 확인(갤럭시 S10e, 빌드 21): 첫 프레임 중앙 픽셀 **#0A0A0A** — 브랜드 배경색과 일치.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RES = 'android/app/src/main/res';

describe('색이 갈리지 않는다', () => {
  test('keego_bg 가 theme.ts 의 BG 와 같다 — 다르면 켤 때 두 번 칠하는 느낌이 난다', () => {
    const xml = read(`${RES}/values/colors.xml`);
    const m = /<color name="keego_bg">(#[0-9A-Fa-f]{6})<\/color>/.exec(xml);
    expect(m).not.toBeNull();
    const theme = read('theme.ts');
    const t = /export const BG\s*=\s*'(#[0-9A-Fa-f]{6})'/.exec(theme);
    expect(t).not.toBeNull();
    expect(m![1].toUpperCase()).toBe(t![1].toUpperCase());
  });

  test('런처 아이콘 배경도 같은 색이다', () => {
    const xml = read(`${RES}/values/colors.xml`);
    expect(/<color name="ic_launcher_background">#0A0A0A</i.test(xml)).toBe(true);
  });
});

describe('두 갈래를 모두 덮는다 — minSdk 26', () => {
  test('API 26~30: windowBackground 로 칠한다', () => {
    const styles = read(`${RES}/values/styles.xml`);
    expect(styles).toContain('name="SplashTheme"');
    // 블록을 잘라 그 안에서 찾는다 — 속성 순서에 기대는 정규식은 깨지기 쉽다.
    const block = styles.slice(styles.indexOf('name="SplashTheme"'));
    expect(block.slice(0, 600)).toContain('android:windowBackground">@drawable/splash_background');
    expect(fs.existsSync(path.join(ROOT, RES, 'drawable/splash_background.xml'))).toBe(true);
  });

  test('API 31+: OS 가 그리므로 색·아이콘을 넘겨준다', () => {
    // 이 파일이 없으면 OS 기본(밝은 배경)이 떠서 흰 번쩍임이 그대로 남는다 —
    // values/ 의 windowBackground 는 31+ 에서 무시된다.
    const v31 = read(`${RES}/values-v31/styles.xml`);
    expect(v31).toContain('windowSplashScreenBackground');
    expect(v31).toContain('@color/keego_bg');
    expect(v31).toContain('windowSplashScreenAnimatedIcon');
  });

  test('앱 테마 자체의 창 배경도 어둡다 — 스플래시 이후 구간을 덮는다', () => {
    const styles = read(`${RES}/values/styles.xml`);
    const block = styles.slice(styles.indexOf('name="AppTheme"'), styles.indexOf('name="SplashTheme"'));
    expect(block).toContain('android:windowBackground">@color/keego_bg');
  });
});

describe('★ 배선 — 안 걸면 아무 일도 안 일어나고, 안 풀면 앱 내내 남는다', () => {
  test('매니페스트가 MainActivity 에 SplashTheme 을 건다', () => {
    const mf = read('android/app/src/main/AndroidManifest.xml');
    const act = mf.slice(mf.indexOf('android:name=".MainActivity"'));
    expect(act.slice(0, 500)).toContain('@style/SplashTheme');
  });

  test('MainActivity 가 super 보다 먼저 AppTheme 으로 갈아탄다', () => {
    // 안 갈아타면 스플래시 배경(아이콘 얹은 그림)이 앱이 도는 내내 창 배경으로 남는다.
    // super 뒤로 밀면 첫 프레임이 이미 그려진 뒤라 적용이 늦거나 번쩍인다.
    const src = read('android/app/src/main/java/com/keego/app/MainActivity.kt');
    const i = src.indexOf('setTheme(R.style.AppTheme)');
    const j = src.indexOf('super.onCreate');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(-1);
    expect(i).toBeLessThan(j);
  });
});
