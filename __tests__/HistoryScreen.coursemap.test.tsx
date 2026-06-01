/**
 * 런 상세 코스맵(HistoryScreen RunDetail) 통합 테스트.
 *
 * 관찰 가능한 효과를 검증한다:
 *   1) route_<id> 좌표가 있는 런을 열면 svg <Polyline>이 projectRoute() 결과(빈
 *      문자열 아님)로 렌더된다 — 코스가 화면에 그려진다.
 *   2) route가 없는(또는 빈) 런은 폴리라인이 렌더되지 않는다(지도 graceful 숨김).
 *
 * SVG 프리미티브는 jest.setup.js에서 View로 목킹되지만 displayName('Polyline')은
 * 보존되므로 타입으로 조회한다. onLayout은 test-renderer에서 자동 발화하지 않아
 * 수동으로 폭을 주입한다(실기기에서는 카드 폭에 맞춰 측정됨).
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HistoryScreen from '../HistoryScreen.rn';
import {projectRoute} from '../lib/route';

const SHOE = {id: 's1', brand: 'NIKE', model: 'Pegasus 41', km: 0, max_km: 800, start_km: 0} as any;

const RUN = (id: string) =>
  ({
    id,
    date: '5월 28일',
    day: '수',
    dateNum: '28',
    dist: 5.2,
    pace: "5'02\"",
    time: '40:41',
    shoe: 0,
    cal: 0,
    cadence: 0,
    bpm: 0,
    elev: 0,
  } as any);

const ROUTE = [
  {lat: 37.5665, lon: 126.978},
  {lat: 37.5675, lon: 126.978},
  {lat: 37.5675, lon: 126.979},
  {lat: 37.5685, lon: 126.979},
];

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

async function openDetail(root: ReactTestRenderer.ReactTestInstance, needle: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n).includes(needle),
  );
  hits.sort((a, b) => textOf(a).length - textOf(b).length);
  await act(async () => {
    hits[0].props.onPress();
  });
  await flush();
}

function polylines(root: ReactTestRenderer.ReactTestInstance) {
  return root.findAll((n: any) => n && n.type && n.type.displayName === 'Polyline');
}

// Fire the course-map container's onLayout with a concrete width so the SVG,
// which is gated on a measured width, actually projects + renders.
function layoutMap(root: ReactTestRenderer.ReactTestInstance, width: number) {
  const layoutNodes = root.findAll((n: any) => n && n.props && typeof n.props.onLayout === 'function');
  act(() => {
    layoutNodes.forEach((n: any) => n.props.onLayout({nativeEvent: {layout: {width, height: 180}}}));
  });
}

describe('HistoryScreen course map', () => {
  test('a run WITH a stored route renders a polyline of the projected coordinates', async () => {
    await AsyncStorage.setItem('route_r1', JSON.stringify(ROUTE));

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HistoryScreen shoes={[SHOE]} runs={[RUN('r1')]} unit="km" />,
      );
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    layoutMap(root, 300);
    await flush();

    const lines = polylines(root);
    expect(lines.length).toBe(1);

    const expected = projectRoute(ROUTE, {width: 300, height: 180, padding: 16}).svgPoints;
    expect(expected).not.toBe('');
    expect(lines[0].props.points).toBe(expected);
    // four fixes → four "x,y" pairs drawn.
    expect(lines[0].props.points.split(' ')).toHaveLength(ROUTE.length);
  });

  test('a run WITHOUT a stored route renders no polyline (map hidden gracefully)', async () => {
    // no route_r2 written.
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <HistoryScreen shoes={[SHOE]} runs={[RUN('r2')]} unit="km" />,
      );
    });
    await flush();
    const root = renderer.root;

    await openDetail(root, 'Pegasus 41');
    layoutMap(root, 300);
    await flush();

    expect(polylines(root)).toHaveLength(0);
    // the run detail itself still renders (distance shown).
    expect(textOf(root)).toContain('Pegasus 41');
  });
});
