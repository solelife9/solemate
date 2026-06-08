// lib/notifications — 리텐션 알림 결정 로직 + 설정 IO 테스트.
//
// 관찰 가능한 동작을 검증한다(Slice 8 시나리오):
//   S8-1  각 알림 종류의 트리거/비트리거 조건(신발교체·주간목표·러닝리마인더)
//   S8-2  설정 토글 off 시 해당 종류 제외
//   A8-4  같은 날 같은 종류는 key 기준 1회만(중복 방지)
//   A8-5  엣지(신발0·런0·lastRunISO null·no_recent)에서 빈 목록·무NaN·무예외
// 설정 IO 는 AsyncStorage 라운드트립 + 손상/누락 graceful 을 단언한다(A8-1 신규 키).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  dueNotifications,
  getNotifSettings,
  setNotifSettings,
  parseNotifSettings,
  normalizeNotifSettings,
  DEFAULT_NOTIF_SETTINGS,
  K_NOTIF_SETTINGS,
  type NotifSettings,
  type NotifState,
  type ShoeForecast,
} from '../../lib/notifications';
import type {ReplacementForecast} from '../../lib/replacementForecast';
import type {WeeklyProgress} from '../../lib/goals';

// ── 테스트 팩토리 ────────────────────────────────────────────────
const forecast = (over: Partial<ReplacementForecast>): ReplacementForecast => ({
  kmRemaining: 200,
  weeksRemaining: 8,
  etaISO: '2026-08-01T00:00:00.000Z',
  confidence: 'high',
  reason: 'ok',
  ...over,
});

const shoeEntry = (name: string, f: Partial<ReplacementForecast>, id = name): ShoeForecast => ({
  shoe: {id, name},
  forecast: forecast(f),
});

const weekly = (percent: number): WeeklyProgress => ({totalKm: percent / 10, percent});

const settings = (over: Partial<NotifSettings> = {}): NotifSettings => ({
  ...DEFAULT_NOTIF_SETTINGS,
  ...over,
});

const baseState = (over: Partial<NotifState> = {}): NotifState => ({
  shoesWithForecast: [],
  weekly: weekly(40),
  lastRunISO: null,
  settings: settings(),
  ...over,
});

// 결정적 시각 헬퍼(로컬). 2026-06-08 은 월요일, 2026-06-12 는 금요일.
const MON_0800 = new Date(2026, 5, 8, 8, 0); // 월요일 오전 — 시간/요일 트리거 모두 미충족
const FRI_2000 = new Date(2026, 5, 12, 20, 0); // 금요일 20:00 — 주간목표·리마인더 시각 충족

describe('dueNotifications — S8-1 트리거/비트리거', () => {
  test('shoe_replacement: overdue 신발에 신발명 포함 1건', () => {
    const state = baseState({
      shoesWithForecast: [shoeEntry('Nike Pegasus', {reason: 'overdue', kmRemaining: -10, weeksRemaining: 0})],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    const out = dueNotifications(state, MON_0800);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('shoe_replacement');
    expect(out[0].body).toContain('Nike Pegasus');
    expect(out[0].key).toContain('shoe_replacement');
  });

  test('shoe_replacement: 교체 임박(weeksRemaining≤3)도 트리거', () => {
    const state = baseState({
      shoesWithForecast: [shoeEntry('Hoka', {reason: 'ok', weeksRemaining: 2})],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    const out = dueNotifications(state, MON_0800);
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain('Hoka');
  });

  test('shoe_replacement: 여유 충분(weeks 큼)·no_recent 는 비트리거', () => {
    const state = baseState({
      shoesWithForecast: [
        shoeEntry('Asics', {reason: 'ok', weeksRemaining: 12}),
        shoeEntry('Saucony', {reason: 'no_recent', weeksRemaining: null, etaISO: null}),
      ],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    expect(dueNotifications(state, MON_0800)).toHaveLength(0);
  });

  test('weekly_goal: 금요일 이후 + percent<100 이면 트리거', () => {
    const state = baseState({
      weekly: weekly(60),
      settings: settings({shoeReplacement: false, runReminder: false}),
    });
    const out = dueNotifications(state, FRI_2000);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('weekly_goal');
    expect(out[0].body).toContain('60%');
  });

  test('weekly_goal: 주중(월요일)이면 비트리거', () => {
    const state = baseState({
      weekly: weekly(60),
      settings: settings({shoeReplacement: false, runReminder: false}),
    });
    expect(dueNotifications(state, MON_0800)).toHaveLength(0);
  });

  test('weekly_goal: 목표 달성(percent≥100)이면 비트리거', () => {
    const state = baseState({
      weekly: weekly(100),
      settings: settings({shoeReplacement: false, runReminder: false}),
    });
    expect(dueNotifications(state, FRI_2000)).toHaveLength(0);
  });

  test('run_reminder: 리마인더 시각 이후 + 오늘 런 없음이면 트리거', () => {
    const state = baseState({
      lastRunISO: '2026-06-01', // 오늘(6/12) 아님
      settings: settings({shoeReplacement: false, weeklyGoal: false, reminderTime: '19:00'}),
    });
    const out = dueNotifications(state, FRI_2000); // 20:00 ≥ 19:00
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('run_reminder');
  });

  test('run_reminder: 리마인더 시각 이전이면 비트리거', () => {
    const state = baseState({
      lastRunISO: null,
      settings: settings({shoeReplacement: false, weeklyGoal: false, reminderTime: '19:00'}),
    });
    expect(dueNotifications(state, MON_0800)).toHaveLength(0); // 08:00 < 19:00
  });

  test('run_reminder: 오늘 이미 달렸으면(lastRunISO==오늘) 비트리거', () => {
    const state = baseState({
      lastRunISO: '2026-06-12T18:30:00.000Z', // 오늘
      settings: settings({shoeReplacement: false, weeklyGoal: false, reminderTime: '19:00'}),
    });
    expect(dueNotifications(state, FRI_2000)).toHaveLength(0);
  });
});

describe('dueNotifications — S8-2 토글 off 제외', () => {
  // 전부 트리거되는 상태(금요일 20:00 + overdue 신발 + 미달성 주간 + 오늘 런 없음).
  const fullState = (over: Partial<NotifSettings> = {}): NotifState =>
    baseState({
      shoesWithForecast: [shoeEntry('Nike', {reason: 'overdue', kmRemaining: -5, weeksRemaining: 0})],
      weekly: weekly(50),
      lastRunISO: null,
      settings: settings(over),
    });

  test('모든 토글 on 이면 세 종류 모두 나온다', () => {
    const out = dueNotifications(fullState(), FRI_2000);
    expect(out.map(i => i.type).sort()).toEqual(['run_reminder', 'shoe_replacement', 'weekly_goal']);
  });

  test('shoeReplacement off → 교체 알림 제외', () => {
    const out = dueNotifications(fullState({shoeReplacement: false}), FRI_2000);
    expect(out.some(i => i.type === 'shoe_replacement')).toBe(false);
    expect(out.length).toBe(2);
  });

  test('weeklyGoal off → 주간목표 알림 제외', () => {
    const out = dueNotifications(fullState({weeklyGoal: false}), FRI_2000);
    expect(out.some(i => i.type === 'weekly_goal')).toBe(false);
  });

  test('runReminder off → 리마인더 제외', () => {
    const out = dueNotifications(fullState({runReminder: false}), FRI_2000);
    expect(out.some(i => i.type === 'run_reminder')).toBe(false);
  });

  test('모든 토글 off → 빈 목록', () => {
    const out = dueNotifications(
      fullState({shoeReplacement: false, weeklyGoal: false, runReminder: false}),
      FRI_2000,
    );
    expect(out).toEqual([]);
  });
});

describe('dueNotifications — A8-4 중복 방지(key)', () => {
  test('여러 신발이 임박해도 신발마다 key 가 달라 각 1건', () => {
    const state = baseState({
      shoesWithForecast: [
        shoeEntry('Nike', {reason: 'overdue', weeksRemaining: 0}, 's1'),
        shoeEntry('Hoka', {reason: 'ok', weeksRemaining: 1}, 's2'),
      ],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    const out = dueNotifications(state, MON_0800);
    expect(out).toHaveLength(2);
    expect(new Set(out.map(i => i.key)).size).toBe(2);
  });

  test('같은 신발 id 가 두 번 들어와도 key 중복 제거로 1건', () => {
    const dup = shoeEntry('Nike', {reason: 'overdue', weeksRemaining: 0}, 'same-id');
    const state = baseState({
      shoesWithForecast: [dup, {...dup}],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    const out = dueNotifications(state, MON_0800);
    expect(out).toHaveLength(1);
  });

  test('weekly_goal·run_reminder key 는 당일·종류로 안정적(같은 날 동일)', () => {
    const state = baseState({
      weekly: weekly(30),
      lastRunISO: null,
      settings: settings({shoeReplacement: false}),
    });
    const a = dueNotifications(state, FRI_2000);
    const b = dueNotifications(state, new Date(2026, 5, 12, 21, 0)); // 같은 날 다른 시각
    const keyOf = (t: string, arr: typeof a) => arr.find(i => i.type === t)?.key;
    expect(keyOf('weekly_goal', a)).toBe(keyOf('weekly_goal', b));
    expect(keyOf('run_reminder', a)).toBe(keyOf('run_reminder', b));
  });
});

describe('dueNotifications — A8-5 엣지 graceful', () => {
  test('신발0·런0·lastRunISO null·주중 → 빈 목록', () => {
    const out = dueNotifications(
      baseState({shoesWithForecast: [], weekly: weekly(0), lastRunISO: null}),
      MON_0800,
    );
    expect(out).toEqual([]);
  });

  test('forecast 결측/no_recent 신발 → 교체 알림 없음', () => {
    const state = baseState({
      shoesWithForecast: [
        {shoe: {id: 'a', name: 'A'}, forecast: null},
        {shoe: {id: 'b', name: 'B'}, forecast: undefined},
        shoeEntry('C', {reason: 'no_recent', weeksRemaining: null, etaISO: null}),
      ],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    expect(dueNotifications(state, FRI_2000)).toEqual([]);
  });

  test('weekly null·percent NaN 에서도 예외/NaN 없이 동작', () => {
    const nanWeekly = {totalKm: NaN, percent: NaN} as WeeklyProgress;
    const out = dueNotifications(
      baseState({weekly: nanWeekly, settings: settings({shoeReplacement: false, runReminder: false})}),
      FRI_2000,
    );
    expect(out).toEqual([]); // NaN percent 는 트리거하지 않음
    expect(() =>
      dueNotifications(baseState({weekly: null}), FRI_2000),
    ).not.toThrow();
  });

  test('이름 없는 신발도 폴백명으로 body 생성(빈/NaN 없음)', () => {
    const state = baseState({
      shoesWithForecast: [{shoe: {id: 'x'}, forecast: forecast({reason: 'overdue', weeksRemaining: 0})}],
      settings: settings({weeklyGoal: false, runReminder: false}),
    });
    const out = dueNotifications(state, MON_0800);
    expect(out).toHaveLength(1);
    expect(out[0].body).toContain('러닝화');
    expect(out[0].body).not.toContain('NaN');
  });

  test('잘못된 reminderTime(형식 불량)은 기본값으로 정규화되어 동작', () => {
    const state = baseState({
      lastRunISO: null,
      settings: settings({shoeReplacement: false, weeklyGoal: false, reminderTime: 'bad'}),
    });
    // 'bad' → DEFAULT '19:00' 정규화. 20:00 이므로 트리거.
    expect(dueNotifications(state, FRI_2000)).toHaveLength(1);
  });

  test('null state / 잘못된 now 에도 예외 없이 빈 목록 가능', () => {
    // @ts-expect-error 의도적 결측 입력
    expect(dueNotifications(null, MON_0800)).toEqual([]);
    // @ts-expect-error 잘못된 now → 내부 resolveNow 폴백(예외 없음)
    expect(() => dueNotifications(baseState(), 'not-a-date')).not.toThrow();
  });
});

describe('normalizeNotifSettings / parseNotifSettings (순수 정규화)', () => {
  test('결측/손상은 기본값으로', () => {
    expect(normalizeNotifSettings(null)).toEqual(DEFAULT_NOTIF_SETTINGS);
    expect(normalizeNotifSettings({})).toEqual(DEFAULT_NOTIF_SETTINGS);
    expect(parseNotifSettings(null)).toEqual(DEFAULT_NOTIF_SETTINGS);
    expect(parseNotifSettings('{not json')).toEqual(DEFAULT_NOTIF_SETTINGS);
  });

  test('부분 결손은 필드별 graceful, 잘못된 시각은 기본값', () => {
    expect(
      normalizeNotifSettings({shoeReplacement: false, reminderTime: '25:99'}),
    ).toEqual({
      shoeReplacement: false,
      weeklyGoal: true,
      runReminder: true,
      reminderTime: DEFAULT_NOTIF_SETTINGS.reminderTime,
    });
  });

  test('유효한 시각은 보존', () => {
    expect(normalizeNotifSettings({reminderTime: '07:05'}).reminderTime).toBe('07:05');
  });
});

describe('설정 IO (AsyncStorage 라운드트립, A8-1 신규 키)', () => {
  test('set→get 라운드트립으로 값이 보존된다', async () => {
    await AsyncStorage.clear();
    const s = settings({weeklyGoal: false, reminderTime: '06:30'});
    await setNotifSettings(s);
    expect(await getNotifSettings()).toEqual(s);
  });

  test('신규 키 notif_settings 에 저장 — 인앱 배지 키(settings_alerts) 불간섭(A8-1)', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('settings_alerts', JSON.stringify({enabled: true, thresholdPct: 90}));
    await setNotifSettings(settings({runReminder: false}));
    // notif_settings 에 기록되고, 기존 settings_alerts 는 그대로 보존된다.
    expect(await AsyncStorage.getItem(K_NOTIF_SETTINGS)).toBeTruthy();
    expect(JSON.parse((await AsyncStorage.getItem('settings_alerts'))!)).toEqual({
      enabled: true,
      thresholdPct: 90,
    });
  });

  test('저장값 없으면 기본값 반환', async () => {
    await AsyncStorage.clear();
    expect(await getNotifSettings()).toEqual(DEFAULT_NOTIF_SETTINGS);
  });

  test('손상 JSON 영속 시 기본값으로 graceful', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(K_NOTIF_SETTINGS, '{corrupt');
    expect(await getNotifSettings()).toEqual(DEFAULT_NOTIF_SETTINGS);
  });
});
