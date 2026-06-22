// injuryGuidance.test.ts — 통합 위험 → 구체 코칭(순수) 단위 테스트.
import { assessCombinedRisk } from '../../lib/injuryRisk';
import { buildInjuryGuidance } from '../../lib/injuryGuidance';

const TODAY = '2026-06-23';
const DAY_MS = 86400000;
function ago(n: number): string {
  const [y, m, d] = TODAY.split('-').map(Number);
  const dt = new Date(new Date(y, m - 1, d).getTime() - n * DAY_MS);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function steadyRuns() {
  const runs = [] as { run_date: string; km: number }[];
  for (let w = 0; w < 4; w++) {
    runs.push({ run_date: ago(w * 7 + 1), km: 5 });
    runs.push({ run_date: ago(w * 7 + 4), km: 5 });
  }
  return runs;
}
function spikeRuns() {
  return [
    { run_date: ago(20), km: 2 },
    { run_date: ago(13), km: 2 },
    { run_date: ago(2), km: 15 },
    { run_date: ago(1), km: 15 },
  ];
}
function guidanceFor(runs: any[], shoe?: { used: number; max: number }) {
  return buildInjuryGuidance(assessCombinedRisk({ runs, shoe, todayISO: TODAY }));
}
const titles = (g: ReturnType<typeof buildInjuryGuidance>) =>
  g.items.map((i) => i.title).join(' | ');

describe('buildInjuryGuidance', () => {
  it('모두 양호 → 격려 1개(빈 목록 금지) + tone good', () => {
    const g = guidanceFor(steadyRuns(), { used: 100, max: 600 });
    expect(g.level).toBe('safe');
    expect(g.items.length).toBe(1);
    expect(g.items[0].tone).toBe('good');
    expect(g.items[0].title).toContain('그대로');
  });

  it('신발만 닳음 → 교체 코칭(마모% 포함) · 약자 없음', () => {
    const g = guidanceFor(steadyRuns(), { used: 580, max: 600 });
    expect(titles(g)).toContain('신발 교체가 필요해요');
    const body = g.items.map((i) => i.body).join(' ');
    expect(body).toContain('97%');
    expect(body).not.toContain('ACWR');
  });

  it('부하만 급증 → 회복 우선 코칭', () => {
    const g = guidanceFor(spikeRuns(), { used: 50, max: 600 });
    expect(titles(g)).toContain('오늘은 회복이 우선');
  });

  it('신발 닳음 + 부하 급증 → 코칭 두 개 다 노출', () => {
    const g = guidanceFor(spikeRuns(), { used: 580, max: 600 });
    expect(titles(g)).toContain('신발 교체가 필요해요');
    expect(titles(g)).toContain('오늘은 회복이 우선');
    expect(g.level).toBe('high');
  });

  it('나흘 연속 달림 → 휴식 권고 항목 추가', () => {
    const consec = [
      { run_date: ago(0), km: 4 },
      { run_date: ago(1), km: 4 },
      { run_date: ago(2), km: 4 },
      { run_date: ago(3), km: 4 },
      // 만성 이력(ACWR 신뢰)
      { run_date: ago(14), km: 4 },
      { run_date: ago(21), km: 4 },
    ];
    const g = guidanceFor(consec, { used: 100, max: 600 });
    expect(titles(g)).toContain('4일 연속 달렸어요');
  });
});
