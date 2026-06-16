import {fmtTime, fmtPace, ymdLocal, getMonday, fmtKDate} from '../../lib/format';

describe('fmtTime', () => {
  test('under an hour → MM:SS', () => {
    expect(fmtTime(65)).toBe('01:05');
    expect(fmtTime(0)).toBe('00:00');
  });
  test('an hour or more → H:MM:SS', () => {
    expect(fmtTime(3661)).toBe('1:01:01');
  });
  test('비유한/음수 입력 → 00:00 (NaN:NaN 방지)', () => {
    expect(fmtTime(NaN)).toBe('00:00');
    expect(fmtTime(-5)).toBe('00:00');
    expect(fmtTime(Infinity)).toBe('00:00');
  });
});

describe('fmtPace', () => {
  test('meaningless distance guarded with --', () => {
    expect(fmtPace(0, 100)).toBe('--');
    expect(fmtPace(0.005, 100)).toBe('--');
  });
  test('비유한/0이하 시간 → 가짜 페이스 대신 --', () => {
    expect(fmtPace(1, 0)).toBe('--');
    expect(fmtPace(1, -10)).toBe('--');
    expect(fmtPace(1, NaN)).toBe('--');
    expect(fmtPace(NaN, 300)).toBe('--');
  });
  test("1km in 300s → 5'00\"", () => {
    expect(fmtPace(1, 300)).toBe("5'00\"");
  });
  test('formats as m\'ss"', () => {
    expect(fmtPace(1, 330)).toMatch(/^\d+'\d{2}"$/);
  });
});

describe('ymdLocal (audit#11 — local, not UTC)', () => {
  test('uses local calendar components', () => {
    const d = new Date(2026, 0, 5, 1, 30); // Jan 5 2026, 01:30 local
    expect(ymdLocal(d)).toBe('2026-01-05');
  });
  test('zero-pads month and day', () => {
    expect(ymdLocal(new Date(2026, 8, 9))).toBe('2026-09-09');
  });
  test('a 01:00-local run keeps its local date regardless of UTC offset', () => {
    const d = new Date(2026, 2, 15, 1, 0); // Mar 15 01:00 local
    // toISOString could roll to Mar 14 in positive-offset zones; ymdLocal must not.
    expect(ymdLocal(d)).toBe('2026-03-15');
  });
});

describe('getMonday', () => {
  test('a Wednesday maps back to that week Monday', () => {
    const wed = new Date(2026, 0, 7); // Wed Jan 7 2026
    const mon = getMonday(wed);
    expect(mon.getDay()).toBe(1);
    expect(ymdLocal(mon)).toBe('2026-01-05');
  });
  test('Sunday rolls back to the previous Monday (not forward)', () => {
    const sun = new Date(2026, 0, 11); // Sun Jan 11 2026
    const mon = getMonday(sun);
    expect(mon.getDay()).toBe(1);
    expect(ymdLocal(mon)).toBe('2026-01-05');
  });
  test('result is normalized to local midnight', () => {
    const mon = getMonday(new Date(2026, 0, 7, 18, 45, 12));
    expect(mon.getHours()).toBe(0);
    expect(mon.getMinutes()).toBe(0);
    expect(mon.getSeconds()).toBe(0);
  });
});

describe('fmtKDate', () => {
  test('valid ISO date → Korean parts', () => {
    expect(fmtKDate('2026-01-05')).toEqual({date: '1월 5일', day: '월', dateNum: '5'});
  });
  test('invalid input falls back to the raw string', () => {
    expect(fmtKDate('not-a-date')).toEqual({date: 'not-a-date', day: '', dateNum: ''});
  });
});
