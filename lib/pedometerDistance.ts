// lib/pedometerDistance.ts — CMPedometer 누적 이동거리(m) 구독(폰, iOS).
// ----------------------------------------------------------------------------
// 네이티브 PedometerDistanceModule(ios/SoleMate/PedometerDistanceModule.swift)의 JS 포트.
// 러닝 거리 융합(#16): GPS 가 정본이고, 여기서 오는 가속도계 기반 누적거리는
// runTracker.feedPedometerDistance 로 흘러가 **GPS 死구간에서만** 유실분을 메운다.
//
// 계약(watchSession 과 동일한 graceful 원칙):
//   · available=false(안드로이드/미링크/미지원): 전부 no-op — 구독은 해제 함수만 돌려준다.
//   · onDistance: 유효한(유한·비음수) 누적 미터만 콜백에 전달.
//   · 네이티브 예외는 삼켜 러닝을 막지 않는다(거리 정본은 GPS — 융합 실패해도 무해).
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

const mod =
  Platform.OS === 'ios' ? (NativeModules as {PedometerDistanceModule?: unknown}).PedometerDistanceModule : null;
const emitter = mod ? new NativeEventEmitter(mod as never) : null;

export const pedometerDistance = {
  available: !!mod,

  /** 러닝 시작 시 — CMPedometer 누적거리 스트림을 켠다(미지원/거부는 네이티브에서 no-op). */
  start(): void {
    try {
      (mod as {startPedometerUpdates?: () => void} | null)?.startPedometerUpdates?.();
    } catch {
      /* 브리지 부재/예외 — 러닝은 GPS 로 계속 */
    }
  },

  /** 러닝 종료 시 — 스트림을 끈다(배터리·프라이버시). */
  stop(): void {
    try {
      (mod as {stopPedometerUpdates?: () => void} | null)?.stopPedometerUpdates?.();
    } catch {
      /* no-op */
    }
  },

  /** 누적거리(m) 이벤트 구독 — 해제 함수 반환. 모듈 부재면 no-op 해제만 돌려준다. */
  onDistance(cb: (meters: number) => void): () => void {
    if (!emitter) return () => {};
    const sub = emitter.addListener('onPedometerDistance', (e: {meters?: number}) => {
      const m = Number(e?.meters);
      if (Number.isFinite(m) && m >= 0) cb(m);
    });
    return () => sub.remove();
  },
};
