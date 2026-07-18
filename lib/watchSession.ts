// ============================================================================
// lib/watchSession.ts — Apple Watch 연결(WatchConnectivity → RN)의 JS 포트
// 네이티브 WatchSessionModule(RCTEventEmitter)과의 계약을 이 모듈이 소유한다:
//   · 'onHeartRate'  — 워치 실시간 심박(bpm) 스트림.
//   · 'onWatchRun'   — 워치 단독 러닝 완주 페이로드(수신부가 runId 로 중복 방어).
//   · updateShoes    — 활성 신발 목록·심박존 파라미터를 워치에 푸시(applicationContext).
// 모듈이 없거나(안드로이드·미페어링·구버전) iOS 가 아니면 전부 no-op —
// 구독은 즉시 해제 함수만 돌려주고 앱은 그대로 동작한다.
// 사용: const off = watchSession.onHeartRate(setHeartRate); ... off();
// ============================================================================
import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const M: any = NativeModules?.WatchSessionModule;
const available = Platform.OS === 'ios' && !!M;
const emitter = available ? new NativeEventEmitter(M) : null;

/** 워치 시작 화면에 뿌려지는 활성 신발 한 켤레(폰 Shoe 의 워치 표시용 축약). */
export type WatchShoePayload = {
  id: string;
  brand: string;
  model: string;
  /** 남은 수명 % (0–100). */
  lifePct: number;
  /** 컨디션 '양호'|'주의'|'교체' — 워치 도트 의미색 매핑. 구버전 워치 호환 계약이라
   *  폰 UI 가 4단계 wearTier 로 이행(2026-07-11)한 뒤에도 3단계 값을 계속 보낸다
   *  (App 이 conditionForPercent 로 직접 파생 — 임계 80/90 은 4단계와 동일). */
  condition: string;
  /** 사용 거리 km(반올림 정수) — 워치 시작 카드 '사용/남음' 줄. */
  usedKm: number;
  /** 수명 한도 km(반올림 정수). 0 이면 워치가 사용/남음 줄을 생략. */
  maxKm: number;
};

/** 워치 단독 러닝 완주 페이로드(워치 WatchLink.sendRun 과 동일 키). */
export type WatchRunPayload = {
  /** 워치가 발급한 중복 방어 키(watch-<uuid>). */
  runId: string;
  /** 러닝에 쓴 keego 신발 id. 워치 미선택이면 ''. */
  shoeId: string;
  km: number;
  durationS: number;
  avgBpm: number;
  kcal: number;
  startMs: number;
  endMs: number;
};

/** 워치가 러닝 끝에 직송하는 심박 기록(정본 경로 A). 오프셋·bpm 병렬 배열. */
export type WatchHrTrackPayload = {
  /** 워치 워크아웃 시작/종료(ms) — 폰 런과 시간창 매칭용. */
  startMs: number;
  endMs: number;
  /** 워치 시작 기준 초 오프셋. */
  offsetS: number[];
  /** 각 오프셋의 심박(bpm). */
  bpm: number[];
};

export const watchSession = {
  available,
  /** 실시간 심박(bpm, 양수) 구독. 해제 함수를 돌려준다. */
  onHeartRate(cb: (bpm: number) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onHeartRate', (e: any) => {
      const bpm = Math.round(Number(e?.bpm) || 0);
      if (bpm > 0) cb(bpm);
    });
    return () => sub.remove();
  },
  /**
   * 워치 단독 러닝 완주 수신. 숫자 필드를 정규화하고 무효 페이로드(runId 없음·거리 0)는
   * 거른다. 같은 런이 메시지+큐로 두 번 올 수 있으므로 수신부는 runId 로 중복 방어할 것.
   */
  onWatchRun(cb: (run: WatchRunPayload) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onWatchRun', (e: any) => {
      const runId = String(e?.runId || '');
      const km = Number(e?.km) || 0;
      if (!runId || !(km > 0)) return; // 무효 페이로드 — 조용히 무시(graceful)
      cb({
        runId,
        shoeId: String(e?.shoeId || ''),
        km,
        durationS: Math.max(0, Number(e?.durationS) || 0),
        avgBpm: Math.max(0, Number(e?.avgBpm) || 0),
        kcal: Math.max(0, Number(e?.kcal) || 0),
        startMs: Math.max(0, Number(e?.startMs) || 0),
        endMs: Math.max(0, Number(e?.endMs) || 0),
      });
    });
    return () => sub.remove();
  },
  /**
   * 워치가 러닝 끝에 직송하는 심박 기록 수신(정본 경로 A). transferUserInfo(배달 보장)라
   * 폰이 내내 주머니에 있어도 앱이 깨는 순간 배달된다 — HealthKit 동기화 타이밍과 무관.
   * 무효(창 뒤집힘·표본 2개 미만)는 거른다. 수신부가 시간창으로 폰 런과 매칭해 저장한다.
   */
  onWatchHrTrack(cb: (p: WatchHrTrackPayload) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onWatchHrTrack', (e: any) => {
      const startMs = Math.max(0, Number(e?.startMs) || 0);
      const endMs = Math.max(0, Number(e?.endMs) || 0);
      const offsetS = Array.isArray(e?.offsetS) ? e.offsetS.map((x: any) => Number(x) || 0) : [];
      const bpm = Array.isArray(e?.bpm) ? e.bpm.map((x: any) => Number(x) || 0) : [];
      if (!(startMs < endMs) || bpm.length < 2) return; // 무효 — 조용히 무시
      cb({startMs, endMs, offsetS, bpm});
    });
    return () => sub.remove();
  },
  /**
   * 워치에서 사용자가 러닝을 종료했을 때(정지 미러링) 수신. cmdAtMs = 워치에서 정지를
   * 누른 절대시각(ms). 배달 보장 큐로 늦게 올 수 있으므로, 수신부는 '현재 러닝 시작
   * 이후의 정지'만 존중해야 한다(스테일 정지가 다음 러닝을 죽이지 않게).
   */
  onWatchStop(cb: (cmdAtMs: number) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onWatchStop', (e: any) => {
      cb(Math.max(0, Number(e?.cmdAtMs) || 0));
    });
    return () => sub.remove();
  },
  /**
   * 활성 신발 목록(홈과 같은 최근착용순) + 심박존 파라미터를 워치에 푸시한다.
   * applicationContext 라 워치가 꺼져 있어도 다음 실행 때 도착·캐시된다(오프라인 폴백).
   * 네이티브 미지원/구버전이면 no-op.
   */
  updateShoes(shoes: WatchShoePayload[], hr?: {max?: number; rest?: number}): void {
    if (!available || !M?.updateShoeContext) return;
    try {
      M.updateShoeContext({
        shoes,
        hrMax: hr?.max && hr.max > 0 ? Math.round(hr.max) : 0,
        hrRest: hr?.rest && hr.rest > 0 ? Math.round(hr.rest) : 0,
      });
    } catch {
      /* no-op — 워치 동기화 실패가 앱을 깨면 안 된다 */
    }
  },
  /**
   * 러닝 시작 시 페어링된 애플워치의 워크아웃을 자동 실행한다(startWatchApp) → 손목을
   * 만지지 않아도 심박이 흐른다. 워치 미페어링/미설치·구버전 네이티브면 조용히 false.
   * 실패해도 앱은 그대로 동작(심박만 '--').
   */
  async startWorkout(): Promise<boolean> {
    if (!available || !M?.startWatchWorkout) return false;
    try {
      return !!(await M.startWatchWorkout());
    } catch {
      return false;
    }
  },
  /** 러닝 종료 시 워치 워크아웃도 종료. 네이티브 미지원이면 no-op. */
  stopWorkout(): void {
    try {
      M?.stopWatchWorkout?.();
    } catch {
      /* no-op */
    }
  },
  /**
   * 햅틱(진동) on/off 를 워치에 알린다 — 워치의 자동 랩 진동·존 이탈 햅틱이 이 플래그를
   * 존중한다(applicationContext 병합, 오프라인이어도 다음 실행 때 도착). 폰 Vibration 은
   * lib/haptics.setHapticsEnabled 가 따로 지배하므로, 이 메서드는 워치측 전달 전용이다.
   * 네이티브 미지원/구버전이면 no-op(워치는 플래그 미수신 시 기본 ON — 기존 동작 유지).
   */
  setHaptics(enabled: boolean): void {
    try {
      M?.setWatchHaptics?.(!!enabled);
    } catch {
      /* no-op — 워치 동기화 실패가 앱을 깨면 안 된다 */
    }
  },
  /**
   * 심박존 이탈 햅틱을 워치로 보낸다(#8). zoneCoach 가 음성 알림을 낼 때 짝으로 호출 —
   * 'up'=목표보다 낮음(올려라), 'down'=높음(낮춰라)을 워치 방향 햅틱으로 전달한다.
   * 워치 미도달·미페어링·구버전 네이티브면 조용히 no-op(진동은 실시간이라 큐잉 안 함).
   */
  zoneHaptic(dir: 'up' | 'down'): void {
    try {
      M?.sendZoneHaptic?.(dir);
    } catch {
      /* no-op — 햅틱 전송 실패가 러닝을 깨면 안 된다 */
    }
  },
};
