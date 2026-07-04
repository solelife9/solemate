/**
 * 러닝 리마인더 OS 체인(2026-07-05 신뢰 버그 수정) 계약:
 *  1) reminderFireDates — 오늘 시각 전+미러닝이면 오늘부터, 달렸거나 지났으면 내일부터 7일.
 *  2) 무효 시각/무효 now → 빈 목록(no-throw).
 *  3) syncRunReminder — off 면 취소만, on 이면 취소 후 7건 스케줄. 권한 거부 시 0건.
 *  4) 모듈 결측(null) → 0 (절대 비차단).
 *
 * @format
 */
import {reminderFireDates, syncRunReminder, REMINDER_CHAIN_DAYS, REMINDER_ID_PREFIX} from '../../lib/localReminder';

const at = (h: number, m: number) => new Date(2026, 6, 5, h, m); // 2026-07-05 로컬

describe('reminderFireDates', () => {
  test('시각 전 + 오늘 안 달림 → 오늘부터 7일', () => {
    const d = reminderFireDates(at(9, 0), '19:00', false);
    expect(d).toHaveLength(REMINDER_CHAIN_DAYS);
    expect(d[0].getDate()).toBe(5);
    expect(d[0].getHours()).toBe(19);
    expect(d[6].getDate()).toBe(11);
  });
  test('오늘 이미 달림 → 내일부터', () => {
    const d = reminderFireDates(at(9, 0), '19:00', true);
    expect(d[0].getDate()).toBe(6);
  });
  test('시각이 이미 지남 → 내일부터', () => {
    const d = reminderFireDates(at(20, 0), '19:00', false);
    expect(d[0].getDate()).toBe(6);
  });
  test('무효 시각 → 빈 목록', () => {
    expect(reminderFireDates(at(9, 0), '25:99', false)).toEqual([]);
    expect(reminderFireDates(new Date(NaN), '19:00', false)).toEqual([]);
  });
});

describe('syncRunReminder', () => {
  const fakeMod = () => {
    const cancelled: string[] = [];
    const scheduled: any[] = [];
    return {
      cancelled, scheduled,
      cancelScheduledNotificationAsync: jest.fn(async (id: string) => {cancelled.push(id);}),
      scheduleNotificationAsync: jest.fn(async (req: any) => {scheduled.push(req); return req.identifier;}),
      requestPermissionsAsync: jest.fn(async () => ({granted: true, status: 'granted'})),
      setNotificationHandler: jest.fn(),
    };
  };
  test('on → 기존 체인 취소 후 7건 스케줄(오늘 시각 전, id 안정)', async () => {
    const mod = fakeMod();
    const n = await syncRunReminder({enabled: true, reminderTime: '19:00', ranToday: false, now: at(9, 0)}, mod as any);
    expect(n).toBe(REMINDER_CHAIN_DAYS);
    expect(mod.cancelled).toHaveLength(REMINDER_CHAIN_DAYS);
    expect(mod.scheduled[0].identifier).toBe(`${REMINDER_ID_PREFIX}0`);
    expect(mod.scheduled[0].content.title).toContain('달릴');
    expect(mod.scheduled[0].trigger.date.getHours()).toBe(19);
  });
  test('off → 취소만, 스케줄 0', async () => {
    const mod = fakeMod();
    const n = await syncRunReminder({enabled: false, reminderTime: '19:00', ranToday: false, now: at(9, 0)}, mod as any);
    expect(n).toBe(0);
    expect(mod.cancelled).toHaveLength(REMINDER_CHAIN_DAYS);
    expect(mod.scheduled).toHaveLength(0);
  });
  test('권한 거부 → 0건(no-throw)', async () => {
    const mod = fakeMod();
    mod.requestPermissionsAsync = jest.fn(async () => ({granted: false, status: 'denied'}));
    const n = await syncRunReminder({enabled: true, reminderTime: '19:00', ranToday: false, now: at(9, 0)}, mod as any);
    expect(n).toBe(0);
    expect(mod.scheduled).toHaveLength(0);
  });
  test('모듈 결측 → 0(비차단)', async () => {
    const n = await syncRunReminder({enabled: true, reminderTime: '19:00', ranToday: false, now: at(9, 0)}, null);
    expect(n).toBe(0);
  });
});
