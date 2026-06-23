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
import ShareCard, {ROUTE_BAND_BOTTOM} from '../ShareCard';
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
    expect(txt).toContain('5월 28일 수요일'); // 날짜
    expect(txt).toContain('KEEGO'); // 브랜드 워드마크(대문자)
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
    for (const node of statNodes) {
      const y: number = node.props.y;
      expect(typeof y).toBe('number');
      expect(y).toBeGreaterThan(ROUTE_BAND_BOTTOM); // 경로 밴드 아래(겹치지 않음)
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
