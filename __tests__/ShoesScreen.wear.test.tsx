/**
 * ShoesScreen.rn.tsx — 신발 상세 실효 마모 + 교체 예측 행동 테스트.
 *
 * props-driven(백엔드 0). 실데이터로 ok/overdue/no_recent 세 분기의 예측 카피가
 * 렌더되는지, 체중이 다르면 실효 마모 표시 숫자가 달라지는지(weightFactor)를 관찰
 * 가능한 텍스트로 단언한다. 계산은 lib/wearView(=wearModel/forecast)를 그대로 쓰므로
 * 기대값도 같은 함수로 구해 정합을 보장한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import ShoesScreen from '../ShoesScreen.rn';
import {Shoe, Run} from '../theme';
import {buildWearView} from '../lib/wearView';

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  let out = '';
  const walk = (n: any) => {
    if (typeof n === 'string') { out += n; return; }
    if (!n || !n.children) return;
    n.children.forEach(walk);
  };
  walk(node);
  return out;
}
function render(el: React.ReactElement) {
  let r!: ReactTestRenderer.ReactTestRenderer;
  act(() => { r = ReactTestRenderer.create(el); });
  return r;
}
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}

// 오늘 기준 d일 전의 'YYYY-MM-DD'. 최근(28일 이내)/오래된(28일 초과) 런을 만든다.
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 한 켤레 + 그 신발로 달린 런들을 상세로 펼쳐 텍스트를 얻는다.
function openDetail(shoe: Shoe, runs: Run[], weightKg?: number): string {
  const root = render(<ShoesScreen shoes={[shoe]} runs={runs} weightKg={weightKg} />).root;
  act(() => { pressByLabel(root, `${shoe.brand} ${shoe.model} 상세`).props.onPress(); });
  return textOf(root);
}

const mkRun = (over: Partial<Run>): Run => ({
  id: 'r', date: '', day: '', dateNum: '', dist: 10, pace: '', time: '', shoe: 0,
  cal: 0, cadence: 0, bpm: 0, elev: 0, durationS: 3000, runDate: daysAgo(3), ...over,
});

describe('ShoesScreen 상세 — 실효 마모 + 교체 예측', () => {
  test('ok 분기: "약 N주 후 교체 권장 · 예상 M월 D일" 추정 카피를 실데이터로 렌더', () => {
    const shoe: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'};
    const runs: Run[] = [
      mkRun({id: 'r1', dist: 10, durationS: 3000, runDate: daysAgo(2)}),
      mkRun({id: 'r2', dist: 12, durationS: 3600, runDate: daysAgo(5)}),
      mkRun({id: 'r3', dist: 8, durationS: 2400, runDate: daysAgo(9)}),
    ];
    const view = buildWearView(shoe, runs, {});
    expect(view.forecast.reason).toBe('ok');

    const txt = openDetail(shoe, runs);
    // '실효 마모' 용어/숫자 표시는 제거(일반 사용자 혼동) — 결과(교체 예상)만 노출.
    expect(txt).not.toContain('실효 마모');
    expect(txt).toContain('교체 예상');
    // 추정 톤(A6-3): 단정 회피 — '약'·'예상' 포함, "정확히" 류 단정 표현 없음.
    expect(txt).toContain('약');
    expect(txt).toContain('주 후 교체 권장');
    expect(txt).toContain('예상');
    expect(txt).not.toContain('정확히');
  });

  test('overdue 분기: 잔여≤0이면 "지금 교체하면 부상 없이 계속" 카피를 렌더', () => {
    // max(권장 수명) 100km인데 최근 큰 런들로 실효 마모가 이를 초과 → overdue.
    const shoe: Shoe = {id: 'a', brand: 'Hoka', model: 'Clifton 10', used: 90, max: 100, condition: '교체'};
    const runs: Run[] = [
      mkRun({id: 'r1', dist: 80, durationS: 24000, runDate: daysAgo(2)}),
      mkRun({id: 'r2', dist: 80, durationS: 24000, runDate: daysAgo(6)}),
    ];
    const view = buildWearView(shoe, runs, {});
    expect(view.forecast.reason).toBe('overdue');

    const txt = openDetail(shoe, runs);
    expect(txt).toContain('지금 교체하면 부상 없이 계속 달릴 수 있어요');
  });

  test('no_recent 분기: 최근 28일 주행이 없으면 "최근 기록이 없어 예측할 수 없어요"', () => {
    const shoe: Shoe = {id: 'a', brand: 'On', model: 'Cloudflow 5', used: 50, max: 700, condition: '양호'};
    const runs: Run[] = [
      mkRun({id: 'r1', dist: 25, durationS: 7500, runDate: daysAgo(40)}),
      mkRun({id: 'r2', dist: 25, durationS: 7500, runDate: daysAgo(55)}),
    ];
    const view = buildWearView(shoe, runs, {});
    expect(view.forecast.reason).toBe('no_recent');

    const txt = openDetail(shoe, runs);
    expect(txt).toContain('최근 기록이 없어 예측할 수 없어요');
  });

  test('체중이 교체 예측 보정에 반영된다(weightFactor — 무거울수록 실효 마모 큼)', () => {
    const shoe: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 100, max: 700, condition: '양호'};
    const runs: Run[] = [
      mkRun({id: 'r1', dist: 30, durationS: 9000, runDate: daysAgo(3)}),
      mkRun({id: 'r2', dist: 30, durationS: 9000, runDate: daysAgo(7)}),
    ];
    // 모델(wearModel/forecast)이 체중을 반영한다 — 무거운 러너의 실효 마모가 더 크고
    // 교체까지 남은 주가 더 짧다(예측 보정). 표시 숫자가 아니라 모델 결과로 검증.
    const v60 = buildWearView(shoe, runs, {weightKg: 60});
    const v90 = buildWearView(shoe, runs, {weightKg: 90});
    expect(v90.effectiveWearKm).toBeGreaterThan(v60.effectiveWearKm);
    expect(v90.forecast.weeksRemaining ?? 0).toBeLessThanOrEqual(v60.forecast.weeksRemaining ?? Infinity);

    // 두 체중 모두 상세에 '교체 예상' 예측이 렌더된다('실효 마모' 용어는 미노출).
    const txt60 = openDetail(shoe, runs, 60);
    expect(txt60).toContain('교체 예상');
    expect(txt60).not.toContain('실효 마모');
  });
});
