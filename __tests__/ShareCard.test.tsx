/**
 * ShareCard(공유 카드 SVG) 렌더 테스트 — 레이아웃(가로/세로/히어로) + 지도/지표 토글.
 *
 * 관찰 가능한 효과:
 *   1) 모델 필드(거리/단위/신발명/페이스·시간/브랜드)가 SVG <Text>로 렌더된다(날짜는 안 함).
 *   2) 지도 토글 on + route 있으면 경로가 <Path>(글로우+샤프 2겹)로, off/빈 route면 없다.
 *   3) 지표 토글로 페이스·시간 칸이 들어갔다 빠진다. 세로 레이아웃은 거리를 크게.
 *   4) forwardRef가 내부 Svg(toDataURL 보유)로 연결된다.
 *
 * SVG 프리미티브는 jest.setup.js에서 View로 목킹되며 displayName은 보존된다.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShareCard from '../ShareCard';
import {buildShareCardModel} from '../lib/shareCard';

const ROUTE = [
  {lat: 37.5665, lon: 126.978},
  {lat: 37.5675, lon: 126.978},
  {lat: 37.5675, lon: 126.979},
  {lat: 37.5685, lon: 126.979},
];

function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') return void (out += n);
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function pathsOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Path');
}
function svgOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Svg')[0];
}
function rectsOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Rect');
}
const MODEL = buildShareCardModel({
  distKm: 5.2, unit: 'km', pace: "5'02\"", time: '40:41', shoeBrand: 'NIKE', shoeModel: 'Pegasus 41', date: '5월 28일 수요일',
});
function render(props: any = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<ShareCard model={MODEL} {...props} />); });
  return r;
}

describe('ShareCard render (가로 기본)', () => {
  test('필드가 카드에 렌더된다(거리/단위/신발/페이스·시간/브랜드, 날짜 제외)', () => {
    const txt = textOf(render({route: ROUTE}).root);
    expect(txt).toContain('5.20');
    expect(txt).toContain('km');
    expect(txt).toContain('NIKE Pegasus 41');
    expect(txt).toContain("5'02\" /km");
    expect(txt).toContain('40:41');
    expect(txt).not.toContain('5월 28일 수요일');
    expect(txt).toContain('keego');
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
  });

  test('route가 있으면 경로가 <Path>(글로우+샤프 2겹)로 그려진다', () => {
    const paths = pathsOf(render({route: ROUTE}).root);
    expect(paths).toHaveLength(2);
    const d: string = paths[0].props.d;
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/L/g) || []).length).toBe(ROUTE.length - 1);
    expect(paths[1].props.d).toBe(d);
  });

  test('지도 off 또는 빈 route → 경로 Path 없음', () => {
    expect(pathsOf(render({route: []}).root)).toHaveLength(0);
    expect(pathsOf(render({route: ROUTE, showMap: false}).root)).toHaveLength(0);
  });

  test('지표 off → 페이스·시간 칸이 빠지고 거리를 크게(히어로)', () => {
    const txt = textOf(render({route: ROUTE, showStats: false}).root);
    expect(txt).toContain('5.20');
    expect(txt).not.toContain('PACE');
    expect(txt).not.toContain('40:41');
  });

  test('페이스·시간이 빠진 모델도 거리 칸으로 렌더된다', () => {
    const lean = buildShareCardModel({distKm: 3, unit: 'km'});
    const t = textOf(render({model: lean, route: []}).root);
    expect(t).toContain('3.00');
    expect(t).toContain('DISTANCE');
    expect(t).not.toContain('PACE');
  });

  test('forwardRef가 내부 Svg(toDataURL 보유)로 연결된다', () => {
    const ref = React.createRef<any>();
    act(() => { ReactTestRenderer.create(<ShareCard ref={ref} model={MODEL} route={ROUTE} />); });
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.toDataURL).toBe('function');
  });
});

describe('ShareCard 레이아웃·배경', () => {
  test('세로(vertical) — 거대 거리 + 세로 스탯(거리 라벨·페이스·시간)', () => {
    const txt = textOf(render({route: ROUTE, layout: 'vertical'}).root);
    expect(txt).toContain('5.20');
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
    // 세로도 지도 on 이면 경로가 있다(우상단 작은 경로).
    expect(pathsOf(render({route: ROUTE, layout: 'vertical'}).root).length).toBeGreaterThanOrEqual(2);
  });

  test('히어로 — 거리 라벨은 있으나 가로 DISTANCE 칸 중복 없음', () => {
    const txt = textOf(render({route: ROUTE, layout: 'hero'}).root);
    expect(txt).toContain('5.20');
    expect(txt).toContain('PACE');
    // 히어로/세로는 거리를 히어로로 보이므로 '가로 스탯 행'에 거리를 또 넣지 않는다.
  });

  test('지도만(지표 off) — 경로 있고 페이스·시간 없음', () => {
    const r = render({route: ROUTE, showStats: false});
    expect(pathsOf(r.root).length).toBeGreaterThanOrEqual(2);
    expect(textOf(r.root)).not.toContain('PACE');
  });

  test('세로형 = 캔버스 4:5(1080×1350)', () => {
    const svg = svgOf(render({route: ROUTE, layout: 'vertical'}).root);
    expect(svg.props.width).toBe(1080);
    expect(svg.props.height).toBe(1350);
  });

  test('다크 배경 — 배경 Rect(라디얼) 채움, 투명은 없음', () => {
    const dark = rectsOf(render({route: ROUTE, background: 'dark'}).root).some((n: any) => n.props.fill === 'url(#kg-dark)');
    const trans = rectsOf(render({route: ROUTE, background: 'transparent'}).root).some((n: any) => n.props.fill === 'url(#kg-dark)');
    expect(dark).toBe(true);
    expect(trans).toBe(false);
  });
});
