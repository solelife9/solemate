// ============================================================================
// lib/runNotification.ts — 러닝 중 잠금화면 지표 알림 (안드로이드)
//
// 왜: 안드로이드에서 폰을 주머니에 넣고 달리면, 잠금을 풀기 전에는 얼마나 왔는지 볼 방법이
// 없다. 아이폰은 워치가 그 자리를 메우지만 안드로이드엔 워치가 없다(민우님 2026-08-05
// "키고 앱 켜고 잠금화면 누르면 지표 나오게"). 안드로이드에서 이걸 하는 정석은 **상시 알림**
// 이다 — 잠금화면에 그대로 뜨고, NRC·스트라바가 쓰는 방식이다.
//
// ── 왜 위치 서비스 알림을 고쳐 쓰지 않는가 (중요) ────────────────────────────
// 이미 '러닝 기록 중' 알림이 하나 떠 있다(expo-location 의 포그라운드 서비스). 거기에 지표를
// 실으면 알림 하나로 끝나니 그게 자연스러워 보인다. **그런데 그렇게 하면 러닝이 깨진다.**
//
// 그 알림 문구를 바꾸려면 startLocationUpdatesAsync 를 다시 불러 옵션을 갱신해야 하는데,
// expo-location 의 안드로이드 구현(LocationTaskConsumer.setOptions)이 이렇다:
//
//     override fun setOptions(options: Map<String, Any>) {
//       // Restart location updates
//       stopLocationUpdates()
//       startLocationUpdates()
//       ...
//
// 즉 **문구를 갱신할 때마다 GPS 수집이 통째로 재시작된다.** 몇 초마다 그러면 fix 를 놓치고
// 거리가 샌다 — Iron Law(러닝 중 거리/시간 유실 금지) 정면 위반이다. 그래서 위치 서비스
// 알림은 손대지 않고(정적 문구 유지), **GPS 와 무관한 별도 알림**을 우리가 직접 띄운다.
// 알림이 둘이 되는 건 감수한다 — 기록을 지키는 값으로는 싸다.
//
// ── 안전 규약 ────────────────────────────────────────────────────────────────
// 이 모듈의 모든 부작용 함수는 **절대 throw 하지 않는다.** 알림은 편의 기능이고 러닝 기록은
// 본질이다. 알림 실패가 러닝 경로에 예외를 던져 올라가는 일은 없어야 한다.
// 네이티브 모듈은 지연 require 한다(lib/localReminder 와 같은 규약) — jest·시뮬처럼 모듈이
// 없는 환경에서 import 자체로 죽지 않게.
// ============================================================================
import {Platform} from 'react-native';

/** 알림에 실을 러닝 상태(표시에 필요한 것만 — 엔진 타입에 의존하지 않는다). */
export interface RunNotificationState {
  /** 누적 거리(km). */
  km: number;
  /** 경과 시간(초). 일시정지 시간은 이미 빠진 값. */
  elapsedSec: number;
  /** 평균 페이스(초/km). 없으면 null. */
  avgPaceSecPerKm: number | null;
  /** 일시정지(수동·자동 무관) 중인가. */
  paused: boolean;
  /** 신발 이름. 없으면 생략. */
  shoeName?: string;
}

/** 표시 단위 — 저장은 항상 km, 표시만 바꾼다(lib/units 규약과 동일). */
export type RunNotificationUnit = 'km' | 'mi';

const KM_PER_MI = 1.609344;

/** 초 → 'H:MM:SS' 또는 'M:SS'. 잠금화면에서 한눈에 읽히도록 시는 있을 때만. */
function clock(sec: number): string {
  const t = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

/** 초/km → `5'24"`. 유효하지 않으면 null. */
function pace(secPerKm: number | null, unit: RunNotificationUnit): string | null {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return null;
  const per = unit === 'mi' ? secPerKm * KM_PER_MI : secPerKm;
  // 비현실적인 값은 아예 안 쓴다 — 출발 직후 1~2 fix 로 계산된 페이스는 쓰레기다.
  if (per > 3600) return null;
  const m = Math.floor(per / 60);
  const s = Math.round(per % 60);
  // 반올림이 60초가 되면 분으로 올린다("5'60\"" 방지).
  const mm = s === 60 ? m + 1 : m;
  const ss = s === 60 ? 0 : s;
  return `${mm}'${String(ss).padStart(2, '0')}"`;
}

/**
 * 알림에 띄울 제목·본문(순수). 잠금화면은 **두 줄이 전부**라 우선순위가 분명해야 한다:
 *   제목 = 거리 · 시간   (달리면서 제일 궁금한 둘)
 *   본문 = 평균 페이스 · 신발
 *
 * 일시정지 중이면 제목 앞에 그 사실을 붙인다 — 주머니에서 자동 일시정지가 걸렸는데 모르고
 * 계속 달리는 것이 가장 나쁜 경우다(그러면 거리가 안 쌓인다).
 */
export function buildRunNotificationText(
  state: RunNotificationState,
  unit: RunNotificationUnit = 'km',
): {title: string; body: string} {
  const km = Number.isFinite(state.km) && state.km > 0 ? state.km : 0;
  const dist = unit === 'mi' ? km / KM_PER_MI : km;
  const distText = `${dist.toFixed(2)}${unit}`;
  const head = `${distText} · ${clock(state.elapsedSec)}`;
  const title = state.paused ? `일시정지 · ${head}` : head;

  const parts: string[] = [];
  const p = pace(state.avgPaceSecPerKm, unit);
  if (p) parts.push(`평균 ${p}/${unit}`);
  if (state.shoeName) parts.push(state.shoeName);
  // 아직 보여 줄 게 없는 초반엔 상태를 말해 준다(빈 줄보다 낫다).
  const body = parts.length > 0 ? parts.join(' · ') : '기록 중 — 화면을 꺼도 계속 쌓여요';
  return {title, body};
}

// ── 부작용(안드로이드 전용) ─────────────────────────────────────────────────
// 아래는 실기기에서만 동작한다. iOS 는 잠금화면 지표를 워치·라이브 액티비티가 담당하므로
// 여기서는 아무것도 하지 않는다(중복 알림 금지).

const CHANNEL_ID = 'keego-run-live';
const NOTIFICATION_ID = 'keego-run-live';

interface NotificationsModule {
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  scheduleNotificationAsync(req: Record<string, unknown>): Promise<string>;
  dismissNotificationAsync(id: string): Promise<void>;
}

function mod(): NotificationsModule | null {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

let channelReady = false;

/** 채널 1회 준비. 소리·진동 없음 — 러닝 중 매초 울리면 재앙이다. */
async function ensureChannel(m: NotificationsModule): Promise<void> {
  if (channelReady) return;
  await m.setNotificationChannelAsync(CHANNEL_ID, {
    name: '러닝 중 기록',
    importance: 3, // DEFAULT — 잠금화면에 보이되 헤드업으로 튀어나오지 않는다.
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
  });
  channelReady = true;
}

/**
 * 러닝 지표 알림을 띄우거나 갱신한다(같은 id 로 덮어쓴다 → 알림이 쌓이지 않는다).
 * 안드로이드가 아니거나 모듈이 없으면 조용히 아무것도 하지 않는다. **절대 throw 하지 않는다.**
 */
export async function showRunNotification(
  state: RunNotificationState,
  unit: RunNotificationUnit = 'km',
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const m = mod();
  if (!m) return;
  try {
    await ensureChannel(m);
    const {title, body} = buildRunNotificationText(state, unit);
    await m.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: {
        title,
        body,
        sticky: true, // 스와이프로 지워지지 않는다 — 러닝이 끝날 때만 사라진다.
        autoDismiss: false,
        sound: null,
        priority: 'default',
        color: '#FF8000', // Keego Ember — 알림 아이콘 틴트(BRAND.md §4)
      },
      trigger: null, // 즉시
    });
  } catch {
    // 알림은 편의 기능이다. 실패해도 러닝은 계속된다.
  }
}

/** 러닝이 끝나면(저장·버리기 무관) 알림을 걷는다. **절대 throw 하지 않는다.** */
export async function clearRunNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const m = mod();
  if (!m) return;
  try {
    await m.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    /* 이미 없거나 모듈 결측 — 무시 */
  }
}

/** 테스트 전용 — 채널 준비 플래그 초기화. */
export function __resetRunNotificationChannel(): void {
  channelReady = false;
}
