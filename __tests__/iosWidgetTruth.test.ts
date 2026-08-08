/**
 * iOS 홈 위젯 — **없는 신발을 지어내지 않는다.**
 *
 * 2026-08-08 감사: 위젯이 모든 사용자에게 "Nike Pegasus 41 · 118/650km" 를 진짜인 것처럼
 * 띄우고 있었다. 원인이 둘 겹쳐 있었다.
 *   ① 위젯 타깃(RunActivityExtension)에 **엔타이틀먼트가 아예 없어서** App Group 이 안 열렸다
 *      → 앱이 아무리 써 넣어도 위젯은 한 글자도 못 읽는다 → 100% 폴백
 *   ② 그 폴백이 하필 **샘플 신발**이었다 → 남의 신발이 내 홈 화면에 뜬다
 * MISSION.md 의 Truth only 정면 위반이고, 안드로이드 위젯은 같은 상황에서
 * "러닝화를 등록해 주세요"를 띄운다("지어내지 않는다" — ShoeWidgetProvider.kt).
 *
 * **왜 소스를 문자열로 검사하나.** Swift/Kotlin 은 jest 가 실행할 수 없다. 그런데 이
 * 버그는 실행해 봐야 보이는 종류가 아니라 **배선이 빠진** 종류라(App Group 미등록·
 * 폴백 선택) 소스 레벨로 충분히 못 박을 수 있다. 이 저장소가 반복해 겪은
 * "만들었는데 배선이 안 된" 사고와 같은 계열이라 같은 방식으로 막는다.
 * @format
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const WIDGET = 'ios/RunActivity/RunActivityBundle.swift';
const WIDGET_ENT = 'ios/RunActivity/RunActivity.entitlements';
const APP_ENT = 'ios/SoleMate/SoleMate.entitlements';
const PBXPROJ = 'ios/SoleMate.xcodeproj/project.pbxproj';
const APP_GROUP = 'group.com.keego.app';

describe('iOS 위젯 — 데이터가 없으면 빈 상태를 그린다', () => {
  const src = read(WIDGET);

  test('load() 는 옵셔널이다 — 못 읽으면 nil 이지 샘플이 아니다', () => {
    expect(src).toMatch(/static func load\(\) -> KeegoShoe\?/);
    // 예전 시그니처가 남아 있으면 폴백이 되살아난 것이다.
    expect(src).not.toMatch(/static func load\(\) -> KeegoShoe\s*\{/);
  });

  test('load() 안에서 샘플로 폴백하지 않는다', () => {
    const body = src.slice(src.indexOf('static func load()'));
    const end = body.indexOf('\n    }');
    expect(body.slice(0, end)).not.toContain('.sample');
  });

  test('타임라인·스냅샷은 실제 데이터만 쓴다(샘플은 갤러리 placeholder 전용)', () => {
    // .sample 이 등장해도 되는 곳은 placeholder 한 줄뿐이다.
    const lines = src.split('\n').filter(l => l.includes('.sample') && !l.trim().startsWith('//')
      && !l.trim().startsWith('///') && !l.includes('static let sample'));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('placeholder(in context');
  });

  test('빈 상태 문구가 안드로이드 위젯과 같다', () => {
    const ko = '러닝화를 등록해 주세요';
    expect(src).toContain(ko);
    expect(read('android/app/src/main/java/com/keego/app/ShoeWidgetProvider.kt')).toContain(ko);
  });

  test('갤러리 샘플이 실재하는 브랜드/모델을 주장하지 않는다', () => {
    const m = src.match(/static let sample = KeegoShoe\((.*)\)/);
    expect(m).not.toBeNull();
    expect(m![1]).toContain('brand: ""');
    expect(m![1]).not.toMatch(/Nike|Pegasus|Adidas|Hoka|Asics/i);
  });
});

// ── 배선 ─────────────────────────────────────────────────────────────────────
// 위 폴백을 고쳐도 App Group 이 안 열리면 위젯은 **영원히 빈 상태**다. 정직하지만
// 쓸모는 없다. 그래서 배선 자체를 검사한다.
describe('iOS 위젯 — App Group 배선', () => {
  test('위젯 타깃 엔타이틀먼트 파일이 있고 App Group 이 들어 있다', () => {
    expect(fs.existsSync(path.join(ROOT, WIDGET_ENT))).toBe(true);
    expect(read(WIDGET_ENT)).toContain(APP_GROUP);
  });

  test('앱과 위젯이 **같은** App Group 을 쓴다 — 한 글자만 달라도 조용히 안 보인다', () => {
    expect(read(APP_ENT)).toContain(APP_GROUP);
    expect(read(WIDGET)).toContain(`appGroup = "${APP_GROUP}"`);
  });

  test('위젯 타깃이 그 엔타이틀먼트를 실제로 참조한다(빌드 설정)', () => {
    // 파일만 만들어 두고 CODE_SIGN_ENTITLEMENTS 를 안 걸면 아무 효과가 없다 —
    // 이게 정확히 이번 버그의 모양이었다(파일조차 없었지만).
    const pbx = read(PBXPROJ);
    const refs = pbx.match(/CODE_SIGN_ENTITLEMENTS = [^;]+;/g) ?? [];
    const widgetRefs = refs.filter(r => r.includes('RunActivity/RunActivity.entitlements'));
    // Debug · Release 두 구성 모두에 걸려 있어야 한다.
    expect(widgetRefs.length).toBeGreaterThanOrEqual(2);
  });

  test('앱 쪽 writer 와 위젯 쪽 reader 의 키가 일치한다', () => {
    const writer = read('ios/SoleMate/WatchSessionModule.swift');
    const widget = read(WIDGET);
    for (const key of [
      'widget_shoe_name', 'widget_shoe_brand', 'widget_shoe_category',
      'widget_shoe_used_km', 'widget_shoe_max_km',
    ]) {
      expect(writer).toContain(key);
      expect(widget).toContain(key);
    }
  });
});
