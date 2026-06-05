/**
 * ShoesScreen.rn.tsx — 신발 상세 '다음 러닝화' 추천 카드(수익화 v1) 행동 테스트.
 *
 * 홈에만 있던 NextShoeCard 를 신발 상세에도 노출한다. 트리거는 Slice 6 교체 예측
 * (wearView.forecast)을 shouldRecommendNextShoe 로 판정한 결과다 — 교체임박(overdue/≤3주)
 * 신발 상세에서만 카드가 뜨고, 여유 있는 신발에서는 뜨지 않는다는 관찰 가능한 동작을
 * 검증한다. 추천 모델 텍스트·쇼핑몰 버튼 press→Linking.openURL·투명성 고지도 단언한다.
 *
 * 백엔드 호출 없이 props 만으로 구동(react-test-renderer). 추천 자산은 순수 lib 라
 * 기대 모델을 lib 에서 직접 파생해 시드 변경에도 깨지지 않게 한다.
 *
 * @format
 */
import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Linking} from 'react-native';
import ShoesScreen from '../ShoesScreen.rn';
import {recommendNextShoes} from '../lib/affiliate';
import {Shoe, Run} from '../theme';

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
const byTestID = (root: ReactTestRenderer.ReactTestInstance, id: string) =>
  root.findAll((n: any) => n && n.props && n.props.testID === id);
function pressByLabel(root: ReactTestRenderer.ReactTestInstance, label: string) {
  const hits = root.findAll(
    (n: any) => n && n.props && typeof n.props.onPress === 'function' && n.props.accessibilityLabel === label,
  );
  if (!hits.length) throw new Error(`no pressable with label "${label}"`);
  return hits[0];
}

// 교체임박(overdue): max(=수명) 100km 대비 실효 마모 200km → kmRemaining ≤ 0 →
// forecast.reason 'overdue' → shouldRecommendNextShoe true. (created_at 미설정이라
// age wear 0, duration 미설정이라 pace/surface 보정 1.0 — dist 가 그대로 실효 마모.)
const WORN: Shoe = {id: 'a', brand: 'Nike', model: 'Pegasus 41', used: 690, max: 100, condition: '교체'};
const WORN_RUNS: Run[] = [
  {id: 'r1', date: '5월 28일', day: '수', dateNum: '28', dist: 200, pace: "5'00\"", time: '40:00', shoe: 0, cal: 0, cadence: 0, bpm: 0, elev: 0},
];

// 여유: 충분한 수명 + 런 기록 없음 → 실효 마모 0 → 추천 트리거 미충족(카드 미노출).
const ROOMY: Shoe = {id: 'b', brand: 'Nike', model: 'Pegasus 41', used: 50, max: 700, condition: '양호'};

const openDetail = (shoe: Shoe, runs: Run[] = []) => {
  const root = render(<ShoesScreen shoes={[shoe]} runs={runs} />).root;
  act(() => { pressByLabel(root, `${shoe.brand} ${shoe.model} 상세`).props.onPress(); });
  return root;
};

describe('ShoesScreen 상세 — 교체임박 다음 러닝화 추천', () => {
  test('교체임박 신발 상세에 추천 카드가 뜨고 추천 모델 + 쇼핑몰 버튼을 렌더한다', () => {
    const root = openDetail(WORN, WORN_RUNS);
    const card = byTestID(root, 'shoe-detail-next-shoe');
    expect(card.length).toBeGreaterThanOrEqual(1);
    const txt = textOf(card[0]);
    // 실제 추천 1순위 모델(lib 에서 파생 — 같은 카테고리 동급) 텍스트 노출
    const recs = recommendNextShoes({brand: WORN.brand, model: WORN.model}, 3);
    expect(recs.length).toBeGreaterThan(0);
    expect(txt).toContain(recs[0].brand);
    expect(txt).toContain(recs[0].model);
    // 같은 카테고리(데일리 트레이너) 라벨 + 4개 쇼핑몰 버튼
    expect(txt).toContain('데일리 트레이너');
    expect(txt).toContain('쿠팡');
    expect(txt).toContain('네이버쇼핑');
    expect(txt).toContain('무신사');
    expect(txt).toContain('29CM');
    // 투명성 고지(제휴 가능성 + 러너 우선)
    expect(txt).toContain('러너');
  });

  test('쇼핑몰 버튼을 누르면 Linking.openURL 로 검색 URL 을 연다', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined as any);
    const root = openDetail(WORN, WORN_RUNS);
    const hits = root.findAll(
      (n: any) => n && n.props && typeof n.props.onPress === 'function' && textOf(n) === '쿠팡',
    );
    expect(hits.length).toBeGreaterThan(0);
    act(() => { hits[0].props.onPress(); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0][0])).toContain('coupang.com');
    spy.mockRestore();
  });

  test('여유 있는 신발 상세에는 추천 카드가 뜨지 않는다', () => {
    const root = openDetail(ROOMY, []);
    expect(byTestID(root, 'shoe-detail-next-shoe').length).toBe(0);
  });
});
