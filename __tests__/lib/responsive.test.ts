import {rf, leading} from '../../lib/responsive';


// ============================================================================
// 행간은 글자 배율을 따라가야 한다 (2026-08-07 감사)
//
// RN 은 `fontSize` 를 OS 글자 크기 배율로 곱해 그리지만 **`lineHeight` 는 곱하지 않는다.**
// 그래서 `fontSize: rf(33), lineHeight: rf(40)` 처럼 숫자를 나란히 적어 두면, 사용자가
// 글자 크기를 1.5× 로 키운 순간 **49.5pt 글자가 40pt 상자**에 들어가 위아래가 잘린다.
// 접근성 설정을 켠 사용자에게만, 하필 큰 글자에서 터진다.
//
// rf() 는 화면 **폭**만 반영한다(그건 그것대로 맞다). 글자 배율은 별개 축이라
// leading() 이 따로 곱한다.
// ============================================================================
describe('leading — 행간 계산', () => {
  const PixelRatio = require('react-native').PixelRatio;
  const orig = PixelRatio.getFontScale;
  afterEach(() => { PixelRatio.getFontScale = orig; });

  test('배율 1 이면 글자 크기 × 비율', () => {
    PixelRatio.getFontScale = () => 1;
    expect(leading(33, 1.22)).toBe(Math.round(rf(33) * 1.22));
  });

  test('배율이 커지면 행간도 같이 커진다 — 상자가 글자를 따라간다', () => {
    PixelRatio.getFontScale = () => 1;
    const at1 = leading(33, 1.22);
    PixelRatio.getFontScale = () => 1.5;
    const at15 = leading(33, 1.22);
    expect(at15).toBeGreaterThan(at1);
    // 글자가 1.5배가 되면 상자도 그만큼 — 잘리지 않는다.
    expect(at15 / at1).toBeCloseTo(1.5, 1);
  });

  test('상한을 넘겨 곱하지 않는다 — 실제로 안 커지는 글자에 상자만 벌어지면 안 된다', () => {
    PixelRatio.getFontScale = () => 3;
    const capped = leading(33, 1.22, 1.5);
    PixelRatio.getFontScale = () => 1.5;
    expect(capped).toBe(leading(33, 1.22, 1.5));
  });

  test('히어로 상한(1.2)을 따로 줄 수 있다', () => {
    PixelRatio.getFontScale = () => 2;
    expect(leading(33, 1.22, 1.2)).toBeLessThan(leading(33, 1.22, 1.5));
  });
});
