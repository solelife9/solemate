/**
 * RunRecapScreen — 완주 리캡(축하) 풀스크린(P0-2) 렌더/인터랙션.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunRecapScreen from '../RunRecapScreen.rn';

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
function byTestID(root: ReactTestRenderer.ReactTestInstance, prefix: string) {
  // host 노드만(typeof type === 'string') — RN 컴포넌트는 composite+host 양쪽에 testID 를
  // 전달해 findAll 이 중복 매칭하므로 호스트 인스턴스만 센다.
  return root.findAll((n: any) => typeof n.type === 'string' && n?.props?.testID && String(n.props.testID).startsWith(prefix));
}

describe('RunRecapScreen — 완주 리캡', () => {
  test('거리/시간/평균 페이스를 보여준다', () => {
    const root = render(<RunRecapScreen km={5.12} durationS={1856} />).root;
    expect(byTestID(root, 'recap-distance').length).toBe(1);
    const t = textOf(root);
    expect(t).toContain('5.12');     // 거리
    expect(t).toContain('30:56');    // 시간 1856s
    expect(t).toContain('러닝 완료');
  });

  test('스피드 모드: pacePlan + 스플릿이 있으면 목표 대비 결과 섹션을 보여준다', () => {
    const splits = [
      {km: 1, paceSec: 372, elevM: 0}, // 목표 375 → 3초 빠름
      {km: 2, paceSec: 360, elevM: 0}, // 목표 360 → 근접
    ];
    const root = render(<RunRecapScreen km={2} durationS={732} splits={splits} pacePlan={[375, 360]} />).root;
    expect(byTestID(root, 'recap-pace-plan').length).toBe(1);
    const t = textOf(root);
    expect(t).toContain('페이스 플랜 결과');
    expect(t).toContain('목표');
  });

  test('신발 마모 델타(shoeWear)가 있으면 신발 카드를 보여준다', () => {
    const root = render(<RunRecapScreen km={5.2} durationS={1800} shoeName="페가수스 41"
      shoeWear={{addedKm: 5.2, remainingPct: 64, deltaPct: 0.9}} />).root;
    expect(byTestID(root, 'recap-shoe-wear').length).toBe(1);
    const t = textOf(root);
    expect(t).toContain('페가수스 41');
    expect(t).toContain('64%');     // 남은 내구도
    expect(t).toContain('0.9%p');   // 델타
  });

  test('shoeWear 가 없으면 신발 카드를 숨긴다', () => {
    const root = render(<RunRecapScreen km={5} durationS={1800} shoeName="페가수스 41" />).root;
    expect(byTestID(root, 'recap-shoe-wear').length).toBe(0);
  });

  test('pacePlan 이 없으면 플랜 결과 섹션을 숨긴다', () => {
    const splits = [{km: 1, paceSec: 372, elevM: 0}, {km: 2, paceSec: 360, elevM: 0}];
    const root = render(<RunRecapScreen km={2} durationS={732} splits={splits} />).root;
    expect(byTestID(root, 'recap-pace-plan').length).toBe(0);
  });

  test('신기록(PR) 종류마다 축하 배지가 뜬다', () => {
    const root = render(<RunRecapScreen km={10} durationS={3000} prKinds={['longestDist', 'fastestPace']} />).root;
    expect(byTestID(root, 'recap-pr-longestDist').length).toBe(1);
    expect(byTestID(root, 'recap-pr-fastestPace').length).toBe(1);
    expect(textOf(root)).toContain('신기록');
  });

  test('목표 거리를 채우면 목표 달성 배지가 뜬다', () => {
    const root = render(<RunRecapScreen km={5.2} durationS={1800} goalKm={5} />).root;
    expect(textOf(root)).toContain('목표 5km 달성');
  });

  test('목표 미달이면 달성 배지 없음', () => {
    const root = render(<RunRecapScreen km={3} durationS={1200} goalKm={5} />).root;
    expect(textOf(root)).not.toContain('달성');
  });

  test("'완료' 탭 → onClose 호출", () => {
    const onClose = jest.fn();
    const root = render(<RunRecapScreen km={5} durationS={1800} onClose={onClose} />).root;
    const done = root.findAll((n: any) => n?.props?.testID === 'recap-done' && typeof n.props.onPress === 'function')[0];
    act(() => { done.props.onPress(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('스플릿 2구간 미만이면 스플릿 섹션 숨김', () => {
    const root = render(<RunRecapScreen km={5} durationS={1800} splits={[{km: 1, paceSec: 360, elevM: 0}]} />).root;
    // RunSplits 는 splits.length<2 면 null — '구간' 헤더가 없어야 한다.
    expect(textOf(root)).not.toContain('구간');
  });
});
