// ============================================================================
// lib/runEdit — 수동 편집에서 무엇을 다시 계산하고 무엇을 두는가 (2026-08-07 감사)
//
// 편집이 필드를 그냥 얹기만 해서 **칼로리가 옛 값 그대로 남았다.** 5km 를 7km 로 고치면
// 거리만 7km 고 칼로리는 5km 짜리다 — 한 화면 안에서 두 숫자가 서로를 부정한다.
//
// 규칙은 하나다: **파생값은 따라가고, 측정값은 손대지 않는다.**
//   · calories = f(거리, 시간, 체중)  → 파생값 → 다시 계산
//   · 스플릿·케이던스·고도·경로·심박  → 측정값 → 그대로
// 사용자가 거리를 손으로 고쳤다고 없던 구간 기록을 지어내면 그게 더 나쁘다(Truth only).
// ============================================================================
import {applyRunEdit} from '../../lib/runEdit';
import {estimateCaloriesTotal} from '../../lib/calories';

const WEIGHT = 70;
const RUN = {
  id: 'r1',
  shoe_id: 's1',
  km: 5,
  run_date: '2026-08-01',
  duration: 1800,
  calories: 350,
  cadence: 172,
  elevation_m: 33,
  route: '[{"lat":37.5,"lon":127}]',
  heart_rate: 150,
};

describe('파생값은 입력을 따라간다', () => {
  test('거리를 고치면 칼로리가 다시 계산된다', () => {
    const out = applyRunEdit(RUN, {km: 7}, WEIGHT);
    expect(out.km).toBe(7);
    expect(out.calories).toBe(Math.round(estimateCaloriesTotal(7, 1800, WEIGHT)));
    expect(out.calories).not.toBe(RUN.calories);
  });

  test('시간을 고쳐도 다시 계산된다', () => {
    const out = applyRunEdit(RUN, {duration: 3600}, WEIGHT);
    expect(out.calories).toBe(Math.round(estimateCaloriesTotal(5, 3600, WEIGHT)));
  });

  test('거리와 시간을 함께 고치면 둘 다 반영된다', () => {
    const out = applyRunEdit(RUN, {km: 10, duration: 3600}, WEIGHT);
    expect(out.calories).toBe(Math.round(estimateCaloriesTotal(10, 3600, WEIGHT)));
  });
});

describe('측정값은 손대지 않는다', () => {
  test('거리를 고쳐도 케이던스·고도·경로·심박은 그대로다', () => {
    const out = applyRunEdit(RUN, {km: 7}, WEIGHT);
    expect(out.cadence).toBe(RUN.cadence);
    expect(out.elevation_m).toBe(RUN.elevation_m);
    expect(out.route).toBe(RUN.route);
    expect(out.heart_rate).toBe(RUN.heart_rate);
  });

  test('신발·날짜만 고치면 칼로리를 건드리지 않는다', () => {
    const out = applyRunEdit(RUN, {shoe_id: 's2', run_date: '2026-08-02'}, WEIGHT);
    expect(out.calories).toBe(RUN.calories);
    expect(out.shoe_id).toBe('s2');
    expect(out.run_date).toBe('2026-08-02');
  });

  test('원본을 변형하지 않는다', () => {
    const snap = JSON.stringify(RUN);
    applyRunEdit(RUN, {km: 99, duration: 99}, WEIGHT);
    expect(JSON.stringify(RUN)).toBe(snap);
  });
});

describe('모르면 지어내지 않는다', () => {
  test('체중을 모르면 칼로리를 손대지 않는다 — 기본값으로 추정하면 출처가 사라진다', () => {
    const out = applyRunEdit(RUN, {km: 7}, 0);
    expect(out.calories).toBe(RUN.calories);
  });

  test('거리를 0 으로 고치면 칼로리를 0 으로 덮지 않는다 — 옛 값보다 틀린 숫자가 더 나쁘다', () => {
    const out = applyRunEdit(RUN, {km: 0}, WEIGHT);
    expect(out.km).toBe(0);
    expect(out.calories).toBe(RUN.calories);
  });

  test('시간이 0 이어도 마찬가지다', () => {
    const out = applyRunEdit(RUN, {duration: 0}, WEIGHT);
    expect(out.calories).toBe(RUN.calories);
  });

  test('칼로리가 원래 없던 런은 입력이 갖춰지면 새로 채운다', () => {
    const noCal: {km: number; duration: number; calories?: number} = {km: 5, duration: 1800};
    const out = applyRunEdit(noCal, {km: 8}, WEIGHT);
    expect(out.calories).toBe(Math.round(estimateCaloriesTotal(8, 1800, WEIGHT)));
  });
});
