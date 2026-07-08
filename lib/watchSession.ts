// ============================================================================
// lib/watchSession.ts — Apple Watch 실시간 심박 구독(WatchConnectivity → RN)
// 네이티브 WatchSessionModule(RCTEventEmitter)이 보내는 'onHeartRate' 이벤트를 받아
// 콜백으로 흘려보낸다. 모듈이 없거나(안드로이드·미페어링·구버전) iOS 가 아니면 no-op —
// 구독은 즉시 해제 함수만 돌려주고 앱은 그대로 동작한다.
// 사용: const off = watchSession.onHeartRate(setHeartRate); ... off();
// ============================================================================
import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const M: any = NativeModules?.WatchSessionModule;
const available = Platform.OS === 'ios' && !!M;
const emitter = available ? new NativeEventEmitter(M) : null;

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
};
