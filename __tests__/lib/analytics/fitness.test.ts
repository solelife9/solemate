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

  // 2026-08-04: **심박 없이는 VO2max 를 표시하지 않는다**(가민·애플과 같은 기준).
  // 페이스 추정치(vdotPace)는 임계페이스 역산에 여전히 쓰이므로 별도 필드로 살아 있다.
  test('5K 20:00 한 건 — 심박이 없으면 표시값은 0, 계산용 VDOT 는 ≈49.8', () => {
    const f = fitnessSummary([{ km: 5, durationS: 20 * 60, runDate: '2026-06-30' }], '2026-06-30');
    expect(f.vo2max).toBe(0);                    // 표시하지 않는다
    expect(f.vo2maxSource).toBe('none');
    expect(f.vo2maxNeedsHealth).toBe(true);      // "달렸는데 심박이 없다" → 연동 안내
    expect(f.vdotPace).toBeCloseTo(49.8, 1);     // 계산용 값은 그대로
    expect(f.thresholdPaceSec).toBeGreaterThan(0);
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

// ─── 심박 유무가 표시를 가른다 (2026-08-04) ────────────────────────────────────
// 민우님 결정: "우리도 심박 없으면 보여주지 마" — 가민·애플과 같은 기준이다.
// 페이스로도 추정은 되지만 '레이스급 최대 노력'을 가정한 참고치라, 숫자로 내보내면
// 측정값처럼 읽힌다. 정책을 **데이터 계층에서** 막는다 — 화면마다 조건을 되풀이하면
// 언젠가 한 곳이 샌다(공유 카드·공개 프로필도 이 값을 그대로 쓴다).
describe('VO2max 표시 정책', () => {
  const day = (i: number) => {
    const d = new Date(Date.UTC(2026, 6, 1));
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  };
  /** 10km 를 5'00"/km 로, 평균심박 150 으로 달린 런 5건(안정시 50·관측최대 190). */
  const hrRuns = Array.from({length: 5}, (_, i) => ({
    km: 10, durationS: 3000, runDate: day(i), hrAvg: 150, hrRest: 50, hrMax: 190,
  }));

  test('심박이 있으면 표시한다 — source=hr', () => {
    const f = fitnessSummary(hrRuns, day(5));
    expect(f.vo2max).toBeGreaterThan(0);
    expect(f.vo2maxSource).toBe('hr');
    expect(f.vo2maxSamples).toBe(5);
    expect(f.vo2maxNeedsHealth).toBe(false); // 이미 보여주고 있으니 안내할 이유가 없다
  });

  test('심박이 빠지면 같은 런이어도 표시하지 않는다', () => {
    const noHr = hrRuns.map(r => ({km: r.km, durationS: r.durationS, runDate: r.runDate}));
    const f = fitnessSummary(noHr, day(5));
    expect(f.vo2max).toBe(0);
    expect(f.vo2maxSource).toBe('none');
    expect(f.vo2maxNeedsHealth).toBe(true);
  });

  test('달린 적이 없으면 연동 안내도 하지 않는다 — 권할 근거가 없다', () => {
    const f = fitnessSummary([], '2026-07-06');
    expect(f.vo2max).toBe(0);
    expect(f.vo2maxNeedsHealth).toBe(false);
  });

  test('심박이 없어도 부하 계산은 살아 있다 — 임계 페이스는 페이스 VDOT 에서 나온다', () => {
    const noHr = hrRuns.map(r => ({km: r.km, durationS: r.durationS, runDate: r.runDate}));
    const f = fitnessSummary(noHr, day(5));
    expect(f.vdotPace).toBeGreaterThan(0);
    expect(f.thresholdPaceSec).toBeGreaterThan(0);
    expect(f.pmc.length).toBeGreaterThan(0);
  });
});
