/**
 * ShareCard(공유 카드 SVG) 렌더 테스트 — 투명 오버레이(스트라바 방식) 디자인.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 카드 모델의 필드(거리/단위/신발명/페이스·시간/날짜/브랜드)가 SVG <Text>로 렌더된다.
 *   2) route가 있으면 코스 경로가 <Path>(projectRoute 재사용 — 글로우+샤프 2겹)로 그려지고,
 *      없으면 Path가 없다(graceful 숨김). START 마커도 함께 렌더된다.
 *   3) forwardRef로 넘긴 ref가 내부 Svg(=toDataURL 보유)로 연결된다 — 캡처 가능.
 *
 * SVG 프리미티브는 jest.setup.js에서 View로 목킹되며 displayName은 보존된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShareCard from '../ShareCard';
import {buildShareCardModel, runCardDimensions} from '../lib/shareCard';

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

function textNodesOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Text');
}

const MODEL = buildShareCardModel({
  distKm: 5.2,
  unit: 'km',
  pace: "5'02\"",
  time: '40:41',
  shoeBrand: 'NIKE',
  shoeModel: 'Pegasus 41',
  date: '5월 28일 수요일',
});

describe('ShareCard render', () => {
  test('거리/단위/신발명/페이스·시간/날짜/브랜드 필드가 카드에 렌더된다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={ROUTE} />);
    });
    const txt = textOf(renderer.root);
    expect(txt).toContain('5.20'); // 거리
    expect(txt).toContain('km'); // 단위
    expect(txt).toContain('NIKE Pegasus 41'); // 신발명
    expect(txt).toContain("5'02\" /km"); // 페이스(라벨 /km 고정)
    expect(txt).toContain('40:41'); // 시간
    expect(txt).not.toContain('5월 28일 수요일'); // 날짜는 카드에 표시하지 않음
    expect(txt).toContain('keego'); // 브랜드 워드마크(나눔명조 소문자, 2026-07-03 확정)
    expect(txt).toContain('START'); // 경로 시작 마커
    // 가로 스탯 라벨(영문 대문자).
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
  });

  test('스탯(라벨/값) 텍스트는 경로 밴드 아래에 그려진다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={ROUTE} />);
    });
    const statTexts = ['DISTANCE', 'PACE', 'TIME', "5'02\" /km", '40:41'];
    const statNodes = textNodesOf(renderer.root).filter(n => statTexts.includes(textOf(n)));
    expect(statNodes.length).toBeGreaterThanOrEqual(5);
    // 클래식(피드 1350) — 스탯은 하단(지도 밴드 아래)에 앵커된다(겹치지 않음).
    for (const node of statNodes) {
      const y: number = node.props.y;
      expect(typeof y).toBe('number');
      expect(y).toBeGreaterThan(1000);
    }
  });

  test('route가 있으면 코스 경로가 <Path>(글로우+샤프 2겹)로 그려진다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={ROUTE} />);
    });
    const paths = pathsOf(renderer.root);
    expect(paths).toHaveLength(2); // 은은한 글로우 + 샤프 라인
    const d: string = paths[0].props.d;
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/L/g) || []).length).toBe(ROUTE.length - 1); // 4 fix → M + 3 L
    expect(paths[1].props.d).toBe(d); // 두 겹은 같은 경로
  });

  test('route가 없으면 코스 Path가 렌더되지 않는다(graceful 숨김)', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={[]} />);
    });
    expect(pathsOf(renderer.root)).toHaveLength(0);
  });

  test('페이스·시간이 빠진 모델은 그 칸 없이도 카드가 렌더된다', () => {
    const lean = buildShareCardModel({distKm: 3, unit: 'km'});
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={lean} route={[]} />);
    });
    const txt = textOf(renderer.root);
    expect(txt).toContain('3.00');
    expect(txt).toContain('DISTANCE');
    expect(txt).not.toContain('PACE');
    expect(txt).not.toContain('TIME');
  });

  test('forwardRef가 내부 Svg(toDataURL 보유)로 연결되어 캡처 가능하다', () => {
    const ref = React.createRef<any>();
    act(() => {
      ReactTestRenderer.create(<ShareCard ref={ref} model={MODEL} route={ROUTE} />);
    });
    expect(ref.current).toBeTruthy();
    expect(typeof ref.current.toDataURL).toBe('function');
  });
});

function svgOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Svg')[0];
}
function rectsOf(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Rect');
}
function render(props: any) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<ShareCard model={MODEL} {...props} />); });
  return r;
}

describe('ShareCard 템플릿·포맷·배경', () => {
  test('미니멀 — 지도·스탯 없이 거대 거리만(경로 Path 없음, 스탯 라벨 없음)', () => {
    const r = render({route: ROUTE, template: 'minimal'});
    const txt = textOf(r.root);
    expect(txt).toContain('5.20');       // 거대 거리
    expect(txt).not.toContain('DISTANCE');
    expect(txt).not.toContain('PACE');
    expect(txt).not.toContain('START');  // 지도 없음
    expect(pathsOf(r.root)).toHaveLength(0);
  });

  test('지도(route 템플릿) — 지도만, 지표(PACE/TIME) 없음', () => {
    const r = render({route: ROUTE, template: 'route'});
    const txt = textOf(r.root);
    expect(pathsOf(r.root)).toHaveLength(2); // 지도 있음
    expect(txt).toContain('START');
    expect(txt).not.toContain('PACE');
    expect(txt).not.toContain('DISTANCE');
  });

  test('스탯 템플릿 — 지도 없이 D/P/T', () => {
    const r = render({route: ROUTE, template: 'stats'});
    const txt = textOf(r.root);
    expect(pathsOf(r.root)).toHaveLength(0); // 지도 off
    expect(txt).toContain('DISTANCE');
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
  });

  test('히어로 — 거대 거리 + 지도, 스탯 행은 거리 제외(중복 방지)', () => {
    const r = render({route: ROUTE, template: 'hero'});
    const txt = textOf(r.root);
    expect(txt).toContain('5.20');       // 히어로 거리
    expect(pathsOf(r.root)).toHaveLength(2); // 지도
    expect(txt).toContain('PACE');
    expect(txt).toContain('TIME');
    expect(txt).not.toContain('DISTANCE'); // 거리 라벨은 스탯 행에서 빠짐
  });

  test('세로형(story) — 캔버스 높이 9:16', () => {
    const r = render({route: ROUTE, format: 'story'});
    const svg = svgOf(r.root);
    expect(svg.props.height).toBe(runCardDimensions('story').h); // 1920
    expect(svg.props.width).toBe(1080);
  });

  test('다크 배경 — 배경 Rect(라디얼) 채움이 그려진다', () => {
    const dark = rectsOf(render({route: ROUTE, background: 'dark'}).root)
      .some((n: any) => n.props.fill === 'url(#kg-dark)');
    const transparent = rectsOf(render({route: ROUTE, background: 'transparent'}).root)
      .some((n: any) => n.props.fill === 'url(#kg-dark)');
    expect(dark).toBe(true);        // 다크 = 배경 채움 있음
    expect(transparent).toBe(false); // 투명 = 배경 없음
  });
});
