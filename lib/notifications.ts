// ─── 리텐션 알림 결정 로직(Slice 8) ───────────────────────────────
// "지금 어떤 푸시 알림을 띄워야 하는가"를 입력 상태만으로 결정하는 순수 함수 +
// 알림 설정 영속(IO)을 한 곳에 모은다. 네이티브 0·백엔드 0:
//   - dueNotifications 는 어떤 device/시계/네이티브 모듈도 만지지 않는 순수 파생값.
//     now(Date) 와 state 만으로 결정되어 테스트가 전역 Date 모킹 없이 결정적이다.
//   - 실제 표시(로컬 알림)·스케줄·권한은 lib/pushMessaging(slice-8-fcm-native)의
//     얇은 네이티브 래퍼 책임이고, 여기서는 "무엇을" 보낼지만 정한다(계산/IO 분리).
//
// 기존 자산 재사용(중복 계산 금지):
//   - 교체 임박/초과 판단: lib/replacementForecast(ReplacementForecast) +
//     lib/recommendTrigger(shouldRecommendNextShoe). 마모/예측을 다시 계산하지 않는다.
//   - 주간 진척: lib/goals(weeklyProgress) 산출물(WeeklyProgress)을 입력으로 받는다.
//
// 보존(A8-1): 인앱 배지 설정(lib/settings 의 AlertSettings·K_ALERTS='settings_alerts')은
// 절대 건드리지 않는다. 푸시 알림 설정은 신규 키 'notif_settings' 에만 저장한다.
//
// 엣지 graceful(A8-5): 신발 0·런 0·lastRunISO null·forecast no_recent 등 결측 입력에서
// 예외/NaN 없이 안전하게 동작한다. 같은 날 같은 종류 알림은 1회만(A8-4, key 기반 dedup).

import AsyncStorage from '@react-native-async-storage/async-storage';
import {type ReplacementForecast} from './replacementForecast';
import {shouldRecommendNextShoe} from './recommendTrigger';
import {type WeeklyProgress} from './goals';
import {type WearShoe} from './wearModel';

// ─── 타입 ─────────────────────────────────────────────────────────
export type NotifType = 'shoe_replacement' | 'weekly_goal' | 'run_reminder';

// 표시할 알림 1건의 의도(intent). key 는 중복 방지용 안정 식별자 — 같은 날 같은
// 종류(신발 교체는 신발마다)에 대해 동일 key 가 나와 당일 1회만 표시되게 한다.
export interface NotificationIntent {
  type: NotifType;
  title: string;
  body: string;
  key: string;
}

// 푸시 알림 설정. 종류별 on/off + 러닝 리마인더 시각('HH:MM', 24h 로컬).
export interface NotifSettings {
  shoeReplacement: boolean;
  weeklyGoal: boolean;
  runReminder: boolean;
  reminderTime: string; // 'HH:MM'
}

// 한 신발 + 그 교체 예측(forecast 는 결측 가능 — 추정 불가 신발).
export interface ShoeForecast {
  shoe: WearShoe;
  forecast: ReplacementForecast | null | undefined;
}

// dueNotifications 의 입력 상태. 전부 상위(App)가 기존 lib 로 계산해 주입한다.
export interface NotifState {
  shoesWithForecast: ShoeForecast[];
  weekly: WeeklyProgress | null | undefined;
  lastRunISO: string | null;
  settings: NotifSettings;
}

// ─── 상수 ─────────────────────────────────────────────────────────
// 푸시 설정 영속 키. 인앱 배지(settings_alerts)와 별개의 신규 키(A8-1).
export const K_NOTIF_SETTINGS = 'notif_settings';

export const DEFAULT_REMINDER_TIME = '19:00';

export const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
  shoeReplacement: true,
  weeklyGoal: true,
  runReminder: true,
  reminderTime: DEFAULT_REMINDER_TIME,
};

// 'HH:MM' 24시간 표기(00:00 ~ 23:59) 검증.
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// 주간 목표 알림을 띄우는 요일 하한 — 월요일 시작 주에서 '금요일 이후'(금/토/일).
const WEEKLY_GOAL_MIN_DOW = 5; // ISO 요일: 월1 … 금5 토6 일7

// ─── 순수 헬퍼 ────────────────────────────────────────────────────

/** 유효한 Date 면 그것, 아니면 현재시각(now 미지정·손상 방어). */
function resolveNow(now: Date | undefined | null): Date {
  if (now instanceof Date && Number.isFinite(now.getTime())) return now;
  return new Date();
}

/** 로컬 달력 날짜 'YYYY-MM-DD'(타임존 안전 — 로컬 필드만 사용). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ISO 요일(월=1 … 일=7). 주 기준이 월요일(lib/goals)이라 일요일을 7로 둔다. */
function isoDayOfWeek(d: Date): number {
  const g = d.getDay(); // 0=일 … 6=토
  return g === 0 ? 7 : g;
}

/** 'HH:MM' → 자정 이후 분(分). 형식 불량이면 null. */
function timeToMinutes(s: string): number | null {
  const m = TIME_RE.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 신발 표시명 — 비어있으면 keep-going 보이스의 일반명으로 폴백. */
function shoeDisplayName(shoe: WearShoe | null | undefined): string {
  const n = typeof shoe?.name === 'string' ? shoe.name.trim() : '';
  return n || '러닝화';
}

/**
 * lastRunISO 가 todayYmd(로컬 'YYYY-MM-DD')와 같은 날인지.
 * 런 날짜 표준은 로컬 'YYYY-MM-DD'(lib/goals)라 날짜 부분 비교를 우선하고,
 * 전체 ISO 타임스탬프인 경우엔 로컬 날짜로 파싱해 한 번 더 비교한다(둘 중 하나만 맞아도 today).
 */
function ranToday(lastRunISO: string | null | undefined, todayYmd: string): boolean {
  if (typeof lastRunISO !== 'string' || !lastRunISO) return false;
  if (lastRunISO.slice(0, 10) === todayYmd) return true;
  const d = new Date(lastRunISO);
  if (Number.isFinite(d.getTime()) && localYmd(d) === todayYmd) return true;
  return false;
}

/** 결측·손상 설정을 기본값으로 정규화(부분 결손도 필드별 graceful). */
export function normalizeNotifSettings(
  s: Partial<NotifSettings> | null | undefined,
): NotifSettings {
  if (!s || typeof s !== 'object') return {...DEFAULT_NOTIF_SETTINGS};
  return {
    shoeReplacement:
      typeof s.shoeReplacement === 'boolean'
        ? s.shoeReplacement
        : DEFAULT_NOTIF_SETTINGS.shoeReplacement,
    weeklyGoal:
      typeof s.weeklyGoal === 'boolean' ? s.weeklyGoal : DEFAULT_NOTIF_SETTINGS.weeklyGoal,
    runReminder:
      typeof s.runReminder === 'boolean' ? s.runReminder : DEFAULT_NOTIF_SETTINGS.runReminder,
    reminderTime:
      typeof s.reminderTime === 'string' && TIME_RE.test(s.reminderTime)
        ? s.reminderTime
        : DEFAULT_NOTIF_SETTINGS.reminderTime,
  };
}

/** 같은 key 는 1건만 남긴다(A8-4 — 당일 같은 종류 중복 표시 금지). */
function dedupeByKey(intents: NotificationIntent[]): NotificationIntent[] {
  const seen = new Set<string>();
  const out: NotificationIntent[] = [];
  for (const it of intents) {
    if (seen.has(it.key)) continue;
    seen.add(it.key);
    out.push(it);
  }
  return out;
}

// ─── 순수 결정 로직 ───────────────────────────────────────────────
/**
 * 지금(now) 표시해야 할 알림 의도 목록을 반환한다(순수 함수).
 *
 *   shoe_replacement — forecast.reason==='overdue' 또는 교체 임박
 *     (shouldRecommendNextShoe) 인 신발마다 1건(신발명 포함). 토글 shoeReplacement.
 *   weekly_goal      — now 가 금요일 이후(금/토/일)이고 weekly.percent<100 일 때 1건.
 *     토글 weeklyGoal.
 *   run_reminder     — now 시각이 settings.reminderTime 이후이고 오늘 런이 없을 때 1건.
 *     토글 runReminder.
 *
 * 각 종류는 settings 토글이 off 면 제외된다. 같은 날 같은 key 는 1회만(A8-4).
 * 결측·빈 입력(신발0·런0·lastRunISO null·no_recent)에서 예외/NaN 없이 빈 목록을
 * 낼 수 있다(A8-5). 입력(state)은 읽기만 한다.
 */
export function dueNotifications(state: NotifState, now: Date): NotificationIntent[] {
  const intents: NotificationIntent[] = [];
  if (!state || typeof state !== 'object') return intents;

  const nowDate = resolveNow(now);
  const today = localYmd(nowDate);
  const settings = normalizeNotifSettings(state.settings);

  // 1) 신발 교체 — 임박/초과 신발마다 1건(신발명 포함).
  if (settings.shoeReplacement) {
    const shoes = Array.isArray(state.shoesWithForecast) ? state.shoesWithForecast : [];
    for (const entry of shoes) {
      const forecast = entry?.forecast;
      if (!forecast) continue;
      const overdue = forecast.reason === 'overdue';
      const imminent = shouldRecommendNextShoe(forecast);
      if (!overdue && !imminent) continue;

      const shoe = entry?.shoe;
      const name = shoeDisplayName(shoe);
      const id = shoe?.id != null ? String(shoe.id) : name;
      intents.push({
        type: 'shoe_replacement',
        title: '러닝화 교체 시점',
        body: overdue
          ? `${name} 수명을 다 썼어요. 새 신발로 갈아신고 부상 없이 계속 달려요.`
          : `${name} 교체가 다가오고 있어요. 다음 러닝화를 미리 준비해볼까요?`,
        key: `shoe_replacement:${id}:${today}`,
      });
    }
  }

  // 2) 주간 목표 — 금요일 이후 + 아직 목표 미달(percent<100).
  if (settings.weeklyGoal) {
    const weekly = state.weekly;
    const percent =
      weekly && typeof weekly.percent === 'number' && Number.isFinite(weekly.percent)
        ? weekly.percent
        : null;
    if (
      percent != null &&
      percent < 100 &&
      isoDayOfWeek(nowDate) >= WEEKLY_GOAL_MIN_DOW
    ) {
      const pct = Math.max(0, Math.round(percent));
      intents.push({
        type: 'weekly_goal',
        title: '이번 주 목표',
        body: `이번 주 목표의 ${pct}%를 달렸어요. 주말에 조금만 더 달리면 채울 수 있어요!`,
        key: `weekly_goal:${today}`,
      });
    }
  }

  // 3) 러닝 리마인더 — 리마인더 시각 이후 + 오늘 런 없음.
  if (settings.runReminder) {
    const reminderMin = timeToMinutes(settings.reminderTime);
    const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();
    if (reminderMin != null && nowMin >= reminderMin && !ranToday(state.lastRunISO, today)) {
      intents.push({
        type: 'run_reminder',
        title: '오늘 달릴 시간이에요',
        body: '오늘은 아직 안 달렸어요. 가볍게 한 바퀴 어때요?',
        key: `run_reminder:${today}`,
      });
    }
  }

  return dedupeByKey(intents);
}

// ─── 설정 IO(얇은 영속 레이어) ────────────────────────────────────
/** 영속 JSON → NotifSettings. 손상/누락은 기본값으로 정규화(graceful). */
export function parseNotifSettings(raw: string | null | undefined): NotifSettings {
  if (!raw) return {...DEFAULT_NOTIF_SETTINGS};
  try {
    return normalizeNotifSettings(JSON.parse(raw));
  } catch {
    return {...DEFAULT_NOTIF_SETTINGS};
  }
}

/** 'notif_settings' 키를 읽어 정규화된 설정 반환. 실패해도 기본값으로 폴백. */
export async function getNotifSettings(): Promise<NotifSettings> {
  try {
    const raw = await AsyncStorage.getItem(K_NOTIF_SETTINGS);
    return parseNotifSettings(raw);
  } catch {
    return {...DEFAULT_NOTIF_SETTINGS};
  }
}

/** 설정을 정규화해 'notif_settings' 키에 저장. 영속 실패는 삼킨다(메모리 유지). */
export async function setNotifSettings(s: NotifSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(
      K_NOTIF_SETTINGS,
      JSON.stringify(normalizeNotifSettings(s)),
    );
  } catch {
    /* 영속 실패는 삼킨다 */
  }
}
