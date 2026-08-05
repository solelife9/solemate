import {
  sumKm,
  avgPaceLabel,
  totalTimeLabel,
  durationLabel,
  durationParts,
  summaryOf,
  maxDayStreak,
  weekBuckets,
  monthBuckets,
  yearBuckets,
} from '../../lib/stats';

describe('sumKm', () => {
  test('sums parsed km, ignoring unparseable entries', () => {
    expect(sumKm([{km: 5}, {km: '3.5'}, {km: 'x'}, {km: undefined}])).toBeCloseTo(8.5, 5);
  });
  test('empty list → 0', () => {
    expect(sumKm([])).toBe(0);
  });
});

// 손상/스칼라 백엔드 응답(비배열·null)에서도 집계가 크래시하지 않아야 한다(견고함).
describe('비배열 입력 방어(크래시 없음)', () => {
  test.each([null, undefined, 42, 'oops', {}])('입력 %p → 안전 기본값', (bad: any) => {
    expect(sumKm(bad)).toBe(0);
    expect(avgPaceLabel(bad)).toBe('--');
    expect(totalTimeLabel(bad)).toBe('--');
    expect(summaryOf(bad)).toEqual({km: '0.0', runs: 0, pace: '--', time: '--'});
    expect(maxDayStreak(bad)).toBe(0);
    expect(weekBuckets(bad, new Date(2026, 5, 15))).toHaveLength(7);
    expect(yearBuckets(bad)).toHaveLength(12);
    expect(() => monthBuckets(bad, 2026, 5)).not.toThrow();
  });
  test('손상 요소(null) 섞여도 무시', () => {
    expect(sumKm([{km: 5}, null, undefined, {km: '2'}] as any)).toBeCloseTo(7, 5);
  });
});

describe('monthBuckets/yearBuckets — run_date 시간접미사 방어', () => {
  // 시간접미사('...T10:30')가 붙으면 new Date(rd+'T00:00:00')가 Invalid → NaN 버킷으로
  // 거리가 소실됐다. slice(0,10)로 형제 함수(recap/goals 등)와 동일하게 방어.
  test('YYYY-MM-DDTHH:mm 형식도 거리 집계에 포함', () => {
    const runs = [
      {run_date: '2026-03-05T10:30', km: 5},
      {run_date: '2026-03-20', km: 3},
    ] as any;
    expect(monthBuckets(runs, 2026, 2).reduce((a, b) => a + b, 0)).toBeCloseTo(8, 5); // 3월
    expect(yearBuckets(runs)[2]).toBeCloseTo(8, 5); // 3월 index
  });
});

describe('avgPaceLabel', () => {
  test('-- when no run has usable duration & distance', () => {
    expect(avgPaceLabel([{km: 0.05, duration: 100}, {km: 5, duration: 0}])).toBe('--');
  });
  test('averages per-run pace into a m\'ss" label', () => {
    // two runs both at 300 s/km → 5'00"
    expect(avgPaceLabel([{km: 2, duration: 600}, {km: 1, duration: 300}])).toBe("5'00\"");
  });
  test('거리 가중 평균(Σ시간/Σ거리) — 짧은 런을 과대가중하지 않는다', () => {
    // 1km@7'00"(420s) + 20km@5'00"(6000s): 단순평균이면 6'00"(오답).
    // 올바른 기간 페이스 = (420+6000)/(1+20) = 305.7 s/km → 5'06".
    expect(avgPaceLabel([{km: 1, duration: 420}, {km: 20, duration: 6000}])).toBe("5'06\"");
  });
});

describe('totalTimeLabel', () => {
  test('-- when total duration is zero', () => {
    expect(totalTimeLabel([{duration: 0}])).toBe('--');
  });
  test('minutes only when under an hour', () => {
    expect(totalTimeLabel([{duration: 600}, {duration: 300}])).toBe('15분');
  });
  test('hours and minutes when over an hour', () => {
    expect(totalTimeLabel([{duration: 3700}])).toBe('1시간 1분');
  });
});

describe('durationLabel — 서버 truth run_time(초) 포맷(audit#9/#10)', () => {
  test('0/음수/NaN → --', () => {
    expect(durationLabel(0)).toBe('--');
    expect(durationLabel(-5)).toBe('--');
    expect(durationLabel(NaN)).toBe('--');
  });
  test('한 시간 미만은 분만', () => {
    expect(durationLabel(900)).toBe('15분');
  });
  test('한 시간 이상은 시간+분', () => {
    expect(durationLabel(3700)).toBe('1시간 1분');
  });
  test('totalTimeLabel과 동일한 포맷을 낸다(공용 헬퍼)', () => {
    expect(durationLabel(3700)).toBe(totalTimeLabel([{duration: 3700}]));
  });
});

describe('summaryOf', () => {
  test('produces km(1dp)/runs/pace/time summary', () => {
    const s = summaryOf([{km: 5, duration: 1500}, {km: 5, duration: 1500}]);
    // 총 시간은 러닝기록 행과 같은 시계 표기(mm:ss) — 3000s → '50:00'(구 '50분'에서 변경).
    expect(s).toEqual({km: '10.0', runs: 2, pace: "5'00\"", time: '50:00'});
  });
  test('empty list → zeros & guards', () => {
    expect(summaryOf([])).toEqual({km: '0.0', runs: 0, pace: '--', time: '--'});
  });
});

describe('maxDayStreak', () => {
  test('longest consecutive-day run', () => {
    expect(maxDayStreak(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05'])).toBe(3);
  });
  test('duplicates collapse to a single day', () => {
    expect(maxDayStreak(['2026-01-01', '2026-01-01', '2026-01-02'])).toBe(2);
  });
  test('empty → 0', () => {
    expect(maxDayStreak([])).toBe(0);
  });
});

describe('weekBuckets (local-date daily, Mon..Sun)', () => {
  test('assigns each run to its local day-of-week slot', () => {
    const mon = new Date(2026, 0, 5); // Mon Jan 5 2026
    const runs = [
      {run_date: '2026-01-05', km: 3}, // Monday → index 0
      {run_date: '2026-01-05', km: 2}, // Monday → index 0
      {run_date: '2026-01-08', km: 4}, // Thursday → index 3
      {run_date: '2026-01-20', km: 9}, // outside the week → excluded
    ];
    const out = weekBuckets(runs, mon);
    expect(out).toHaveLength(7);
    expect(out[0]).toBeCloseTo(5, 5);
    expect(out[3]).toBeCloseTo(4, 5);
    expect(out[1]).toBe(0);
  });

  test('run_date 에 시간 접미사가 있어도 그 요일 슬롯에 잡힌다(월/년 버킷과 정규화 통일)', () => {
    const mon = new Date(2026, 0, 5); // Mon Jan 5 2026
    const runs = [
      {run_date: '2026-01-05T09:30:00', km: 3}, // Monday → index 0 (과거엔 === 실패로 누락)
      {run_date: '2026-01-08T18:00:00.000Z', km: 4}, // Thursday → index 3
    ];
    const out = weekBuckets(runs, mon);
    expect(out[0]).toBeCloseTo(3, 5);
    expect(out[3]).toBeCloseTo(4, 5);
  });
});

describe('monthBuckets (weekly buckets within a month)', () => {
  test('buckets by day-of-month into ceil(days/7) slots', () => {
    const runs = [
      {run_date: '2026-01-03', km: 2}, // week 1 (days 1-7)
      {run_date: '2026-01-10', km: 3}, // week 2 (days 8-14)
      {run_date: '2026-01-31', km: 4}, // last week
    ];
    const out = monthBuckets(runs, 2026, 0); // January 2026, 31 days → 5 buckets
    expect(out).toHaveLength(5);
    expect(out[0]).toBeCloseTo(2, 5);
    expect(out[1]).toBeCloseTo(3, 5);
    expect(out[4]).toBeCloseTo(4, 5);
  });
});

describe('yearBuckets (monthly, Jan..Dec)', () => {
  test('sums km into the run\'s local month', () => {
    const runs = [
      {run_date: '2026-01-15', km: 5},
      {run_date: '2026-01-20', km: 5},
      {run_date: '2026-12-25', km: 7},
    ];
    const out = yearBuckets(runs);
    expect(out).toHaveLength(12);
    expect(out[0]).toBeCloseTo(10, 5);
    expect(out[11]).toBeCloseTo(7, 5);
    expect(out[5]).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// durationParts — 지표 격자용 '숫자/단위' 분해 (2026-08-05)
//
// 왜: 신발 상세의 3×2 격자는 모든 칸이 `숫자(큰 글자) + 단위(작은 글자)` 꼴인데
// (`21`+`km`, `12`+`회`), 러닝 시간만 "1시간 47분"을 통째로 큰 글자로 넣고 있었다.
// 그래서 이 칸만 혼자 넓어져 360dp 폰(갤럭시 S10e)에서 칸 폭을 넘겨 두 줄로 떨어졌고,
// 그 줄바꿈이 첫 줄 높이를 밀어 격자 전체가 어긋났다.
// 단위를 작은 글자로 내리면 정보를 하나도 안 버리고 폭이 줄어든다.
// ────────────────────────────────────────────────────────────────────────────
describe('durationParts — 숫자와 단위를 나눠 준다', () => {
  test('1시간 이상이면 시간·분 두 조각', () => {
    expect(durationParts(3600 + 47 * 60)).toEqual([{n: '1', u: '시간'}, {n: '47', u: '분'}]);
  });

  test('1시간 미만이면 분 한 조각', () => {
    expect(durationParts(47 * 60)).toEqual([{n: '47', u: '분'}]);
  });

  test('정각이면 분은 0으로 남긴다(칸이 비지 않게)', () => {
    expect(durationParts(2 * 3600)).toEqual([{n: '2', u: '시간'}, {n: '0', u: '분'}]);
  });

  test('0·음수·비정상 입력은 빈 배열 — 호출부가 -- 를 쓴다', () => {
    expect(durationParts(0)).toEqual([]);
    expect(durationParts(-10)).toEqual([]);
    expect(durationParts(NaN)).toEqual([]);
  });

  test('durationLabel 과 같은 값을 말한다(두 표기가 어긋나지 않게)', () => {
    const sec = 5 * 3600 + 9 * 60 + 30;
    expect(durationParts(sec).map((p) => `${p.n}${p.u}`).join(' ')).toBe(durationLabel(sec).replace(/ /g, ' '));
  });
});
