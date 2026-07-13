/**
 * lib/wearView 회귀 테스트 — 표시형 Shoe(appTypes) → 마모/교체예측 어댑터.
 *
 * 배경(2026-07-14 정확성 감사): 등록 주행거리(start_km)·보유 기간(purchase_date)이
 * 수명 링(used=shoeHealth)에는 반영됐지만, 신발 상세화면이 buildWearView 로 교체예측을
 * *재계산*할 때 표시형 Shoe 가 이 필드를 싣지 않아 baseline 이 통째로 빠졌다 → 링은
 * '교체 임박'인데 예측은 '여유'로 자기모순. 여기서는 상세화면이 실제로 소비하는 표면
 * (buildWearView 에 표시형 Shoe 를 그대로 넘김)이 start_km/age 를 반영함을 못박는다.
 *
 * 순수 단위 — IO/렌더 불요.
 * @format
 */
import {buildWearView, type WearViewShoe} from '../../lib/wearView';
import type {Shoe} from '../../appTypes';

const NOW = new Date('2026-06-04T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgoISO = (d: number) => new Date(NOW.getTime() - d * DAY).toISOString().slice(0, 10);

// 상세화면이 넘기는 실제 shape(appTypes.Shoe). 최근 28일에 고른 주행.
const RUNS = [
  {id: 'r1', dist: 10, durationS: 3000, runDate: daysAgoISO(3)},
  {id: 'r2', dist: 10, durationS: 3000, runDate: daysAgoISO(10)},
  {id: 'r3', dist: 10, durationS: 3000, runDate: daysAgoISO(17)},
];

// 표시형 Shoe(appTypes) — 상세화면 uiShoes[i] 와 동일한 필드 집합.
const uiShoe = (over: Partial<Shoe> = {}): Shoe => ({
  id: 's1',
  brand: 'Nike',
  model: 'Pegasus 41',
  used: 550,
  max: 600,
  start_km: 550,
  ...over,
});

describe('표시형 Shoe → buildWearView 가 start_km baseline 을 반영한다(상세화면 정합)', () => {
  it('effectiveWearKm 이 표시형 Shoe.start_km 을 그대로 더한다', () => {
    const worn = buildWearView(uiShoe({start_km: 550}), RUNS, {now: NOW});
    const fresh = buildWearView(uiShoe({start_km: 0}), RUNS, {now: NOW});
    // 등록거리 차이(550)가 실효 마모에 그대로 반영돼야 한다(baseline 유실 회귀 차단).
    expect(worn.effectiveWearKm - fresh.effectiveWearKm).toBeCloseTo(550, 0);
  });

  it('이미 신던 신발(start_km 550/수명 600)은 교체 임박/초과, start_km 0 이면 여유(과거 모순 버그)', () => {
    const worn = buildWearView(uiShoe({start_km: 550}), RUNS, {now: NOW});
    const fresh = buildWearView(uiShoe({start_km: 0}), RUNS, {now: NOW});
    // start_km 무시 시엔 잔여가 훨씬 커 '교체 임박'이 안 떴다 — 이제 임박/초과.
    expect(worn.forecast.kmRemaining).toBeLessThan(fresh.forecast.kmRemaining);
    // 550km 신던 수명 600 신발은 실효 마모가 이미 수명에 근접/초과 → 여유 아님.
    expect(worn.forecast.reason === 'overdue' || (worn.forecast.kmRemaining ?? 0) < 100).toBe(true);
  });

  it('start_km 결측(표시형 Shoe 에 필드 없음)은 안전하게 0 취급 — NaN/음수 없음', () => {
    const noField = buildWearView({brand: 'Nike', model: 'X', max: 600} as WearViewShoe, RUNS, {now: NOW});
    expect(Number.isFinite(noField.effectiveWearKm)).toBe(true);
    expect(noField.effectiveWearKm).toBeGreaterThanOrEqual(0);
  });

  it('purchase_date(보유 기간)로 시간 경과 열화가 실효 마모에 더해진다', () => {
    // 24개월 전 보유 시작(런 동일) → ageWearKm 가 붙어 마모가 커진다.
    const aged = buildWearView(uiShoe({start_km: 0, purchase_date: daysAgoISO(720)}), RUNS, {now: NOW});
    const newish = buildWearView(uiShoe({start_km: 0}), RUNS, {now: NOW});
    expect(aged.effectiveWearKm).toBeGreaterThan(newish.effectiveWearKm);
  });
});
