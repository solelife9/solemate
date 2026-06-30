/**
 * HistoryScreen 체력 트렌드 카드 — UI 노출 행동 테스트.
 *
 * 분석엔진(lib/analytics/fitness)이 산출한 VO2max + 트레이닝 상태를 기록 탭이
 * 실제로 보여주는지(또는 데이터 없을 때 숨기는지) 검증한다:
 *   1) 타임이 있는 노력 런이 있으면 '체력 트렌드' 카드 + VO2max 등급이 렌더된다.
 *   2) 타임 없는 런만 있으면(=VDOT 산출 불가) 카드는 숨는다(날조 금지).
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

// 카드는 '현재 체력'(기간 무관)이라 최근 윈도우(42일) 안의 런이 필요하다 — 오늘 날짜로 시드한다.
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
function mkRun(id: string, dist: number, durationS: number, dateStr: string) {
  return {id, dist, durationS, runDate: dateStr, shoe: -1, pace: "4'00\"", time: '20:00'} as any;
}

describe('HistoryScreen 체력 트렌드 카드', () => {
  test('타임 있는 노력 런 → 체력 트렌드 + VO2max 등급 노출', () => {
    // 5km 20:00 → VDOT ≈ 49.8 → 등급 '우수'.
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<HistoryScreen runs={[mkRun('a', 5, 20 * 60, TODAY)]} unit="km" />); });
    const txt = textOf(r.root);
    expect(txt).toContain('체력 트렌드');
    expect(txt).toContain('VO');     // VO₂max 라벨
    expect(txt).toContain('우수');   // vdotLabel(49.8)
    expect(txt).toContain('폼');     // 트레이닝 상태(TSB) 행
  });

  test('타임 없는 런만 있으면 카드 숨김(VDOT 산출 불가 → 날조 안 함)', () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => { r = ReactTestRenderer.create(<HistoryScreen runs={[mkRun('a', 5, 0, TODAY)]} unit="km" />); });
    expect(textOf(r.root)).not.toContain('체력 트렌드');
  });
});
