/**
 * 리캡 공유 카드 — 4:5(1080×1350) 통일 계약(심사 P2 #24) + 렌더 검증.
 *   1) 캔버스가 Medal/RunnerSpec 과 동일한 1080×1350.
 *   2) 실데이터: 기간·총거리·지표·PR·워드마크·해시태그 푸터 렌더.
 *   3) 빈 리캡: keep-going 카피만(수치/PR 없음), 크래시 없음.
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RecapShareCard, {CARD_W, CARD_H} from '../RecapShareCard';
import {CARD_W as MEDAL_W, CARD_H as MEDAL_H} from '../MedalShareCard';
import {RECAP_EMPTY_COPY, type RecapShareCardModel} from '../lib/shareCard';

function textOf(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) walk(n.children);
  };
  walk(node.toJSON());
  return out.join(' ');
}

const MODEL: RecapShareCardModel = {
  title: '주간 리캡',
  titleEn: 'WEEKLY RECAP',
  period: '6.8–6.14',
  distance: '20.0',
  unit: 'km',
  stats: [
    {label: 'RUNS', value: '3'},
    {label: 'AVG PACE', value: "5'30\" /km"},
    {label: 'TOP SHOE', value: 'Pegasus 41'},
  ],
  prs: [{label: '최장 거리', value: '10.00 km'}],
  isEmpty: false,
  emptyCopy: RECAP_EMPTY_COPY,
  brand: 'Keego',
  tagline: '오늘도 한 걸음 더 — keep going',
  hashtag: '#Keego #keepgoing',
};

function render(model: RecapShareCardModel) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<RecapShareCard model={model} />); });
  return r;
}

test('캔버스 4:5 통일 — Medal 카드와 동일한 1080×1350', () => {
  expect(CARD_W).toBe(1080);
  expect(CARD_H).toBe(1350);
  expect(CARD_W).toBe(MEDAL_W);
  expect(CARD_H).toBe(MEDAL_H);
  // 루트 Svg 가 실제로 그 크기로 그려진다.
  const r = render(MODEL);
  const svg = r.root.findAll(n => n.props?.width === CARD_W && n.props?.height === CARD_H);
  expect(svg.length).toBeGreaterThan(0);
});

test('실데이터: 기간·총거리·지표·PR·워드마크·해시태그 렌더', () => {
  const txt = textOf(render(MODEL));
  expect(txt).toContain('WEEKLY RECAP');
  expect(txt).toContain('6.8–6.14');
  expect(txt).toContain('20.0 km');
  expect(txt).toContain('RUNS');
  expect(txt).toContain("5'30\" /km");
  expect(txt).toContain('Pegasus 41');
  expect(txt).toContain('최장 거리 10.00 km');
  expect(txt).toContain('keego'); // 좌상 워드마크(소문자)
  expect(txt).toContain('#Keego #keepgoing'); // 하단 푸터
});

test('빈 리캡: keep-going 카피만, 수치/PR 없음(크래시 없음)', () => {
  const txt = textOf(render({...MODEL, isEmpty: true, stats: [], prs: []}));
  expect(txt).toContain(RECAP_EMPTY_COPY);
  expect(txt).not.toContain('DISTANCE');
  expect(txt).not.toContain('RUNS');
  expect(txt).not.toContain('최장 거리');
  expect(txt).toContain('#Keego #keepgoing'); // 푸터는 유지(하단 리듬)
});
