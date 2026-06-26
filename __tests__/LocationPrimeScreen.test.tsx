/**
 * LocationPrimeScreen — 위치 권한 설명(priming) 화면(P0-5).
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import LocationPrimeScreen from '../LocationPrimeScreen.rn';

function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function press(root: ReactTestRenderer.ReactTestInstance, testID: string) {
  const hit = root.findAll((n: any) => n?.props?.testID === testID && typeof n.props.onPress === 'function')[0];
  act(() => { hit.props.onPress(); });
}

describe('LocationPrimeScreen — 위치 권한 설명', () => {
  test("핵심 가이드(‘앱 사용 중에 허용’)와 프라이버시 안내를 보여준다", () => {
    const root = render(<LocationPrimeScreen />).root;
    const t = textOf(root);
    expect(t).toContain('앱 사용 중에 허용');
    expect(t).toContain('주머니');          // 화면 꺼/주머니에 넣어도
    expect(t).toContain('기기에 저장');      // 프라이버시
  });

  test("'계속' 탭 → onContinue", () => {
    const onContinue = jest.fn();
    const root = render(<LocationPrimeScreen onContinue={onContinue} />).root;
    press(root, 'location-prime-continue');
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  test("'나중에' 탭 → onCancel", () => {
    const onCancel = jest.fn();
    const root = render(<LocationPrimeScreen onCancel={onCancel} />).root;
    press(root, 'location-prime-cancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
