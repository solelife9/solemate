import {fmtTime, fmtPace, ymdLocal, ymLocal, getMonday, fmtKDate} from '../../lib/format';

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

describe('ymLocal (YYYY-MM — local, not UTC)', () => {
  test('local calendar month, zero-padded', () => {
    expect(ymLocal(new Date(2026, 0, 5, 1, 30))).toBe('2026-01');
    expect(ymLocal(new Date(2026, 8, 9))).toBe('2026-09');
  });
  test('a 01:00-local date keeps its local month regardless of UTC offset', () => {
    // 월 첫날 01:00 — UTC 환산 시 전월로 굴러갈 수 있으나 로컬 월을 유지해야.
    expect(ymLocal(new Date(2026, 2, 1, 1, 0))).toBe('2026-03');
  });
  test('byte-identical to ymdLocal on the shared YYYY-MM prefix (no desync)', () => {
    // 옛 인라인 빌더(HallOfFameScreen.yearMonthOf)와 동일 출력임을 고정.
    for (const d of [new Date(2026, 0, 1), new Date(2026, 11, 31, 23, 59), new Date(2025, 5, 15)]) {
      expect(ymLocal(d)).toBe(ymdLocal(d).slice(0, 7));
    }
  });
});

describe('fmtTime ↔ duration input round-trip (HistoryScreen 프리필 재사용 보존)', () => {
  // HistoryScreen.fmtDurationInput 이 fmtTime 으로 단일화된 뒤에도, 초→문자열→초
  // 라운드트립이 보존돼야 함을 format 층에서 고정한다(1시간 이상 H:MM:SS 포함).
  // parseDurationInput 과 동일한 파싱 규칙(2분절 MM:SS / 3분절 H:MM:SS)을 재현.
  const parse = (text: string): number => {
    const t = (text || '').trim();
    if (!t) return 0;
    if (t.includes(':')) {
      const parts = t.split(':');
      const n = (x: string) => { const v = parseInt(x, 10); return Number.isFinite(v) ? v : 0; };
      if (parts.length >= 3) return Math.max(0, n(parts[0]) * 3600 + n(parts[1]) * 60 + n(parts[2]));
      return Math.max(0, n(parts[0]) * 60 + n(parts[1]));
    }
    const mins = parseFloat(t);
    return Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0;
  };
  test('sub-hour 값 라운드트립', () => {
    for (const s of [330, 65, 2705, 59, 3599]) expect(parse(fmtTime(s))).toBe(s);
  });
  test('1시간 이상(H:MM:SS) 값도 라운드트립 — 옛 M:SS 형식이 깨뜨리던 케이스', () => {
    for (const s of [3900, 3661, 7325, 3600]) expect(parse(fmtTime(s))).toBe(s);
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
