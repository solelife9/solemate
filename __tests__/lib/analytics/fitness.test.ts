import { thresholdPaceSec, fitnessSummary } from '../../../lib/analytics/fitness';

describe('thresholdPaceSec (VDOT → 임계페이스, Daniels)', () => {
  test('VDOT 50 → 255s (4:15/km, Daniels 표 일치)', () => {
    expect(thresholdPaceSec(50)).toBe(255);
  });
  test('VDOT 60 → 220s (3:40/km)', () => {
    expect(thresholdPaceSec(60)).toBe(220);
  });
  test('체력 높을수록 임계페이스 빠르다(작다)', () => {
    expect(thresholdPaceSec(60)).toBeLessThan(thresholdPaceSec(45));
  });
  test('비유효는 0', () => {
    expect(thresholdPaceSec(0)).toBe(0);
    expect(thresholdPaceSec(-5)).toBe(0);
  });
});

describe('fitnessSummary (런 히스토리 → 체력 종합)', () => {
  test('표본 없으면 0 + hasData=false', () => {
    const f = fitnessSummary([], '2026-06-30');
    expect(f.vo2max).toBe(0);
    expect(f.hasData).toBe(false);
    expect(f.pmc).toEqual([]);
  });

  test('5K 20:00 한 건 → VO2max≈49.8 + 등급/폼 라벨', () => {
    const f = fitnessSummary([{ km: 5, durationS: 20 * 60, runDate: '2026-06-30' }], '2026-06-30');
    expect(f.vo2max).toBeCloseTo(49.8, 1);
    expect(f.vo2maxLabel).toBe('우수');
    expect(f.hasData).toBe(true);
    expect(f.pmc.length).toBeGreaterThan(0);
    // 단일 하드런 직후 → 피로(ATL)가 체력(CTL)보다 높아 폼(TSB) 음수.
    expect(f.tsb).toBeLessThanOrEqual(0);
  });

  test('꾸준히 쌓고 테이퍼 → 폼(TSB) 양수로 전환', () => {
    const runs: { km: number; durationS: number; runDate: string }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2026, 4, 1)); d.setUTCDate(d.getUTCDate() + i);
      runs.push({ km: 10, durationS: 50 * 60, runDate: d.toISOString().slice(0, 10) });
    }
    // 마지막 런 5/30, 그 뒤 10일 휴식 → 6/09 시점 폼 양수.
    const f = fitnessSummary(runs, '2026-06-09');
    expect(f.atl).toBeLessThan(f.ctl);
    expect(f.tsb).toBeGreaterThan(0);
  });

  test('HR(평균/최대/안정) 있으면 TRIMP 경로로 부하 산출(런 거리 0이어도 부하>0)', () => {
    // 거리/시간은 VDOT 산출용; 부하는 HR 기반이라 거리 없이도 PMC 가 움직인다.
    const f = fitnessSummary(
      [{ km: 0, durationS: 3600, runDate: '2026-06-30', hrAvg: 150, hrMax: 190, hrRest: 50 }],
      '2026-06-30',
    );
    expect(f.pmc.length).toBeGreaterThan(0);
    expect(f.ctl).toBeGreaterThan(0); // TRIMP 부하가 들어가 체력 누적 시작
  });
});
