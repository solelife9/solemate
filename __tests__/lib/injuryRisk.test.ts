// injuryRisk.test.ts — 신발 마모 × 훈련 부하 통합 위험(순수) 단위 테스트.
import {assessCombinedRisk} from '../../lib/injuryRisk';
import {INJURY_HIGH_MSG} from '../../lib/injury';

const TODAY = '2026-06-23';
const DAY_MS = 86400000;
function ago(n: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const dt = new Date(new Date(y, m - 1, d).getTime() - n * DAY_MS);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

// 안정적 부하(ACWR≈1) 런셋 — 부하를 safe로 고정해 신발 신호를 단독 검증.
function steadyRuns() {
  const runs = [] as {run_date: string; km: number}[];
  for (let w = 0; w < 4; w++) {
    runs.push({run_date: ago(w * 7 + 1), km: 5});
    runs.push({run_date: ago(w * 7 + 4), km: 5});
  }
  return runs;
}

describe('assessCombinedRisk — 융합', () => {
  it('몸·신발 모두 양호 → safe·drivers 없음·all-good 카피', () => {
    const r = assessCombinedRisk({
      runs: steadyRuns(),
      todayISO: TODAY,
      shoe: {used: 100, max: 600}, // 17% 마모 = safe
    });
    expect(r.level).toBe('safe');
    expect(r.drivers).toEqual([]);
    expect(r.message).toContain('킵고잉');
  });

  it('신발만 닳음(부하 안정) → caution, driver=shoe, 신발 카피 재사용', () => {
    const r = assessCombinedRisk({
      runs: steadyRuns(),
      todayISO: TODAY,
      shoe: {used: 580, max: 600}, // 97% 마모 = high
    });
    expect(r.level).toBe('high');
    expect(r.drivers).toEqual(['shoe']);
    expect(r.message).toBe(INJURY_HIGH_MSG);
  });

  it('부하만 급증(신발 새것) → driver=load', () => {
    const spike = [
      {run_date: ago(20), km: 2},
      {run_date: ago(13), km: 2},
      {run_date: ago(2), km: 15},
      {run_date: ago(1), km: 15},
    ];
    const r = assessCombinedRisk({
      runs: spike,
      todayISO: TODAY,
      shoe: {used: 50, max: 600}, // 새것 = safe
    });
    expect(r.level).toBe('high');
    expect(r.drivers).toEqual(['load']);
  });

  it('신발 닳음 + 부하 급증(둘 다 high) → high·drivers 둘 다·융합 카피', () => {
    const spike = [
      {run_date: ago(20), km: 2},
      {run_date: ago(13), km: 2},
      {run_date: ago(2), km: 15},
      {run_date: ago(1), km: 15},
    ];
    const r = assessCombinedRisk({
      runs: spike,
      todayISO: TODAY,
      shoe: {used: 580, max: 600},
    });
    expect(r.level).toBe('high');
    expect(r.drivers).toEqual(['shoe', 'load']);
    expect(r.message).toContain('신발도 닳았고');
  });

  it('shoe 미지정 → 부하만으로 판정(graceful)', () => {
    const r = assessCombinedRisk({runs: steadyRuns(), todayISO: TODAY});
    expect(r.level).toBe('safe');
    expect(r.shoe.level).toBe('safe');
  });

  it('빈 입력도 graceful(safe)', () => {
    const r = assessCombinedRisk({runs: [], todayISO: TODAY});
    expect(r.level).toBe('safe');
    expect(r.drivers).toEqual([]);
  });
});
