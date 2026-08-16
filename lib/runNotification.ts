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

// ⚠️ **채널 id 에 버전을 붙인다.** 안드로이드는 채널이 한 번 만들어지면 이름·설명 말고는
// 코드로 못 바꾼다(중요도·소리·진동 전부 불변). v1(`keego-run-live`)은 importance 3
// (DEFAULT)으로 만들어졌고, DEFAULT 는 **정의상 소리를 낸다** — 아래 §무음 참조.
// 설정을 고치려면 새 id 로 만드는 수밖에 없다. 다음에 또 고칠 일이 생기면 v3 를 만든다.
const CHANNEL_ID = 'keego-run-live-v2';
/** v1 — importance 3 이라 3초마다 알림음이 울렸다. 남겨 두면 설정 화면에 유령으로 남는다. */
const LEGACY_CHANNEL_IDS = ['keego-run-live'];
const NOTIFICATION_ID = 'keego-run-live';

interface NotificationsModule {
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  scheduleNotificationAsync(req: Record<string, unknown>): Promise<string>;
  dismissNotificationAsync(id: string): Promise<void>;
  /** 구 채널 제거용(2026-08-17). 없는 버전도 있어 선택 속성으로 둔다. */
  deleteNotificationChannelAsync?(id: string): Promise<void>;
  /** 알림 액션 버튼 묶음 등록(2026-08-08). 안드로이드에서 알림 하단 버튼으로 뜬다. */
  setNotificationCategoryAsync(
    id: string,
    actions: {identifier: string; buttonTitle: string; options?: Record<string, unknown>}[],
  ): Promise<unknown>;
  /** 알림/버튼 응답 구독. 버튼 id 는 `actionIdentifier` 로 온다. */
  addNotificationResponseReceivedListener?(
    cb: (res: {actionIdentifier?: string}) => void,
  ): {remove(): void};
}

function mod(): NotificationsModule | null {
  try {
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null;
  }
}

let channelReady = false;

/**
 * 채널 1회 준비. **무음이어야 한다** — 이 알림은 3초마다 다시 게시되기 때문이다.
 *
 * ── 무음: 왜 importance 2(LOW) 인가 (2026-08-17 실기기 버그) ──────────────────
 * 민우님 갤럭시에서 러닝 중 **몇 초에 한 번씩 알림음**이 났다(앱의 음성 안내를 꺼도 났다).
 * 안드로이드 8+ 는 소리·진동이 **채널 속성**이고, 같은 id 로 다시 게시할 때마다 채널이
 * 소리를 갖고 있으면 **매번 다시 울린다**. 3초 스로틀이 곧 3초마다 알림음이었다.
 *
 * 흔한 해법인 `setOnlyAlertOnce(true)` 는 **expo-notifications 가 노출하지 않는다**
 * (56.0.22 확인 — 안드로이드 소스에 해당 호출이 없다). 그래서 채널로 풀어야 한다.
 *
 * v1 은 `importance: 3`(DEFAULT) 였다. **DEFAULT 는 정의상 소리를 낸다.**
 * `sound: null` 을 같이 줬지만 그것만 믿을 수 없다 — expo 의 채널 구현은
 * `args.containsKey("sound")` 가 거짓이면 **기본 알림음 URI 를 넣는다**
 * (`AndroidXNotificationsChannelManager.createSoundUriFromArguments`:
 *  *"The default is... the default sound."*). JS 의 `null` 이 직렬화에서 사라지면 그 길로 샌다.
 *
 * **importance 2(LOW) 는 그 모든 경우에서 안전하다** — 안드로이드는 LOW 이하 채널에
 * 소리·진동을 아예 주지 않는다(소리 URI 가 붙어 있어도 무시된다). 진행 상태를 계속
 * 갱신하는 알림에 LOW 를 쓰는 것이 안드로이드 권장이자 NRC·스트라바가 쓰는 방식이다.
 * 잠금화면·알림함 노출은 LOW 에서도 그대로다(잃는 것은 헤드업 배너뿐인데, 애초에 원치 않았다).
 *
 * 콘텐츠 쪽 `sound`/`vibrate` 플래그로 막는 길은 **일부러 쓰지 않는다** — expo 의
 * `shouldUseDefaultVibrationPattern` 이 `!getBoolean("vibrate", true)` 라서
 * `vibrate: false` 를 주면 오히려 '기본 진동 사용'이 참이 된다(상류 버그).
 * 그 위에 무음을 쌓는 건 모래 위에 짓는 것이다.
 */
async function ensureChannel(m: NotificationsModule): Promise<void> {
  if (channelReady) return;
  await m.setNotificationChannelAsync(CHANNEL_ID, {
    name: '러닝 중 기록',
    // LOW — 잠금화면·알림함에는 보이고, 소리·진동·헤드업은 없다. 위 주석 참조.
    importance: 2,
    sound: null,
    vibrationPattern: null,
    enableVibrate: false,
    showBadge: false,
  });
  // 구 채널을 지운다. 안 지우면 이용자 알림 설정에 '러닝 중 기록' 이 둘로 보이고,
  // 그중 하나는 우리가 더 이상 쓰지 않는데 소리가 켜져 있다.
  if (typeof m.deleteNotificationChannelAsync === 'function') {
    for (const old of LEGACY_CHANNEL_IDS) {
      try {
        await m.deleteNotificationChannelAsync(old);
      } catch {
        /* 없으면 그만 */
      }
    }
  }
  channelReady = true;
}

// ── 알림 액션 버튼 (2026-08-08) ──────────────────────────────────────────────
//
// 왜: 잠금화면에 지표를 띄워 놓고 **조작은 잠금을 풀어야만** 되게 두면, 이 알림의 목적을
// 반쯤 무효화한다. 특히 자동 일시정지가 걸린 걸 잠금화면에서 보고도 다시 뛰려면 폰을
// 꺼내 잠금을 풀어야 한다 — 달리는 중에 하기 가장 나쁜 동작이다.
// NRC·스트라바 안드로이드판은 알림에서 바로 조작된다.
//
// 두 개만 둔다. 알림 액션은 좁고, 러닝 중에 고를 수 있는 건 두 개가 한계다:
//   · 달리는 중  → [일시정지] [종료]
//   · 멈춘 중    → [재개]    [종료]
// '종료'는 **저장까지 하지 않는다** — 앱을 열어 완주 화면에서 저장/버리기를 고르게 한다.
// 잠금화면에서 되돌릴 수 없는 결정을 시키지 않는다(오탭 한 번에 러닝이 사라지면 안 된다).
export const RUN_ACTION = {
  pause: 'keego.run.pause',
  resume: 'keego.run.resume',
  stop: 'keego.run.stop',
} as const;
export type RunAction = (typeof RUN_ACTION)[keyof typeof RUN_ACTION];

/** 달리는 중 / 멈춘 중 각각의 카테고리 id. 버튼 구성이 달라 둘로 나눈다. */
const CATEGORY_RUNNING = 'keego.run.running';
const CATEGORY_PAUSED = 'keego.run.paused';
let categoriesReady = false;

async function ensureCategories(m: NonNullable<ReturnType<typeof mod>>): Promise<void> {
  if (categoriesReady) return;
  // 버튼은 **앱을 열지 않고** 처리한다(opensAppToForeground: false) — 달리는 중에 앱이
  // 튀어나오면 그게 더 방해다. 응답은 App 이 리스너로 받아 엔진에 전달한다.
  const opts = {opensAppToForeground: false};
  await m.setNotificationCategoryAsync(CATEGORY_RUNNING, [
    {identifier: RUN_ACTION.pause, buttonTitle: '일시정지', options: opts},
    {identifier: RUN_ACTION.stop, buttonTitle: '종료', options: opts},
  ]);
  await m.setNotificationCategoryAsync(CATEGORY_PAUSED, [
    {identifier: RUN_ACTION.resume, buttonTitle: '재개', options: opts},
    {identifier: RUN_ACTION.stop, buttonTitle: '종료', options: opts},
  ]);
  categoriesReady = true;
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
    await ensureCategories(m);
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
        // ⚠️ **채널 id 를 반드시 넘긴다**(2026-08-07 감사). 위에서 채널을 만들어 놓고
        // 여기에 안 넘기면 expo-notifications 가 그 채널을 못 찾아
        // `expo_notifications_fallback_notification_channel` 로 보낸다
        // (BaseNotificationBuilder). 그러면 위에서 정한 소리 없음·진동 없음·배지 없음·
        // **importance 2(LOW)** 가 전부 무시되고, 사용자 알림 설정에도 '러닝 중 기록' 이 아니라
        // 정체불명 채널명으로 보인다. 3초마다 갱신되는 알림이라 영향이 크다 —
        // 폴백 채널은 소리가 켜져 있어 **그 자체로 3초마다 알림음**이 된다.
        channelId: CHANNEL_ID,
        // 상태에 맞는 버튼 묶음. 달리는 중엔 [일시정지][종료], 멈춘 중엔 [재개][종료].
        categoryIdentifier: state.paused ? CATEGORY_PAUSED : CATEGORY_RUNNING,
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

/**
 * 알림 액션 버튼이 눌렸을 때 부를 콜백을 등록한다. 해제 함수를 돌려준다.
 *
 * expo-notifications 의 응답 리스너는 **알림 탭·버튼 탭을 같은 경로로** 준다.
 * 본문을 탭한 경우 `actionIdentifier` 가 기본값(`expo.modules.notifications.actions.DEFAULT`)
 * 이므로, 우리가 등록한 id 셋에 없으면 무시한다 — 그래야 알림을 그냥 눌렀을 때
 * 러닝이 멈추는 사고가 안 난다.
 *
 * 안드로이드 전용이지만 **플랫폼으로 막지 않는다** — 모듈이 없거나 리스너를 못 달면
 * 조용히 no-op 해제 함수를 돌려준다(호출부가 분기하지 않아도 되게).
 */
export function onRunNotificationAction(cb: (action: RunAction) => void): () => void {
  const m = mod();
  if (!m || typeof m.addNotificationResponseReceivedListener !== 'function') return () => {};
  try {
    const sub = m.addNotificationResponseReceivedListener(res => {
      const id = res?.actionIdentifier;
      if (id === RUN_ACTION.pause || id === RUN_ACTION.resume || id === RUN_ACTION.stop) {
        cb(id);
      }
    });
    return () => {
      try {
        sub?.remove();
      } catch {
        /* 이미 해제됨 */
      }
    };
  } catch {
    return () => {};
  }
}

/** 테스트 전용 — 채널 준비 플래그 초기화. */
export function __resetRunNotificationChannel(): void {
  channelReady = false;
  categoriesReady = false;
}
