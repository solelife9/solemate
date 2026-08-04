/**
 * UX 감사(2026-08-04) 회귀 가드 — ②③⑤⑩⑭ 의 계약을 코드로 못 박는다.
 * (④ 는 감사 전제가 틀려 철회 — 아래 주석 참조.)
 *
 * 전부 "코드는 통과하는데 사용자에게만 어긋나던" 종류라, 테스트가 없으면 다음 리팩터에서
 * 조용히 되돌아간다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AddShoeScreen from '../AddShoeScreen.rn';
import OnboardingScreen from '../OnboardingScreen.rn';
import {T4, BG, CARD} from '../theme';
import {effectiveMaxKm, WEIGHT_DURABILITY_REF_KG} from '../lib/shoe';
import {LIFESPAN_BASIS_KO} from '../data/shoeModels';

const rendered: ReactTestRenderer.ReactTestRenderer[] = [];
function render(el: React.ReactElement): ReactTestRenderer.ReactTestRenderer {
  let r!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => { r = ReactTestRenderer.create(el); });
  rendered.push(r);
  return r;
}
afterEach(() => {
  ReactTestRenderer.act(() => { rendered.splice(0).forEach(r => r.unmount()); });
});

const textOf = (root: ReactTestRenderer.ReactTestInstance): string =>
  root.findAll(() => true)
    .flatMap((n: any) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children]))
    .filter((c: unknown) => typeof c === 'string' || typeof c === 'number')
    .join(' ');

const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n.props?.testID === id);

const byA11yLabel = (root: ReactTestRenderer.ReactTestInstance, label: string) =>
  root.findAll((n: any) => n.props?.accessibilityLabel === label && typeof n.props?.onPress === 'function');

// ── ② 몸무게 보정으로 수명 숫자가 화면마다 다르던 문제 ────────────────────────────
describe('② 등록 화면이 앱이 실제로 쓸 수명을 미리 밝힌다', () => {
  test('보정 계수는 lib/shoe 단일 소스이고 기준 몸무게에서는 1이다', () => {
    expect(effectiveMaxKm(650, WEIGHT_DURABILITY_REF_KG)).toBe(650);
    expect(effectiveMaxKm(650, 0)).toBe(650);          // 미설정 = 보정 없음
    expect(effectiveMaxKm(650, 80)).toBeLessThan(650); // 무거우면 짧게
  });

  test('몸무게가 기준과 다르면 등록 화면이 유효 수명을 예고한다', () => {
    const {root} = render(<AddShoeScreen weightKg={80} />);
    // 신발 미선택이면 수명(max)이 0이라 안내가 없다 — 약속할 숫자 자체가 없다.
    expect(byTestID(root, 'add-shoe-weight-note')).toHaveLength(0);
  });

  test('기준 몸무게(65kg)에서는 안내를 띄우지 않는다 — 다를 게 없다', () => {
    const {root} = render(<AddShoeScreen weightKg={WEIGHT_DURABILITY_REF_KG} />);
    expect(byTestID(root, 'add-shoe-weight-note')).toHaveLength(0);
  });

  test('⑩ 권장 수명의 출처를 밝힌다 — 브랜드 공표치인 척하지 않는다', () => {
    const {root} = render(<AddShoeScreen />);
    expect(textOf(root)).toContain(LIFESPAN_BASIS_KO);
  });
});

// ── ③ '온보딩 다시 보기'가 등록을 조용히 버리던 문제 ─────────────────────────────
describe('③ introOnly 재생은 등록 단계를 아예 보여주지 않는다', () => {
  test('introOnly 면 소개에서 끝난다 — 버려질 등록이 생기지 않는다', () => {
    const onDone = jest.fn();
    const {root} = render(<OnboardingScreen introOnly onDone={onDone} />);
    // Welcome → 소개
    ReactTestRenderer.act(() => { byA11yLabel(root, '시작하기')[0]?.props.onPress(); });
    // 소개의 CTA 는 '확인'(= 끝) 이고, 누르면 등록 단계가 아니라 onDone 으로 간다.
    const cta = byA11yLabel(root, '확인')[0];
    expect(cta).toBeTruthy();
    ReactTestRenderer.act(() => { cta.props.onPress(); });
    expect(onDone).toHaveBeenCalledWith(null);
    // 등록 단계의 진입점이 트리에 없다.
    expect(byTestID(root, 'onboarding-shoe-select')).toHaveLength(0);
  });

  test('일반 온보딩(introOnly 아님)은 등록 단계로 이어진다 — 첫 실행 동선 불변', () => {
    const onDone = jest.fn();
    const {root} = render(<OnboardingScreen onDone={onDone} />);
    ReactTestRenderer.act(() => { byA11yLabel(root, '시작하기')[0]?.props.onPress(); });
    ReactTestRenderer.act(() => { byA11yLabel(root, '다음')[0]?.props.onPress(); });
    expect(byTestID(root, 'onboarding-shoe-select').length).toBeGreaterThan(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  test('⑭ 소개·등록 단계에 뒤로가기가 있다 — 앞으로만 가던 사다리 해소', () => {
    const {root} = render(<OnboardingScreen onDone={jest.fn()} />);
    ReactTestRenderer.act(() => { byA11yLabel(root, '시작하기')[0]?.props.onPress(); });
    expect(byTestID(root, 'onboarding-back').length).toBeGreaterThan(0);
  });
});

// ── ④ 러닝 중 오조작 방어 — **철회됨(2026-08-04)** ────────────────────────────
// 감사 ④ 는 "러닝 내내 화면이 켜져 있어 주머니에서 일시정지가 눌린다"를 전제로 화면 잠금을
// 제안했다. **전제가 틀렸다**(민우님 교정):
//   · `activateKeepAwake` 는 OS **유휴 자동잠금만** 막는다 — 전원 버튼 잠금은 그대로 된다.
//   · 실제 동선은 화면을 끄고 달리는 것이고, 지표는 잠금화면 Live Activity 가 잇는다
//     (`lib/liveActivity` · RunEngine 이 러닝 시작에 start, ~2s 마다 update).
//   · OS 가 잠근 화면은 애초에 터치를 받지 않으므로 막을 오조작이 없다.
// 게다가 러닝 화면에 컨트롤을 더한 것 자체가 '러닝 중 화면 불가침(컨트롤은 일시정지뿐)'
// 규칙 위반이었다. 잠금 UI·keep-awake 연동·useHoldConfirm 추출 전부 되돌렸다.
// 이 자리에 테스트를 남기지 않는다 — 없는 기능의 테스트는 거짓 신호다.

// ── ⑤ T4 대비 — 정보성 텍스트에서 퇴출 ────────────────────────────────────────
describe('⑤ T4 는 정보를 담지 않는다', () => {
  test('T4 는 BG·CARD 위에서 WCAG AA(4.5:1)·UI 최소치(3:1) 둘 다 미달이다', () => {
    // 이 사실이 토큰 주석의 근거다 — 값이 바뀌면 이 테스트가 먼저 깨져 재판단을 강제한다.
    expect(contrast(T4, BG)).toBeLessThan(3);
    expect(contrast(T4, CARD)).toBeLessThan(3);
  });
});

/** WCAG 상대 휘도 대비비. #rrggbb 만 받는다(토큰은 전부 이 형식). */
function contrast(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const v = hex.replace('#', '');
    const ch = [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
