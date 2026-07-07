/**
 * 메달 자랑 카드 — 크래시 없이 대회명·기록·종목을 그린다. 프라이버시: BIB·이름 미포함.
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import MedalShareCard, {type MedalShareModel} from '../MedalShareCard';

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

const MODEL: MedalShareModel = {
  brand: 'keego',
  raceName: '2026 JTBC 서울마라톤',
  distanceLabel: '10K',
  officialTime: '55:42',
  date: '2026.11.01',
  paceLabel: "5'34\"/km",
};

test('메달 카드: 대회명·기록·종목·날짜 렌더', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<MedalShareCard model={MODEL} />); });
  const txt = textOf(r);
  expect(txt).toContain('2026 JTBC 서울마라톤');
  expect(txt).toContain('55:42');
  expect(txt).toContain('10K');
  expect(txt).toContain('2026.11.01');
  expect(txt.toLowerCase()).toContain('keego');
  expect(txt).toContain('RACE FINISHER');
});

test('사진 없으면 골드 디스크 + 종목(크래시 없음)', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<MedalShareCard model={{...MODEL, medalPhotoUri: undefined}} />); });
  expect(textOf(r)).toContain('10K');
});
