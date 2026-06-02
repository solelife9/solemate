/**
 * ShareCard(공유 카드 SVG) 렌더 테스트.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) 카드 모델의 필드(거리/단위/신발명/페이스·시간/날짜/브랜드)가 SVG <Text>로
 *      실제 렌더된다 — 필드 매핑이 화면(이미지)에 반영됨.
 *   2) route가 있으면 코스 경로가 <Path>(projectRoute 재사용)로 그려지고, 없으면
 *      Path가 없다(미니맵 graceful 숨김). CourseMap의 <Polyline>과 충돌하지 않도록
 *      카드는 일부러 Path로 그린다.
 *   3) forwardRef로 넘긴 ref가 내부 Svg(=toDataURL 보유)로 연결된다 — 캡처 가능.
 *
 * SVG 프리미티브는 jest.setup.js에서 View로 목킹되며 displayName은 보존된다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShareCard, {MAP_Y, MAP_H} from '../ShareCard';
import {buildShareCardModel} from '../lib/shareCard';
import {projectRoute} from '../lib/route';

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

// SVG <Text> 노드 전부(displayName 'Text'). 통계 텍스트의 y좌표 검사용.
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
    expect(txt).toContain('Keego'); // 브랜드 워드마크
    expect(txt).toContain('#Keego #keepgoing'); // 해시태그
  });

  test('통계(페이스/시간) 텍스트는 미니맵 밴드 밖(위)에 그려진다 — 불투명 맵 배경에 가려지지 않음', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={ROUTE} />);
    });
    // 통계 라벨/값 텍스트만 추려 각 노드의 y좌표가 맵 밴드[MAP_Y, MAP_Y+MAP_H] 밖인지 본다.
    // 맵 배경 Rect는 문서 순서상 통계 뒤에 그려지므로, 밴드 안에 있으면 SVG 페인트 순서로
    // 통계가 덮여 공유 이미지에서 사라진다(차단 결함 회귀 가드).
    const statTexts = ['평균 페이스', "5'02\" /km", '시간', '40:41'];
    const statNodes = textNodesOf(renderer.root).filter(n =>
      statTexts.includes(textOf(n)),
    );
    // 페이스·시간 각각 라벨+값 = 4개 노드가 실제로 존재해야 한다(필드가 빠지지 않음).
    expect(statNodes).toHaveLength(4);
    for (const node of statNodes) {
      const y: number = node.props.y;
      expect(typeof y).toBe('number');
      const insideBand = y >= MAP_Y && y <= MAP_Y + MAP_H;
      expect(insideBand).toBe(false);
      // 위쪽에 있어야 한다(아래로 넘치면 카드 밖). 여백도 확인.
      expect(y).toBeLessThan(MAP_Y);
    }
  });

  test('route가 있으면 코스 경로가 단일 <Path>로 그려진다(projectRoute 재사용)', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<ShareCard model={MODEL} route={ROUTE} />);
    });
    const paths = pathsOf(renderer.root);
    expect(paths).toHaveLength(1);
    const d: string = paths[0].props.d;
    // 첫 점은 M, 이후 L로 4개 좌표가 이어진다(projectRoute가 4 fix를 모두 투영).
    expect(d.startsWith('M')).toBe(true);
    const proj = projectRoute(ROUTE, {width: 904, height: 300, padding: 28});
    expect(proj.points).toHaveLength(ROUTE.length);
    expect((d.match(/L/g) || []).length).toBe(ROUTE.length - 1);
  });

  test('route가 없으면 코스 Path가 렌더되지 않는다(미니맵 graceful 숨김)', () => {
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
    expect(txt).not.toContain('평균 페이스');
    expect(txt).not.toContain('👟'); // 신발 없음
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
