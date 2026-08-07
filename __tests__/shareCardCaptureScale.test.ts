// ============================================================================
// 공유 카드 캡처 배율 — 전수 스윕 (2026-08-07 감사)
//
// 무슨 일이 있었나
// ----------------------------------------------------------------------------
// react-native-svg 의 width/height 는 **dp** 다. 공유 카드들은 설계 px(1080 등)을
// 그대로 width 에 넘기고 있었고, 그러면 3배율 기기에서 **3240px** 짜리 이미지가 구워진다.
// 어느 플랫폼도 그 해상도로 표시하지 않는데 9배를 더 그린다 — 안드로이드 공유가 실측
// 3.6초 걸렸고, 그게 GPS 세션을 막 끝낸 직후의 JS 스레드에서 일어났다.
//
// 2026-08-06 에 세 파일(RecapShareCard·MedalShareCard·RunnerSpecShareCard)이 수정을
// 받았다. 그런데 **가장 많이 쓰이는 카드(러닝 리캡 → 공유 = ShareCard)와 은퇴
// 키프세이크 카드(RetirementCard)가 스윕에서 빠졌다.**
//
// 왜 파일별 테스트가 아니라 스윕인가
// ----------------------------------------------------------------------------
// 이 저장소의 반복되는 실패 형태가 **"결정은 옳은데 마지막 1마일이 안 닫힌다"** 이다
// (Card 프리미티브 소비처 0, TOUCH_TARGET 이 rs() 로 무효화, LEADING 도입 후 1곳만 사용,
// 그리고 이 CAPTURE_SCALE). 파일 하나씩 검사하면 **다음에 추가되는 카드가 또 빠진다.**
// 그래서 카드를 목록으로 세지 않고 **디렉터리에서 찾아** 전부 검사한다.
//
// 새 공유 카드를 만들면 이 테스트가 자동으로 그것도 검사한다. 빨개지면 규약을 따르거나,
// 정말 예외라면 EXEMPT 에 이유와 함께 적는다.
// ============================================================================
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

/**
 * 규약에서 면제되는 파일 — 이유를 반드시 적는다.
 * (지금은 없다. 비어 있는 게 정상이다.)
 */
const EXEMPT: Record<string, string> = {};

/** 저장소 루트에서 `*ShareCard.tsx` / `*Card.tsx` 중 SVG 공유 카드인 것을 찾는다. */
function findShareCards(): string[] {
  return fs
    .readdirSync(ROOT, {withFileTypes: true})
    .filter(e => e.isFile() && /Card\.tsx$/.test(e.name))
    .map(e => e.name)
    .filter(name => {
      const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
      // 캡처 대상 = react-native-svg 로 그리고, forwardRef 로 ref 를 노출하는 것
      // (lib/shareCard 의 captureCardDataUrl 이 그 ref 로 toDataURL 을 부른다).
      return src.includes("from 'react-native-svg'") && src.includes('forwardRef');
    });
}

const CARDS = findShareCards();

describe('공유 카드 캡처 배율 규약', () => {
  test('검사 대상 카드를 실제로 찾았다 (스윕이 조용히 0건이 되지 않게)', () => {
    // 이 단언이 없으면 파일 탐색이 깨졌을 때 아래 테스트들이 전부 '통과'해 버린다.
    expect(CARDS.length).toBeGreaterThanOrEqual(4);
  });

  test.each(CARDS)('%s — 설계 px 를 dp 로 넘기지 않는다', name => {
    if (EXEMPT[name]) return;
    const src = fs.readFileSync(path.join(ROOT, name), 'utf8');
    // 화면 배율을 실제로 읽는다.
    expect(src).toContain('PixelRatio.get()');
    // 그리고 그 값으로 나눈다(상수로 굽든 렌더 안에서 계산하든 형태는 자유).
    expect(src).toMatch(/\/\s*(CAPTURE_SCALE|captureScale)/);
  });

  test.each(CARDS)('%s — toDataURL 로 크기를 줄이지 않는다(안드로이드에선 잘라내기다)', name => {
    if (EXEMPT[name]) return;
    // **주석은 걷어내고 본다.** 이 규약을 설명하는 주석 자체가 `toDataURL(cb,{width})` 를
    // 인용하고 있어서, 원문 그대로 검사하면 규약을 지킨 파일이 오히려 빨개진다.
    const code = fs
      .readFileSync(path.join(ROOT, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*)/.test(l))
      .join('\n');
    expect(code).not.toMatch(/toDataURL\([^)]*\{[^}]*width/);
  });
});
