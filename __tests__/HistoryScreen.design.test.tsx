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

const SUMMARY = {
  '주': {km: '12', runs: 3, pace: "5'10\"", time: '1:02'},
  '월': {km: '88', runs: 20, pace: "5'30\"", time: '7:40'},
};

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
      renderer = ReactTestRenderer.create(<HistoryScreen summary={SUMMARY as any} unit="km" />);
    });
    const root = renderer.root;
    // 기본 기간은 '월' → 88km 노출
    expect(textOf(root)).toContain('88');

    // '주' 세그먼트 탭 → 12km로 갱신
    act(() => {
      segment(root, '주').props.onPress();
    });
    expect(textOf(root)).toContain('12');
  });
});

describe('HistoryScreen 막대차트', () => {
  test('차트 데이터가 주입되면 기간 라벨 막대가 렌더된다', () => {
    const chart = {
      '월': {title: '주간 거리', data: [3, 5, 0, 8], labels: ['1주', '2주', '3주', '4주']},
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(
        <HistoryScreen summary={SUMMARY as any} chart={chart as any} unit="km" />,
      );
    });
    const t = textOf(renderer.root);
    expect(t).toContain('주간 거리');
    expect(t).toContain('1주');
    expect(t).toContain('4주');
  });
});

describe('HistoryScreen 빈 상태', () => {
  test('기록이 없으면 keep-going 톤 빈 상태 카피를 보여준다', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      renderer = ReactTestRenderer.create(<HistoryScreen runs={[]} unit="km" />);
    });
    expect(textOf(renderer.root)).toContain('첫 러닝이 여기 쌓여요');
  });
});
