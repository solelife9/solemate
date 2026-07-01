/**
 * HistoryScreen Slice-3 시각 마감 행동 테스트.
 *
 * 토큰화로 색만 바꾼 인터랙티브 요소(기간 세그먼트)와 정제한 막대차트가
 * 관찰 가능한 결과를 유지하는지 검증한다(test_critic 요건):
 *   1) 기간 세그먼트(주/월/년/전체)를 누르면 그 기간의 요약 통계로 화면이 갱신된다.
 *   2) 차트가 주입되면 데이터 막대(기간 라벨)가 렌더된다.
 *   3) 기록이 없으면 keep-going 톤 빈 상태 카피를 보여준다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import HistoryScreen from '../HistoryScreen.rn';

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

// Phase 5b 이후 HistoryScreen은 주/월/년 요약을 props.summary가 아니라 runs에서 직접
// 계산한다(summary prop은 '전체' 기간에만 쓰임). 그래서 기간별 거리를 검증하려면
// 해당 기간(이번 달/이번 주)에 떨어지는 run_date로 런을 시드한다.
const now = new Date();
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 이번 주 월요일(주 요약이 잡는 구간) — getDay()=0(일)이면 -6, 아니면 1-day.
const weekMonday = (() => {
  const d = new Date(now);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
})();
// 이번 달이지만 이번 주에는 들지 않는 날(달 요약엔 잡히고 주 요약엔 안 잡힘).
const weekSunday = (() => { const d = new Date(weekMonday); d.setDate(d.getDate() + 6); return d; })();
const monthOnlyDate = (() => {
  // 이번 주 월요일 전날(같은 달이면)을 우선 쓴다.
  const before = new Date(weekMonday); before.setDate(before.getDate() - 1);
  if (before.getMonth() === now.getMonth()) return before;
  // 주 월요일이 그 달 1일이면 이전 날이 지난 달이므로, 주 일요일 다음 날(같은 달)을 쓴다.
  const after = new Date(weekSunday); after.setDate(after.getDate() + 1);
  return after; // now.getMonth()와 동일한 달임이 보장된다(월요일이 1일이라면 일요일+1은 같은 달).
})();
function mkRun(id: string, dist: number, dateStr: string) {
  return {id, dist, durationS: 1800, runDate: dateStr, shoe: -1, pace: "5'00\"", time: '30:00'} as any;
}
// 이번 주에 12km(주 요약 = 12), 이번 달에 76km 추가 → 달 요약 = 88km.
// w1 은 '오늘'에 시드한다 — 오늘은 항상 이번 주∧이번 달에 동시에 속하므로, 주가 두 달에
// 걸치는 월 경계(예: 6/29~7/5 주의 7/1)에서도 주·달 양쪽에 안전히 잡힌다. (weekMonday 에
// 두면 그 월요일이 지난달일 때 월 합계에서 누락돼 88 이 깨졌다.)
const RUNS = [
  mkRun('w1', 12, ymd(now)),
  mkRun('m1', 76, ymd(monthOnlyDate)),
];

function segment(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n) === label,
  );
  return hits[0];
}

describe('HistoryScreen 기간 세그먼트', () => {
  test('세그먼트를 누르면 해당 기간 요약(거리)으로 화면이 갱신된다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<HistoryScreen runs={RUNS} unit="km" />);
    });
    const root = renderer.root;
    // 기본 기간은 '월' → 이번 달 합계 88km 노출
    expect(textOf(root)).toContain('88');

    // '주' 세그먼트 탭 → 이번 주 합계 12km로 갱신
    act(() => {
      segment(root, '주').props.onPress();
    });
    expect(textOf(root)).toContain('12');
  });
});

describe('HistoryScreen 막대차트', () => {
  // 달 차트는 이제 runs에서 직접 계산된다(주간 거리, 라벨 1주..N주). 이번 달 런이
  // 있으면 '주간 거리' 제목과 주차 라벨 막대가 렌더된다.
  test('이번 달 런이 있으면 주간 거리 막대(주차 라벨)가 렌더된다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <HistoryScreen runs={RUNS} unit="km" />,
      );
    });
    const t = textOf(renderer.root);
    expect(t).toContain('주간 거리');
    expect(t).toContain('1주');
    expect(t).toContain('4주');
  });
});

describe('HistoryScreen 빈 상태', () => {
  test('전체 런이 0이면 첫-런 keep-going 빈 상태를 보여준다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<HistoryScreen runs={[]} unit="km" />);
    });
    // runs.length===0 은 '기간이 비어서'가 아니라 '아직 시작 안 함' — 격려 톤 첫-런 상태.
    const txt = textOf(renderer.root);
    expect(txt).toContain('아직 기록이 없어요');
    expect(txt).toContain('가볍게 한 걸음부터');
  });
});
