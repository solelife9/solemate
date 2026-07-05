// 러너 스펙 공유 카드 렌더 검증 — 크래시 없이 스펙 데이터(이름·VO2max·훈장·페이스)를 그린다.
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import RunnerSpecShareCard, {type RunnerSpecShareModel} from '../RunnerSpecShareCard';

function textOf(node: any): string {
  const out: string[] = [];
  const walk = (n: any) => {
    if (n == null) return;
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.children) walk(n.children);
  };
  const tree = node.toJSON();
  walk(tree);
  return out.join(' ');
}

const MODEL: RunnerSpecShareModel = {
  runner: '민우우웅',
  brand: 'Keego',
  vo2max: 52.3,
  vo2maxLabel: '우수',
  medals: [
    {label: '5K', value: '24:30', earned: true},
    {label: '10K', value: '52:10', earned: true},
    {label: '하프', value: '아직', earned: false},
    {label: '풀', value: '아직', earned: false},
  ],
  pace: "4'12\"/km",
  longest: '21.1km',
};

test('러너 스펙 공유 카드: 이름·VO2max·훈장·페이스 렌더', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<RunnerSpecShareCard model={MODEL} />); });
  const txt = textOf(r);
  expect(txt).toContain('민우우웅');
  expect(txt).toContain('RUNNER SPEC');
  expect(txt).toContain('52.3');
  expect(txt).toContain('VO₂max');
  expect(txt).toContain('5K');
  expect(txt).toContain('24:30');
  expect(txt).toContain('하프');
  expect(txt).toContain('아직');
  expect(txt).toContain("4'12\"/km");
  expect(txt).toContain('21.1km');
  expect(txt.toLowerCase()).toContain('keego');
});

test('VO2max 0이면 심폐 체력 블록 숨김(크래시 없음)', () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(<RunnerSpecShareCard model={{...MODEL, vo2max: 0}} />); });
  const txt = textOf(r);
  expect(txt).not.toContain('심폐 체력');
  expect(txt).toContain('5K'); // 훈장은 여전히
});
