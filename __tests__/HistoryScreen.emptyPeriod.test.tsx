/**
 * 기간이 비어도 최근 러닝은 보여준다 (2026-08-04 민우님 지적).
 *
 * 이번 주에 안 달렸다고 기록 탭이 "이 기간엔 기록이 없어요" 한 줄로 끝나던 것 — 막다른
 * 길이다. 사실도 아니고(지난주 기록은 있다) 할 수 있는 것도 없다. 기간 요약·그래프는 그
 * 기간의 값이니 그대로 두고, 아래에 최근 러닝을 이어 붙인다.
 *
 * @format
 */

import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HistoryScreen from '../HistoryScreen.rn';
import type {Run, Shoe} from '../theme';

const SHOE = {id: 's1', brand: 'NIKE', model: 'Pegasus', used: 100, max: 600, maxBase: 600, retired: false} as Shoe;

/** 최신순으로 넘어온다(App 이 sortRunsByDateDesc 로 정렬해 준다). */
const RUNS: Run[] = [
  {id: 'r1', date: '7월 20일', day: '일', dateNum: '20', dist: 8.2, pace: "5'10\"", time: '42:22', shoe: 0, shoeName: 'Nike Pegasus', cal: 0, cadence: 0, bpm: 0, elev: 0, runDate: '2026-07-20', durationS: 2542} as Run,
  {id: 'r2', date: '7월 18일', day: '금', dateNum: '18', dist: 5.0, pace: "5'30\"", time: '27:30', shoe: 0, shoeName: 'Nike Pegasus', cal: 0, cadence: 0, bpm: 0, elev: 0, runDate: '2026-07-18', durationS: 1650} as Run,
  {id: 'r3', date: '7월 15일', day: '화', dateNum: '15', dist: 3.1, pace: "6'00\"", time: '18:36', shoe: 0, shoeName: 'Nike Pegasus', cal: 0, cadence: 0, bpm: 0, elev: 0, runDate: '2026-07-15', durationS: 1116} as Run,
  {id: 'r4', date: '7월 10일', day: '금', dateNum: '10', dist: 10.0, pace: "5'20\"", time: '53:20', shoe: 0, shoeName: 'Nike Pegasus', cal: 0, cadence: 0, bpm: 0, elev: 0, runDate: '2026-07-10', durationS: 3200} as Run,
];

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') {
      out += n;
      return;
    }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function render(runs: Run[]) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    r = ReactTestRenderer.create(<HistoryScreen shoes={[SHOE]} runs={runs} todayISO="2026-08-04" />);
  });
  return r;
}

test('이번 달에 기록이 없으면 — 그 사실을 말하고, 아래에 최근 러닝을 보여준다', () => {
  // 기본 기간은 '월'. 오늘(2026-08)엔 기록이 없고 7월 기록만 있다.
  const r = render(RUNS);
  const t = textOf(r.root);

  // 기간이 비었다는 사실은 그대로 말한다(요약·그래프는 그 기간의 값이라 유지).
  expect(t).toContain('기록이 없어요');
  // ...그리고 막다른 길로 두지 않는다.
  expect(t).toContain('최근 러닝');
  expect(t).toContain('8.2');   // 가장 최근 러닝
  expect(t).toContain('42:22');
  expect(t).toContain('27:30'); // 그다음 러닝

  act(() => r.unmount());
});

test('최근 러닝은 몇 개만 — 기간 목록을 대신하는 게 아니라 길만 터준다', () => {
  const r = render(RUNS);
  const t = textOf(r.root);
  // 최신 3건까지만(4번째는 안 보인다) — 이건 '이 기간의 목록'이 아니다.
  expect(t).toContain('18:36');      // 3번째까지
  expect(t).not.toContain('53:20');  // 4번째는 없다

  act(() => r.unmount());
});

test('기록이 아예 없으면 최근 러닝 대신 첫 러닝 안내가 나온다(둘이 겹치지 않는다)', () => {
  const r = render([]);
  const t = textOf(r.root);
  expect(t).toContain('아직 기록이 없어요');
  expect(t).not.toContain('최근 러닝');

  act(() => r.unmount());
});
