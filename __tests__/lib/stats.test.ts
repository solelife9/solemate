import {
  sumKm,
  avgPaceLabel,
  totalTimeLabel,
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

describe('avgPaceLabel', () => {
  test('-- when no run has usable duration & distance', () => {
    expect(avgPaceLabel([{km: 0.05, duration: 100}, {km: 5, duration: 0}])).toBe('--');
  });
  test('averages per-run pace into a m\'ss" label', () => {
    // two runs both at 300 s/km → 5'00"
    expect(avgPaceLabel([{km: 2, duration: 600}, {km: 1, duration: 300}])).toBe("5'00\"");
  });
});

describe('totalTimeLabel', () => {
  test('-- when total duration is zero', () => {
    expect(totalTimeLabel([{duration: 0}])).toBe('--');
  });
  test('minutes only when under an hour', () => {
    expect(totalTimeLabel([{duration: 600}, {duration: 300}])).toBe('15m');
  });
  test('hours and minutes when over an hour', () => {
    expect(totalTimeLabel([{duration: 3700}])).toBe('1h 1m');
  });
});

describe('summaryOf', () => {
  test('produces km(1dp)/runs/pace/time summary', () => {
    const s = summaryOf([{km: 5, duration: 1500}, {km: 5, duration: 1500}]);
    expect(s).toEqual({km: '10.0', runs: 2, pace: "5'00\"", time: '50m'});
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
