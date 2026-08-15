/**
 * 앱 아이콘 플랫폼 정합 테스트.
 *
 * 왜 필요한가(2026-08-15 출시 서류 점검에서 발견):
 *   2026-07-18 `78a8db6` "앱 아이콘 확정 — 파파야 단색 수명 링 아크" 스윕이 **iOS 만**
 *   갈아끼웠다. 안드로이드는 2026-06-18 의 **K 모노그램**을 그대로 들고 있었고, 그 색
 *   `#FF6500` 은 2026-07-09 에 폐기된 구 오렌지(Strava 색 충돌로 Keego Ember `#FF8000`
 *   으로 교체된 그 색)였다. **폐기된 마크 + 폐기된 색**을 달고 동시 출시로 나갈 뻔했다.
 *
 * 4주 동안 아무도 못 본 이유는 단순하다 — 아이콘은 **바이너리와 XML** 이라
 * 3,869개 테스트가 한 줄도 보지 않는 영역이었다.
 *
 * 이 테스트가 막는 것:
 *   1. 폐기된 색(#FF6500)이나 폐기된 K 모노그램이 되살아나는 것
 *   2. iOS 만 고치고 안드로이드를 빠뜨리는 것(= 이번에 일어난 일)
 *
 * 기하 자체(획폭 비·빈 구간 각도)는 `scripts/gen-icon.js` 주석에 실측값이 적혀 있고,
 * 여기서는 **정합**만 본다. 파일을 텍스트로 읽으므로 빌드가 필요 없다.
 *
 * @format
 */
import {readFileSync} from 'fs';
import {join} from 'path';

const ROOT = join(__dirname, '..');
const ANDROID_FG = join(ROOT, 'android/app/src/main/res/drawable/ic_launcher_foreground.xml');
const ANDROID_BG = join(ROOT, 'android/app/src/main/res/values/colors.xml');
const ADAPTIVE = join(ROOT, 'android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml');
const GEN_SCRIPT = join(ROOT, 'scripts/gen-icon.js');

/** 브랜드 정본 (DESIGN.md §1 · BRAND.md §4). */
const EMBER = '#FF8000';
/** 2026-07-09 폐기 — Strava 색과 겹쳐 교체됐다. 되살아나면 안 된다. */
const RETIRED_ORANGE = '#FF6500';
const BG_DARK = '#0A0A0A';

const read = (p: string) => readFileSync(p, 'utf8');
/** 주석을 걷어낸 본문만 — 주석에 적힌 '폐기된 색' 설명이 검사에 걸리지 않게. */
const codeOnly = (xml: string) => xml.replace(/<!--[\s\S]*?-->/g, '');
const stripJsComments = (js: string) =>
  js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('앱 아이콘 — 플랫폼 정합', () => {
  it('안드로이드 전경이 Keego Ember 를 쓴다', () => {
    const body = codeOnly(read(ANDROID_FG));
    expect(body.toUpperCase()).toContain(EMBER);
  });

  it('폐기된 오렌지(#FF6500)가 되살아나지 않는다', () => {
    for (const f of [ANDROID_FG, ANDROID_BG, ADAPTIVE]) {
      expect(codeOnly(read(f)).toUpperCase()).not.toContain(RETIRED_ORANGE);
    }
    expect(stripJsComments(read(GEN_SCRIPT)).toUpperCase()).not.toContain(RETIRED_ORANGE);
  });

  it('안드로이드 배경이 브랜드 다크다', () => {
    expect(codeOnly(read(ANDROID_BG)).toUpperCase()).toContain(BG_DARK);
  });

  it('전경이 K 모노그램(직선 3획)이 아니라 링 아크다', () => {
    const body = codeOnly(read(ANDROID_FG));
    // 아크 명령(A/a)이 있어야 링이다. K 는 직선(L)만으로 그려져 있었다.
    expect(body).toMatch(/pathData="[^"]*[Aa]\d/);
    // K 시절의 세 획이 그대로 남아 있으면 실패시킨다.
    const strokeCount = (body.match(/<path/g) ?? []).length;
    expect(strokeCount).toBe(1);
  });

  it('생성 스크립트가 iOS 마스터를 정본으로 가리킨다', () => {
    // 스크립트가 다시 안드로이드 단독 디자인으로 되돌아가지 않게 한다.
    expect(read(GEN_SCRIPT)).toContain('AppIcon.appiconset/icon-1024.png');
  });

  it('어댑티브 아이콘이 전경·배경·모노크롬을 모두 선언한다', () => {
    const body = codeOnly(read(ADAPTIVE));
    expect(body).toContain('ic_launcher_background');
    expect(body).toContain('ic_launcher_foreground');
    expect(body).toContain('monochrome');
  });
});
