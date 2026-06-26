// ============================================================================
// lib/liveActivity.ts — iOS Live Activity(잠금화면/다이내믹 아일랜드 러닝 위젯) JS 래퍼
// ActivityKit 네이티브 모듈(LiveActivityModule, ios/SoleMate/)을 호출한다. 모듈이 없거나
// (안드로이드·구버전·위젯 타깃 미생성) iOS 16.1 미만이면 전부 no-op — 앱은 그대로 동작한다.
// 러닝 시작 시 start, 진행 중 update(throttle), 종료/완주 시 end 를 부른다.
// ============================================================================
import {NativeModules, Platform} from 'react-native';

const M: any = NativeModules?.LiveActivityModule;
const available = Platform.OS === 'ios' && !!M && typeof M.start === 'function';

export const liveActivity = {
  available,
  /** 러닝 시작 — 잠금화면 위젯을 띄운다. shoeName/goalKm 은 정적, 나머지는 초기 상태. */
  start(shoeName: string, goalKm: number, distanceKm: number, elapsedSec: number, paceLabel: string, avgPaceLabel: string) {
    if (!available) return;
    try { M.start(shoeName || '', goalKm || 0, distanceKm || 0, elapsedSec || 0, paceLabel || '--', avgPaceLabel || '--'); } catch { /* noop */ }
  },
  /** 진행 상태 갱신(거리/시간/페이스). 호출자가 throttle 한다(ActivityKit 업데이트 예산). */
  update(distanceKm: number, elapsedSec: number, paceLabel: string, avgPaceLabel: string) {
    if (!available) return;
    try { M.update(distanceKm || 0, elapsedSec || 0, paceLabel || '--', avgPaceLabel || '--'); } catch { /* noop */ }
  },
  /** 러닝 종료/완주/취소 — 위젯을 닫는다. */
  end() {
    if (!available) return;
    try { M.end(); } catch { /* noop */ }
  },
};
