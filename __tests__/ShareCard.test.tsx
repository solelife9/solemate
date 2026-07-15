/**
 * ShareCard(공유 카드 SVG) 렌더 — 컴팩트 스티커, 레이아웃(세로/가로/6지표) + 지도/지표 토글.
 *   1) 모델 필드가 SVG <Text>로 렌더(그림자 복사본 포함이라 2배로 나타남).
 *   2) 지도 on + route → 경로 <Path> 2겹, off/빈 route → 없음.
 *   3) 지표 토글·6지표 반영. 4) forwardRef → 내부 Svg(toDataURL).
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShareCard from '../ShareCard';
import {buildShareCardModel} from '../lib/shareCard';

const ROUTE = [
  {lat: 37.5665, lon: 126.978}, {lat: 37.5675, lon: 126.978},
  {lat: 37.5675, lon: 126.979}, {lat: 37.5685, lon: 126.979},
];
function textOf(node: any): string {
  let out = '';
  const walk = (n: any) => { if (typeof n === 'string') return void (out += n); if (!n || !n.children) return; n.children.forEach(walk); };
  walk(node); return out;
}
function pathsOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Path');
}
function rectsOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Rect');
}
const MODEL = buildShareCardModel({distKm: 5.2, unit: 'km', pace: "5'02\"", time: '40:41', calories: 234, bpm: 161, cadence: 172, elevM: 24});
function render(props: any = {}) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<ShareCard model={MODEL} {...props} />); });
  return r;
}

describe('ShareCard render (세로 기본)', () => {
  test('거리/페이스/시간/브랜드 렌더(6지표 추가지표는 세로에선 제외)', () => {
    const txt = textOf(render({route: ROUTE}).root);
    expect(txt).toContain('5.20');
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
    expect(txt).toContain('keego');
    expect(txt).not.toContain('CADENCE'); // 6지표 전용
  });

  test('route + 지도 on → 경로 Path 2겹, off/빈 route → 없음', () => {
    expect(pathsOf(render({route: ROUTE}).root)).toHaveLength(2);
    expect(pathsOf(render({route: []}).root)).toHaveLength(0);
    expect(pathsOf(render({route: ROUTE, showMap: false}).root)).toHaveLength(0);
  });

  test('지표 off → 페이스·시간 빠짐(거리만)', () => {
    const txt = textOf(render({route: ROUTE, showStats: false}).root);
    expect(txt).toContain('5.20');
    expect(txt).not.toContain('PACE');
  });

  test('forwardRef → 내부 Svg(toDataURL)', () => {
    const ref = React.createRef<any>();
    act(() => { ReactTestRenderer.create(<ShareCard ref={ref} model={MODEL} route={ROUTE} />); });
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.toDataURL).toBe('function');
  });
});

describe('ShareCard 레이아웃·배경', () => {
  test('6지표 = 거리·페이스·시간·칼로리·케이던스·심박(최대 6)', () => {
    const txt = textOf(render({route: ROUTE, layout: 'grid'}).root);
    ['DISTANCE', 'PACE', 'TIME', 'CALORIES', 'CADENCE', 'HR'].forEach(l => expect(txt).toContain(l));
  });

  test('가로형도 거리·페이스·시간', () => {
    const txt = textOf(render({route: ROUTE, layout: 'classic'}).root);
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
  });

  test('다크 배경 = 배경 Rect(라디얼), 투명 = 없음', () => {
    const dark = rectsOf(render({route: ROUTE, background: 'dark'}).root).some((n: any) => n.props.fill === 'url(#kg-dark)');
    const trans = rectsOf(render({route: ROUTE, background: 'transparent'}).root).some((n: any) => n.props.fill === 'url(#kg-dark)');
    expect(dark).toBe(true);
    expect(trans).toBe(false);
  });
});
