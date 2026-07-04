// ─── 러닝 리마인더 — OS 정시 로컬 알림(2026-07-05 신뢰 버그 수정) ─────────────
// 배경: notif_settings 의 '러닝 리마인더'는 설정 UI 와 계산 로직(dueNotifications)만
// 있고 OS 스케줄러가 없어, 앱이 닫혀 있으면 실제로는 울리지 않는 반쪽(거짓 약속)
// 이었다. expo-notifications 로 진짜 정시 발화를 구현한다.
//
// 설계(절제·정직):
//   - OS 스케줄 대상은 러닝 리마인더뿐. 주간 목표·교체 임박은 발화 시점의 상태
//     (진척·예측)를 미리 알 수 없어 억지 스케줄이 곧 노이즈가 된다 — 그 둘은
//     '앱을 열 때 안내'(dueNotifications → presentDue)로 정의하고 카피에 명시.
//   - 반복 트리거 대신 7일치 원샷 체인: '오늘 이미 달렸으면 오늘은 조용히'를
//     지키기 위해서다(달린 날 저녁에 "달려볼까요?"가 오면 신뢰가 깎인다).
//     오늘 런 여부는 스케줄 시점에만 알 수 있으므로 오늘 것만 조건부, 내일부터는
//     항상 잡는다(미래엔 아직 런이 없으니 참). 앱 활동(부팅·런 저장·설정 변경)
//     마다 체인을 갱신한다. 일주일 이상 앱을 안 열어도 7일은 커버된다.
//   - no-throw: 권한 거부·네이티브 결측(테스트/시뮬)에서도 조용히 no-op.

import {parseTime} from './notifications';

// ── 순수: 발화 시각 계산 ────────────────────────────────────────────
export const REMINDER_CHAIN_DAYS = 7;
export const REMINDER_ID_PREFIX = 'run_reminder_';

/**
 * 리마인더 체인의 발화 시각 목록(로컬). ranToday=true 거나 오늘 reminderTime 이
 * 이미 지났으면 오늘은 건너뛰고 내일부터 시작한다. 시각 문자열이 무효면 [].
 */
export function reminderFireDates(
  now: Date,
  reminderTime: string,
  ranToday: boolean,
  days: number = REMINDER_CHAIN_DAYS,
): Date[] {
  const hm = parseTime(reminderTime);
  if (!hm || !(now instanceof Date) || !Number.isFinite(now.getTime())) return [];
  const out: Date[] = [];
  const todayFire = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hm.h, hm.m, 0, 0);
  const startOffset = !ranToday && todayFire.getTime() > now.getTime() ? 0 : 1;
  for (let i = 0; i < days; i++) {
    const d = new Date(todayFire.getTime());
    d.setDate(d.getDate() + startOffset + i);
    out.push(d);
  }
  return out;
}

// ── IO: expo-notifications 스케줄 동기화 ────────────────────────────
// 네이티브 모듈은 지연 require — jest/시뮬 등 모듈 결측 환경에서 import 자체로
// 죽지 않게 하고, 모든 실패를 삼켜 false 를 돌려준다(리마인더는 절대 비차단).
type Scheduler = {
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  scheduleNotificationAsync(req: unknown): Promise<string>;
  requestPermissionsAsync(): Promise<{granted?: boolean; status?: string}>;
  setNotificationHandler(h: unknown): void;
};

function loadScheduler(): Scheduler | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as Scheduler;
  } catch {
    return null;
  }
}

let handlerSet = false;

/** 포그라운드에서도 배너로 표시(1회 설정). 모듈 결측 시 no-op. */
export function ensureForegroundHandler(mod: Scheduler | null = loadScheduler()): void {
  if (!mod || handlerSet) return;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    handlerSet = true;
  } catch {
    /* no-op */
  }
}

/**
 * 러닝 리마인더 체인을 현재 설정과 동기화한다.
 *  - enabled=false → 기존 체인 취소만.
 *  - enabled=true  → 체인 취소 후 reminderFireDates 로 다시 스케줄.
 * 반환: 스케줄된 개수(취소만 했으면 0). 모든 실패는 삼키고 0.
 */
export async function syncRunReminder(
  opts: {enabled: boolean; reminderTime: string; ranToday: boolean; now?: Date},
  mod: Scheduler | null = loadScheduler(),
): Promise<number> {
  if (!mod) return 0;
  try {
    for (let i = 0; i < REMINDER_CHAIN_DAYS; i++) {
      await mod.cancelScheduledNotificationAsync(`${REMINDER_ID_PREFIX}${i}`).catch(() => {});
    }
    if (!opts.enabled) return 0;
    const perm = await mod.requestPermissionsAsync().catch(() => null);
    if (perm && perm.granted === false && perm.status !== 'granted') return 0;
    const dates = reminderFireDates(opts.now ?? new Date(), opts.reminderTime, opts.ranToday);
    let n = 0;
    for (let i = 0; i < dates.length; i++) {
      await mod.scheduleNotificationAsync({
        identifier: `${REMINDER_ID_PREFIX}${i}`,
        content: {
          title: '오늘 달릴 시간이에요',
          body: '오늘은 아직 안 달렸어요. 가볍게 한 바퀴 어때요?',
        },
        trigger: {type: 'date', date: dates[i]},
      });
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}
