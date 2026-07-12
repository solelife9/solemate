/**
 * 시간 목표 관통(#15) 계약 — goalMin 이 러닝 화면에서 실제로 동작한다:
 *  1) 시간 목표(goalMin>0, goalKm=0) 달성 시(경과 ≥ 목표) 축하 토스트가 '분' 문구로 뜬다.
 *  2) 달성 전엔 토스트 없음(자유런 둔갑 재발 방지 가드).
 *  3) 거리 목표 달성 문구는 기존 그대로(km) — 회귀 없음.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunActiveScreen from '../RunActiveScreen.rn';

function render(el: React.ReactElement) {
  let r: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r!.root;
}
const allText = (root: any) =>
  root
    .findAll((n: any) => n.type === 'Text')
    .map((n: any) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children ?? '')))
    .join('|');

test('시간 목표 달성: "목표 30분 달성!" 토스트(분 문구)', () => {
  const root = render(
    <RunActiveScreen goalKm={0} goalMin={30} elapsedSec={30 * 60} distanceKm={4.8} timeLabel="30:00" />,
  );
  expect(allText(root)).toContain('목표 30분 달성!');
});

test('시간 목표 미달성: 축하 토스트 없음', () => {
  const root = render(
    <RunActiveScreen goalKm={0} goalMin={30} elapsedSec={12 * 60} distanceKm={2.0} timeLabel="12:00" />,
  );
  expect(allText(root)).not.toContain('달성!');
});

test('거리 목표 달성 문구는 기존 km 그대로(회귀 가드)', () => {
  const root = render(
    <RunActiveScreen goalKm={5} goalMin={0} elapsedSec={30 * 60} distanceKm={5.1} timeLabel="30:00" />,
  );
  expect(allText(root)).toContain('목표 5km 달성!');
});

test('시간 목표 러닝 중: 링 센터=시간·목표 N분, 지표 행=거리 km (스왑 확정 2026-07-12)', () => {
  const root = render(
    <RunActiveScreen goalKm={0} goalMin={30} elapsedSec={12 * 60} distanceKm={2.34} timeLabel="12:00" />,
  );
  const all = allText(root);
  expect(all).toContain('목표 30분'); // 링 보조 라벨
  expect(all).toContain('거리 km'); // 지표 행 첫 칸이 거리로 스왑
  expect(all).toContain('2.34');
});

test('거리 목표 러닝 중: 링 센터=거리 km, 지표 행=시간 (기존 유지 회귀 가드)', () => {
  const root = render(
    <RunActiveScreen goalKm={5} goalMin={0} elapsedSec={12 * 60} distanceKm={2.34} timeLabel="12:00" />,
  );
  const all = allText(root);
  expect(all).toContain('km');
  expect(all).toContain('시간');
  expect(all).not.toContain('거리 km');
});
