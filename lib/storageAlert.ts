// ============================================================================
// lib/storageAlert.ts — 저장 실패를 사용자에게 알릴지 결정한다(순수 + 얇은 표시)
// ----------------------------------------------------------------------------
// 왜 필요한가(2026-07-26 출시 심사 TOP30 #28): 부팅 캐시 쓰기가 실패하면 지금까지는
// recordError 로 **계측만** 했다. 사용자는 아무것도 못 본다. 그런데 결과는 조용하지 않다 —
// 캐시가 낡은 채 굳어서, 다음에 오프라인으로 앱을 열면 며칠 전 상태가 '현재'로 보인다.
// 러닝 화면에는 이미 '백업 안 됨' 한 줄이 있지만(snapshotFailing), **앱 전반**은 침묵이었다.
//
// 설계 원칙:
//   · 한 번의 실패로 소리치지 않는다 — 일시적 실패(경합·순간 압박)는 다음 쓰기에서 낫는다.
//     연속 실패가 임계에 닿을 때만 알린다.
//   · 같은 말을 반복하지 않는다 — 쿨다운 안에서는 한 번만.
//   · 성공하면 카운터를 되돌린다(회복되면 조용해진다).
//   · 알림은 토스트 한 줄 — 다이얼로그로 흐름을 막지 않는다(러닝 중일 수도 있다).
//
// 판정은 순수 함수(shouldAlertStorage)로 분리해 테스트한다. 표시는 lib/toast 에 위임.
// ============================================================================
import {showToast} from './toast';

/** 연속 실패가 이만큼 쌓이면 알린다(1회는 일시적일 수 있다). */
export const STORAGE_FAIL_THRESHOLD = 2;

/** 같은 안내를 다시 띄우기까지의 최소 간격(ms) — 10분. */
export const STORAGE_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

/** 사용자에게 보이는 문구 — 원인(공간)과 결과(저장 안 됨)를 함께 말한다. */
export const STORAGE_ALERT_MESSAGE = '저장 공간이 부족해요 — 기록이 저장되지 않을 수 있어요';

export interface StorageAlertState {
  /** 연속 실패 횟수. */
  fails: number;
  /** 마지막으로 알린 시각(ms, 없으면 0). */
  lastAlertMs: number;
}

export const initialStorageAlertState = (): StorageAlertState => ({fails: 0, lastAlertMs: 0});

/**
 * 저장 결과를 받아 다음 상태와 '지금 알릴지'를 정한다(순수).
 *
 * @param state 현재 상태
 * @param ok    이번 저장이 성공했는지
 * @param nowMs 현재 시각
 */
export function shouldAlertStorage(
  state: StorageAlertState,
  ok: boolean,
  nowMs: number,
  threshold: number = STORAGE_FAIL_THRESHOLD,
  cooldownMs: number = STORAGE_ALERT_COOLDOWN_MS,
): {state: StorageAlertState; alert: boolean} {
  if (ok) {
    // 회복 — 카운터만 되돌린다. 쿨다운은 유지(방금 알렸다면 곧바로 다시 알리지 않는다).
    return {state: {...state, fails: 0}, alert: false};
  }
  const fails = state.fails + 1;
  const due = fails >= threshold;
  const cooled = nowMs - state.lastAlertMs >= cooldownMs;
  if (due && cooled) {
    return {state: {fails, lastAlertMs: nowMs}, alert: true};
  }
  return {state: {...state, fails}, alert: false};
}

// ── 앱 전역 상태(모듈 스코프) ────────────────────────────────────────────────
// 저장 실패는 여러 경로(런 캐시·부팅 캐시·동기 후 캐시)에서 발생하므로 한 곳에서 센다.
let state = initialStorageAlertState();

/** 테스트 전용 — 상태를 초기화한다. */
export function __resetStorageAlertForTests(): void {
  state = initialStorageAlertState();
}

/** 현재 연속 실패 횟수(관측용). */
export function storageFailCount(): number {
  return state.fails;
}

/**
 * 저장 결과를 보고한다. 임계에 닿으면 토스트로 알린다.
 * 절대 throw 하지 않는다 — 알림 코드가 저장 경로를 죽이면 안 된다.
 */
export function reportStorageResult(ok: boolean, nowMs: number = Date.now()): void {
  try {
    const next = shouldAlertStorage(state, ok, nowMs);
    state = next.state;
    if (next.alert) {
      showToast({message: STORAGE_ALERT_MESSAGE});
    }
  } catch {
    /* 알림 실패는 무시 */
  }
}

// ─── 클라우드 동기 실패 알림 (AUDIT 3 D-1) ────────────────────────────────────
//
// 왜 필요한가: 캐시 쓰기 실패는 위처럼 사용자에게 알리면서, **클라우드 동기 실패는
// Crashlytics 로만 갔다.** 사용자에겐 침묵이었다. 그런데 결과는 조용하지 않다 —
// 백업이 멎은 채 몇 주가 지나고, 기기를 바꾸거나 앱을 지웠을 때 **그 사이의 모든 기록이
// 없다는 걸 그때 처음 안다.**
//
// 저장 실패보다 임계를 높게 잡는다(3회). 동기 실패는 지하철·엘리베이터 같은 일시적
// 오프라인으로도 나므로, 한두 번에 알리면 늑대 소년이 된다. 쿨다운은 더 길게(1시간) —
// 오프라인이 오래가는 상황에서 10분마다 같은 말을 하면 그게 더 성가시다.

/** 동기 연속 실패가 이만큼 쌓이면 알린다(일시적 오프라인은 넘긴다). */
export const SYNC_FAIL_THRESHOLD = 3;

/** 같은 안내를 다시 띄우기까지의 최소 간격(ms) — 1시간. */
export const SYNC_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** 사용자에게 보이는 문구 — 무엇이 안 되고 있는지, 그래서 뭐가 위험한지. */
export const SYNC_ALERT_MESSAGE = '기록이 클라우드에 백업되지 않고 있어요 — 연결을 확인해 주세요';

let syncState = initialStorageAlertState();

/** 테스트 전용 — 동기 알림 상태 초기화. */
export function __resetSyncAlertForTests(): void {
  syncState = initialStorageAlertState();
}

/** 현재 동기 연속 실패 횟수(관측용). */
export function syncFailCount(): number {
  return syncState.fails;
}

/**
 * 클라우드 동기 결과를 보고한다. 임계에 닿으면 토스트로 알린다.
 * 판정 로직은 저장 실패와 같은 순수 함수를 쓰되(shouldAlertStorage) 임계·쿨다운만 다르다.
 * 절대 throw 하지 않는다.
 */
export function reportSyncResult(ok: boolean, nowMs: number = Date.now()): void {
  try {
    const next = shouldAlertStorage(syncState, ok, nowMs, SYNC_FAIL_THRESHOLD, SYNC_ALERT_COOLDOWN_MS);
    syncState = next.state;
    if (next.alert) showToast({message: SYNC_ALERT_MESSAGE});
  } catch {
    /* 알림 실패는 무시 */
  }
}
